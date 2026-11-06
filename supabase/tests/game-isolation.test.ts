// Proves that other games' rooms never leak into Tic-Tac-Toe or Couple Challenge data:
// Ludo rooms set player_x = host (and never player_o); Couple rooms use player_x/player_o too.
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [A, B, C] = [111, 112, 113].map(uid); // Rahul, Durgesh, Carol
let t: Db;
const h: Record<string, string> = {};
const one = async (who: string | null, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
let tttRoom: Row, coupleRoom: Row, ludoRoom: Row;

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[A, "Rahul"], [B, "Durgesh"], [C, "Carol"]]) {
    await t.addPlayer(id, name);
    h[id] = (await t.db.query<Row>("select handle from players where id = $1", [id])).rows[0].handle;
  }
  await one(A, "select send_friend_request($1)", [h[B]]);
  await one(B, "select respond_friend_request($1, true)", [h[A]]);

  // One real Tic-Tac-Toe game: Rahul (X) wins the top row.
  tttRoom = await one(A, "select * from create_room()");
  await one(B, "select * from join_room($1)", [tttRoom.code]);
  const g = (await t.db.query<Row>("select id from games where room_id = $1", [tttRoom.id])).rows[0];
  for (const [who, cell] of [[A, 0], [B, 3], [A, 1], [B, 4], [A, 2]] as const) await one(who, "select * from make_move($1, $2)", [g.id, cell]);

  // A Couple room with a session, and a Ludo room — the same two players in both.
  coupleRoom = await one(A, "select * from create_room_for('couple')");
  await one(B, "select * from join_room($1)", [coupleRoom.code]);
  await one(A, "select * from start_session($1, 'compatibility', 'food')", [coupleRoom.id]);
  ludoRoom = await one(A, "select * from create_room_for('ludo')");
  await one(B, "select * from join_room($1)", [ludoRoom.code]);
});

describe("Tic-Tac-Toe data only counts Tic-Tac-Toe rooms", () => {
  it("stats, head-to-head, public profile and friends list show exactly the one Tic-Tac-Toe game", async () => {
    const prof = (await one(B, "select get_public_profile($1) as p", [h[A]])).p;
    expect(prof.stats).toMatchObject({ total: 1, wins: 1, losses: 0, draws: 0 });
    expect(prof.head_to_head).toMatchObject({ total: 1, losses: 1 }); // from Durgesh's side
    expect(prof.recent).toHaveLength(1);
    const mine = (await one(A, "select get_my_stats() as s", [])).s;
    expect(mine.head_to_head.map((x: Row) => [x.opponent.name, x.total])).toEqual([["Durgesh", 1]]);
    const friends = (await one(A, "select get_friends() as f", [])).f;
    expect(friends.friends[0].head_to_head).toMatchObject({ total: 1, wins: 1 });
  });

  it("even a stray Tic-Tac-Toe round inside a Ludo or Couple room is ignored and can't be played", async () => {
    // Simulates bad data (only possible with direct database access).
    for (const room of [ludoRoom, coupleRoom]) {
      await t.addRound(room.id, 1, "X", "2030-01-01T00:00:00Z");
    }
    const stray = await t.db.query<Row>(
      "insert into games (room_id, round, starting_turn, current_turn) values ($1, 2, 'X', 'X') returning id",
      [ludoRoom.id],
    );
    expect((await one(B, "select get_public_profile($1) as p", [h[A]])).p.stats.total).toBe(1);
    expect(await errorOf(one(A, "select * from make_move($1, 4)", [stray.rows[0].id]))).toBe("GAME_NOT_FOUND");
  });

  it("rematch is refused outside Tic-Tac-Toe rooms (it used to create a round in a Couple room)", async () => {
    expect(await errorOf(one(A, "select * from request_rematch($1)", [coupleRoom.id]))).toBe("ROOM_NOT_FOUND");
    expect(await errorOf(one(A, "select * from request_rematch($1)", [ludoRoom.id]))).toBe("ROOM_NOT_FOUND");
    expect((await one(A, "select * from request_rematch($1)", [tttRoom.id])).round).toBe(2); // still works for Tic-Tac-Toe
  });

  it("the history list's query (rooms with rounds, filtered by game type) returns only the Tic-Tac-Toe room", async () => {
    const rows = await t.as(
      A,
      "select r.id from rooms r where r.game_type = 'tictactoe' and r.player_o is not null and exists (select 1 from games g where g.room_id = r.id)",
    );
    expect(rows.map((r) => r.id)).toEqual([tttRoom.id]);
  });
});

describe("Couple Challenge only works in Couple rooms", () => {
  it("Couple actions refuse Ludo and Tic-Tac-Toe rooms", async () => {
    for (const room of [ludoRoom, tttRoom]) {
      expect(await errorOf(one(A, "select * from start_session($1, 'questions', null)", [room.id]))).toBe("ROOM_NOT_FOUND");
      expect(await errorOf(one(A, "select * from save_memory($1, 'x', 'y')", [room.id]))).toBe("ROOM_NOT_FOUND");
    }
  });

  it("a pair who only share a Ludo table can't use a Couple photo folder", async () => {
    const room = await one(C, "select * from create_room_for('ludo')");
    await one(B, "select * from join_room($1)", [room.code]);
    const folder = B < C ? `${B}_${C}` : `${C}_${B}`;
    expect((await one(C, "select _can_access_memory_folder($1) as ok", [folder])).ok).toBe(false);
  });
});
