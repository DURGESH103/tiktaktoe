import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [R, Y, G, Z] = [121, 122, 123, 124].map(uid); // Rahul (host, red), Durgesh (yellow), Priya, Zed (outsider)
let t: Db;
const one = async (who: string | null, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
const game = async (id: string) => (await t.db.query<Row>("select * from ludo_games where id = $1", [id])).rows[0];
/** Scripted dice, as the e2e test does with the service key (here: as the database owner). */
const queueDice = (roomId: string, values: number[]) =>
  t.db.query(`insert into ludo_test_dice (room_id, value) select $1, unnest($2::smallint[])`, [roomId, values]);

/** A started 2-player Classic table: Rahul red, Durgesh yellow. */
async function startedTable(mode = "classic") {
  const room = await one(R, "select * from create_room_for('ludo')");
  await one(R, "select * from set_ludo_options($1, 2, $2)", [room.id, mode]);
  await one(Y, "select * from join_room($1)", [room.code]);
  await one(Y, "select * from set_ludo_ready($1, true)", [room.id]);
  const g = await one(R, "select * from start_ludo($1)", [room.id]);
  return { room, g };
}
const roll = (who: string, g: Row) => one(who, "select * from roll_dice($1, $2)", [g.id, g.seq]);
const moveTok = (who: string, g: Row, tok: number) => one(who, "select * from move_token($1, $2, $3)", [g.id, tok, g.seq]);

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[R, "Rahul"], [Y, "Durgesh"], [G, "Priya"], [Z, "Zed"]]) await t.addPlayer(id, name);
});

describe("starting a game", () => {
  it("only the host, only when everyone is ready, at least 2 players", async () => {
    const room = await one(R, "select * from create_room_for('ludo')");
    expect(await errorOf(one(R, "select * from start_ludo($1)", [room.id]))).toBe("NOT_ENOUGH_PLAYERS");
    await one(Y, "select * from join_room($1)", [room.code]);
    expect(await errorOf(one(R, "select * from start_ludo($1)", [room.id]))).toBe("NOT_ALL_READY");
    await one(Y, "select * from set_ludo_ready($1, true)", [room.id]);
    expect(await errorOf(one(Y, "select * from start_ludo($1)", [room.id]))).toBe("NOT_HOST");
    const g = await one(R, "select * from start_ludo($1)", [room.id]);
    expect(g).toMatchObject({ status: "playing", mode: "classic", seq: 0, seats: { red: R, green: Y } });
    expect(g.state).toMatchObject({ colors: ["red", "green"], turn: "red", phase: "roll" });
    expect((await t.db.query<Row>("select status from rooms where id = $1", [room.id])).rows[0].status).toBe("playing");
    expect(await errorOf(one(R, "select * from start_ludo($1)", [room.id]))).toBe("GAME_STARTED");
    expect(await errorOf(one(Z, "select * from join_room($1)", [room.code]))).toBe("GAME_STARTED"); // nobody joins mid-game
  });

  it("Quick mode starts with one token out each; 2 players sit red/yellow", async () => {
    const { g } = await startedTable("quick");
    expect(g.state.tokens).toEqual({ red: [0, -1, -1, -1], yellow: [0, -1, -1, -1] });
  });
});

describe("fair play", () => {
  it("only the player whose turn it is can roll or move; outsiders can't see or touch the game", async () => {
    const { g } = await startedTable();
    expect(await errorOf(roll(Y, g))).toBe("NOT_YOUR_TURN");
    expect(await errorOf(roll(Z, g))).toBe("GAME_NOT_FOUND");
    expect(await t.as(Z, "select id from ludo_games where id = $1", [g.id])).toEqual([]);
    expect((await t.as(Y, "select id from ludo_games where id = $1", [g.id])).length).toBe(1);
    expect(await errorOf(t.as(R, "update ludo_games set state = '{}' where id = $1", [g.id]))).toMatch(/permission denied/);
  });

  it("the app can't choose the dice: there's no dice parameter, and test dice are off-limits to players", async () => {
    const { g, room } = await startedTable();
    expect(await errorOf(one(R, "select * from roll_dice($1, $2, 6)", [g.id, g.seq]))).toMatch(/function .*roll_dice.* does not exist/);
    expect(await errorOf(t.as(R, "insert into ludo_test_dice (room_id, value) values ($1, 6)", [room.id]))).toMatch(/permission denied/);
    expect(await errorOf(t.as(R, "select * from ludo_test_dice"))).toMatch(/permission denied/);
    expect(await errorOf(t.as(R, "select public._ludo_draw_die($1)", [room.id]))).toMatch(/permission denied/);
    // Real dice are always 1–6 and every face shows up.
    const faces = (await t.db.query<Row>("select public._ludo_draw_die($1) as d from generate_series(1, 600)", [room.id])).rows.map((x) => x.d);
    expect(new Set(faces)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it("an illegal move is refused (wrong token, not your move yet, yard token without a 6)", async () => {
    const { g, room } = await startedTable("quick");
    expect(await errorOf(moveTok(R, g, 0))).toBe("NOT_MOVE_PHASE");
    await queueDice(room.id, [6]);
    const after6 = await roll(R, g); // red: token 0 on the loop + 3 in the yard → two different choices
    expect(after6.state).toMatchObject({ phase: "move", dice: 6 });
    expect(await errorOf(moveTok(R, after6, 7))).toBe("ILLEGAL_MOVE");
    const moved = await moveTok(R, after6, 1); // bring a second token out
    expect(moved.state.tokens.red).toEqual([0, 0, -1, -1]);
    await queueDice(room.id, [2]);
    const after2 = await roll(R, moved);
    // Tokens 0 and 1 share a square, so the 2 is a single choice: played automatically.
    expect(after2.state).toMatchObject({ turn: "yellow", phase: "roll", tokens: { red: [2, 0, -1, -1] } });
  });

  it("two taps at once: the second is refused (seq), so nothing is applied twice", async () => {
    const { g, room } = await startedTable("quick");
    await queueDice(room.id, [6, 4]);
    const first = await roll(R, g);
    expect(await errorOf(roll(R, g))).toBe("STALE_MOVE"); // same seq as the first tap
    const moved = await moveTok(R, first, 2);
    expect(await errorOf(moveTok(R, first, 3))).toBe("STALE_MOVE");
    expect(moved.state.tokens.red).toEqual([0, -1, 0, -1]);
    expect(moved.seq).toBe(2);
  });
});

describe("a scripted game on the server", () => {
  it("capture sends the token home with an extra roll; finishing returns the table to the lobby", async () => {
    const { g, room } = await startedTable("quick");
    // Red p0 (square 0), yellow p0 (square 26). Red 6 → choice: move token 0 to p6.
    await queueDice(room.id, [6]);
    let s = await moveTok(R, await roll(R, g), 0); // red [6,-1,-1,-1], extra roll
    await queueDice(room.id, [2]);
    s = await roll(R, s); // red p8 (star square 8), turn → yellow
    expect(s.state).toMatchObject({ turn: "yellow", tokens: { red: [8, -1, -1, -1] } });
    await queueDice(room.id, [3]);
    s = await roll(Y, s); // yellow p3 = square 29, auto-move (single choice)
    expect(s.state.tokens.yellow).toEqual([3, -1, -1, -1]);
    // Red needs p29: 8 + 21 → 6, 6, 6 would be three sixes; use 5 then later.
    await queueDice(room.id, [5]);
    s = await roll(R, s); // red p13 (square 13 = green start, safe). Turn → yellow.
    await queueDice(room.id, [1]);
    s = await roll(Y, s); // yellow p4 = square 30
    await queueDice(room.id, [6]);
    s = await moveTok(R, await roll(R, s), 0); // red p19
    await queueDice(room.id, [6]);
    s = await moveTok(R, await roll(R, s), 0); // red p25 (sixes = 2)
    await queueDice(room.id, [5]);
    s = await roll(R, s); // red p30 = square 30 → captures yellow!
    const cap = s.last_events.find((e: Row) => e.type === "move");
    expect(cap).toMatchObject({ to: 30, captured: [{ color: "yellow", token: 0, from: 4 }], extra: true });
    expect(s.state).toMatchObject({ turn: "red", phase: "roll", tokens: { yellow: [-1, -1, -1, -1] } });

    // Fast-forward to the end: put red one step from finishing, then roll the 1.
    await t.db.query(
      "update ludo_games set state = jsonb_set(state, '{tokens,red}', '[56,56,56,55]') where id = $1",
      [g.id],
    );
    s = await game(g.id);
    await queueDice(room.id, [1]);
    s = await roll(R, s);
    expect(s).toMatchObject({ status: "finished" });
    expect(s.state).toMatchObject({ finished: true, placements: ["red", "yellow"] });
    expect(s.ended_at).not.toBeNull();
    const r = (await t.db.query<Row>("select status from rooms where id = $1", [room.id])).rows[0];
    expect(r.status).toBe("waiting");
    const seats = (await t.db.query<Row>("select player_id, ready from room_players where room_id = $1 order by seat", [room.id])).rows;
    expect(seats.map((x) => x.ready)).toEqual([true, false]); // guests press Ready again for the next game
    expect(await errorOf(roll(Y, s))).toBe("GAME_NOT_PLAYING");
  });

  it("test dice are used once, in order, then real random dice take over", async () => {
    const { g, room } = await startedTable();
    await queueDice(room.id, [4, 3]);
    expect((await roll(R, g)).last_roll).toBe(4);
    expect((await t.db.query<Row>("select count(*)::int as n from ludo_test_dice where room_id = $1", [room.id])).rows[0].n).toBe(1);
  });
});
