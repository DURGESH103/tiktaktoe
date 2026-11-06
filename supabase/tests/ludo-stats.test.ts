import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [R, Y, Z] = [151, 152, 153].map(uid); // Rahul (host, red), Durgesh (yellow), Zed (outsider)
let t: Db;
let room: Row;
const one = async (who: string | null, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
const game = async (id: string) => (await t.db.query<Row>("select * from ludo_games where id = $1", [id])).rows[0];
const queueDice = (values: number[]) => t.db.query("insert into ludo_test_dice (room_id, value) select $1, unnest($2::smallint[])", [room.id, values]);
const roll = (who: string, g: Row) => one(who, "select * from roll_dice($1, $2)", [g.id, g.seq]);
/** Test-only shortcut: put tokens somewhere and give the turn to `turn` (roll phase). */
const setUp = (g: Row, tokens: Record<string, number[]>, turn: string) =>
  t.db.query("update ludo_games set state = state || jsonb_build_object('tokens', $2::jsonb, 'turn', $3::text, 'phase', 'roll', 'dice', null, 'sixes', 0) where id = $1", [g.id, JSON.stringify(tokens), turn]);
const myLudo = async (who: string) => (await one(who, "select get_my_ludo() as j")).j;
const startGame = async () => {
  await one(Y, "select * from set_ludo_ready($1, true)", [room.id]);
  return one(R, "select * from start_ludo($1)", [room.id]);
};

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[R, "Rahul"], [Y, "Durgesh"], [Z, "Zed"]]) await t.addPlayer(id, name);
  room = await one(R, "select * from create_room_for('ludo')");
  await one(R, "select * from set_ludo_options($1, 2, 'classic')", [room.id]); // red vs yellow
  await one(Y, "select * from join_room($1)", [room.code]);
});

describe("Ludo results and stats", () => {
  it("counts captures and records everyone's place when a game finishes", async () => {
    let g = await startGame();
    // Red on 10, yellow on red's square 12 (not safe): red rolls 2 → the only move → capture.
    await setUp(g, { red: [10, -1, -1, -1], yellow: [38, -1, -1, -1] }, "red");
    await queueDice([2]);
    g = await roll(R, await game(g.id));
    expect(g.state.tokens.yellow[0]).toBe(-1);
    expect((await game(g.id)).captures).toEqual({ red: 1 });
    // Red one step from finishing.
    await setUp(g, { red: [56, 56, 56, 55], yellow: [-1, -1, -1, -1] }, "red");
    await queueDice([1]);
    await roll(R, await game(g.id));
    const rows = (await t.db.query<Row>("select player_id, color, place, players, captures, forfeited, mode from ludo_results where game_id = $1 order by place", [g.id])).rows;
    expect(rows).toEqual([
      { player_id: R, color: "red", place: 1, players: 2, captures: 1, forfeited: false, mode: "classic" },
      { player_id: Y, color: "yellow", place: 2, players: 2, captures: 0, forfeited: false, mode: "classic" },
    ]);
  });

  it("get_my_ludo: stats (podium = top 3, never last place) and history with standings", async () => {
    const r = await myLudo(R);
    expect(r.stats).toMatchObject({ games: 1, wins: 1, podiums: 1, captures: 1, current_win_streak: 1, best_win_streak: 1 });
    expect(r.games).toHaveLength(1);
    expect(r.games[0]).toMatchObject({ place: 1, players: 2, captures: 1, mode: "classic" });
    expect(r.games[0].standings.map((s: Row) => [s.player.name, s.place, s.color])).toEqual([
      ["Rahul", 1, "red"],
      ["Durgesh", 2, "yellow"],
    ]);
    expect((await myLudo(Y)).stats).toMatchObject({ games: 1, wins: 0, podiums: 0, captures: 0, current_win_streak: 0 });
  });

  it("win streaks: a loss ends the current streak, the best is kept", async () => {
    const g = await startGame();
    await setUp(g, { red: [-1, -1, -1, -1], yellow: [56, 56, 56, 55] }, "yellow");
    await queueDice([1]);
    await roll(Y, await game(g.id));
    expect((await myLudo(R)).stats).toMatchObject({ games: 2, wins: 1, current_win_streak: 0, best_win_streak: 1 });
    const y = await myLudo(Y);
    expect(y.stats).toMatchObject({ games: 2, wins: 1, current_win_streak: 1 });
    expect(y.games.map((x: Row) => x.place)).toEqual([1, 2]); // newest first
  });

  it("public profiles show Ludo stats (Tic-Tac-Toe stats unchanged)", async () => {
    const { handle } = (await t.db.query<Row>("select handle from players where id = $1", [R])).rows[0];
    const p = (await one(null, "select get_public_profile($1) as j", [handle])).j;
    expect(p.ludo).toMatchObject({ games: 2, wins: 1, podiums: 1, captures: 1 });
    expect(p.stats).toMatchObject({ total: 0 });
    expect(p.recent).toEqual([]);
  });

  it("results are private: only through the functions", async () => {
    expect(await errorOf(t.as(Z, "select * from ludo_results"))).toBeTruthy();
    expect(await errorOf(t.as(null, "select get_my_ludo()"))).toBeTruthy();
    expect((await myLudo(Z)).stats).toMatchObject({ games: 0, wins: 0, best_win_streak: 0 });
  });
});
