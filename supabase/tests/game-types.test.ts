import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [A, B, C] = [51, 52, 53].map(uid);
let t: Db;
const h: Record<string, string> = {};
const rpc = async (who: string | null, fn: string, ...args: unknown[]) =>
  Object.values((await t.as<Row>(who, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))[0])[0] as Row;

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[A, "Rahul"], [B, "Durgesh"], [C, "Carol"]]) {
    await t.addPlayer(id, name);
    h[id] = (await t.db.query<{ handle: string }>("select handle from players where id = $1", [id])).rows[0].handle;
  }
});

describe("existing Tic-Tac-Toe flow, exactly as an old app version calls it", () => {
  it("create_room() → join_room(p_code) → round 1 → move → win → rematch", async () => {
    // Old clients call these with the same names and arguments as before the migration.
    const [room] = await t.as<Row>(A, "select * from create_room()");
    expect(room.game_type).toBe("tictactoe");
    const [joined] = await t.as<Row>(B, "select * from join_room($1)", [room.code]);
    expect(joined).toMatchObject({ player_o: B, status: "playing" });
    const [g] = await t.as<Row>(A, "select * from games where room_id = $1", [room.id]);
    expect(g).toMatchObject({ round: 1, current_turn: "X" });
    for (const [who, cell] of [[A, 0], [B, 3], [A, 1], [B, 4], [A, 2]] as const)
      await t.as(who, "select * from make_move($1, $2)", [g.id, cell]);
    const [done] = await t.as<Row>(A, "select * from games where id = $1", [g.id]);
    expect(done).toMatchObject({ status: "finished", winner: "X" });
    const [g2] = await t.as<Row>(B, "select * from request_rematch($1)", [room.id]);
    expect(g2).toMatchObject({ round: 2, starting_turn: "O" });
  });

  it("rows created before the migration read as Tic-Tac-Toe", async () => {
    const id = await t.addRoom(A, B); // inserted without game_type, like existing data
    expect((await t.db.query<Row>("select game_type from rooms where id = $1", [id])).rows[0].game_type).toBe("tictactoe");
  });

  it("send_challenge with only p_handle still challenges to Tic-Tac-Toe", async () => {
    await rpc(A, "send_friend_request", h[C]);
    await rpc(C, "respond_friend_request", h[A], true);
    const c = (await t.as<Row>(A, "select send_challenge(p_handle => $1) as r", [h[C]]))[0].r;
    expect(c.game_type).toBe("tictactoe");
    const r = await rpc(C, "respond_challenge", c.id, true);
    const [room] = (await t.db.query<Row>("select * from rooms where code = $1", [r.room_code])).rows;
    expect(room.game_type).toBe("tictactoe");
    expect((await t.db.query("select * from games where room_id = $1", [room.id])).rows).toHaveLength(1);
  });
});

describe("Couple Challenge rooms", () => {
  it("create_room_for('couple') → join creates no Tic-Tac-Toe round", async () => {
    const [room] = await t.as<Row>(A, "select * from create_room_for('couple')");
    expect(room).toMatchObject({ game_type: "couple", status: "waiting" });
    const [joined] = await t.as<Row>(B, "select * from join_room($1)", [room.code]);
    expect(joined).toMatchObject({ game_type: "couple", status: "playing", player_o: B });
    expect((await t.db.query("select * from games where room_id = $1", [room.id])).rows).toHaveLength(0);
    // Room is full for a third person, same as Tic-Tac-Toe.
    expect(await errorOf(t.as(C, "select * from join_room($1)", [room.code]))).toBe("ROOM_FULL");
  });

  it("rejects unknown game types", async () => {
    expect(await errorOf(t.as(A, "select * from create_room_for('chess')"))).toBe("INVALID_GAME_TYPE");
    expect(await errorOf(t.as(A, "select * from create_room_for(null)"))).toBe("INVALID_GAME_TYPE");
  });

  it("invites report the game type (for the join box and link previews), without ids", async () => {
    const [room] = await t.as<Row>(A, "select * from create_room_for('couple')");
    const inv = await rpc(null, "get_room_invite", room.code.toLowerCase());
    expect(inv).toMatchObject({ game_type: "couple", status: "waiting", is_full: false, host: { name: "Rahul" } });
    expect(JSON.stringify(inv)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("a friend can be challenged to Couple Challenge; accepting opens a couple room", async () => {
    const c = await rpc(A, "send_challenge", h[C], "couple");
    expect(c).toMatchObject({ game_type: "couple", status: "pending" });
    const r = await rpc(C, "respond_challenge", c.id, true);
    expect(r).toMatchObject({ status: "accepted", game_type: "couple" });
    const [room] = (await t.db.query<Row>("select * from rooms where code = $1", [r.room_code])).rows;
    expect(room).toMatchObject({ game_type: "couple", player_x: A, player_o: C, status: "playing" });
    expect((await t.db.query("select * from games where room_id = $1", [room.id])).rows).toHaveLength(0);
  });

  it("challenge game type is validated", async () => {
    expect(await errorOf(rpc(A, "send_challenge", h[C], "poker"))).toBe("INVALID_GAME_TYPE");
  });

  it("chat works in couple rooms (shared room_messages)", async () => {
    const [room] = await t.as<Row>(A, "select * from create_room_for('couple')");
    await t.as(B, "select * from join_room($1)", [room.code]);
    const [m] = await t.as<Row>(B, "select * from send_message($1, 'hi love', '00000000-0000-4000-8000-0000000000aa')", [room.id]);
    expect(m.body).toBe("hi love");
  });
});
