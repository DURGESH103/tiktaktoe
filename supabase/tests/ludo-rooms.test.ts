import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Host Rahul, friends Durgesh / Priya / Kabir, Zed (5th wheel), Bina (blocked by Rahul).
const [H, B, P, K, Z, BL] = [101, 102, 103, 104, 105, 106].map(uid);
const NAMES: [string, string][] = [[H, "Rahul"], [B, "Durgesh"], [P, "Priya"], [K, "Kabir"], [Z, "Zed"], [BL, "Bina"]];
let t: Db;
const h: Record<string, string> = {};

const one = async (who: string | null, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
const ludoRoom = async (host = H) => one(host, "select * from create_room_for('ludo')");
const join = (who: string, code: string) => one(who, "select * from join_room($1)", [code]);
const seats = async (roomId: string) =>
  (await t.db.query<Row>("select player_id, seat, color, ready from room_players where room_id = $1 and left_at is null order by seat", [roomId])).rows;
const befriend = async (x: string, y: string) => {
  await one(x, "select send_friend_request($1)", [h[y]]);
  await one(y, "select respond_friend_request($1, true)", [h[x]]);
};

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of NAMES) {
    await t.addPlayer(id, name);
    h[id] = (await t.db.query<Row>("select handle from players where id = $1", [id])).rows[0].handle;
  }
  for (const f of [B, P, K]) await befriend(H, f);
  await one(H, "select block_user($1)", [h[BL]]);
});

describe("Ludo lobby", () => {
  it("creates a 4-seat Classic lobby with the host in red, ready; player_o is never used", async () => {
    const room = await ludoRoom();
    expect(room).toMatchObject({ game_type: "ludo", status: "waiting", player_x: H, player_o: null });
    expect(await one(H, "select max_players, mode from ludo_rooms where room_id = $1", [room.id])).toEqual({ max_players: 4, mode: "classic" });
    expect(await seats(room.id)).toEqual([{ player_id: H, seat: 0, color: "red", ready: true }]);
  });

  it("seats players in order; a 5th gets 'Room is full'; rejoining is a no-op", async () => {
    const room = await ludoRoom();
    for (const p of [B, P, K]) await join(p, room.code);
    expect((await seats(room.id)).map((s) => [s.color, s.player_id])).toEqual([["red", H], ["green", B], ["yellow", P], ["blue", K]]);
    expect(await errorOf(join(Z, room.code))).toBe("ROOM_FULL");
    expect((await join(B, room.code)).id).toBe(room.id);
    expect((await seats(room.id)).length).toBe(4);
    const inv = await one(null, "select get_room_invite($1) as i", [room.code]);
    expect(inv.i).toMatchObject({ game_type: "ludo", players: 4, max_players: 4, is_full: true, mode: "classic" });
  });

  it("2 players sit opposite each other (red and yellow)", async () => {
    const room = await ludoRoom();
    await one(H, "select * from set_ludo_options($1, 2, 'quick')", [room.id]);
    await join(B, room.code);
    expect((await seats(room.id)).map((s) => s.color)).toEqual(["red", "yellow"]);
    expect(await errorOf(join(P, room.code))).toBe("ROOM_FULL");
    expect((await one(H, "select mode from ludo_rooms where room_id = $1", [room.id])).mode).toBe("quick");
  });

  it("only the host changes options; shrinking re-packs seats and resets Ready; too many players is refused", async () => {
    const room = await ludoRoom();
    await join(B, room.code);
    await join(P, room.code);
    await one(B, "select * from set_ludo_ready($1, true)", [room.id]);
    expect(await errorOf(one(B, "select * from set_ludo_options($1, 3, 'classic')", [room.id]))).toBe("NOT_HOST");
    expect(await errorOf(one(H, "select * from set_ludo_options($1, 2, 'classic')", [room.id]))).toBe("TOO_MANY_PLAYERS");
    expect(await errorOf(one(H, "select * from set_ludo_options($1, 5, 'classic')", [room.id]))).toBe("INVALID_OPTIONS");
    await one(H, "select * from set_ludo_options($1, 3, 'classic')", [room.id]);
    expect((await seats(room.id)).map((s) => [s.color, s.ready])).toEqual([["red", true], ["green", false], ["yellow", false]]);
    // Two players left: going to a 2-player table puts the guest opposite the host.
    await one(P, "select leave_room($1)", [room.id]);
    await one(H, "select * from set_ludo_options($1, 2, 'classic')", [room.id]);
    expect((await seats(room.id)).map((s) => [s.player_id, s.color])).toEqual([[H, "red"], [B, "yellow"]]);
  });

  it("Ready toggles for guests; the host is always ready; outsiders can't", async () => {
    const room = await ludoRoom();
    await join(B, room.code);
    expect((await one(B, "select * from set_ludo_ready($1, true)", [room.id])).ready).toBe(true);
    expect((await one(B, "select * from set_ludo_ready($1, false)", [room.id])).ready).toBe(false);
    expect((await one(H, "select * from set_ludo_ready($1, false)", [room.id])).ready).toBe(true);
    expect(await errorOf(one(Z, "select * from set_ludo_ready($1, true)", [room.id]))).toBe("ROOM_NOT_FOUND");
  });

  it("members see the room, seats and each other; outsiders see nothing", async () => {
    const room = await ludoRoom();
    await join(B, room.code);
    await join(P, room.code);
    expect((await t.as(P, "select id from rooms where id = $1", [room.id])).length).toBe(1);
    expect((await t.as(P, "select player_id from room_players where room_id = $1", [room.id])).length).toBe(3);
    expect((await t.as(P, "select name from players where id = $1", [B])).map((r) => r.name)).toEqual(["Durgesh"]);
    expect(await t.as(Z, "select id from rooms where id = $1", [room.id])).toEqual([]);
    expect(await t.as(Z, "select * from room_players where room_id = $1", [room.id])).toEqual([]);
    expect(await t.as(Z, "select * from ludo_rooms where room_id = $1", [room.id])).toEqual([]);
    expect(await errorOf(t.as(B, "update room_players set seat = 3 where player_id = $1", [B]))).toMatch(/permission denied/);
  });

  it("a guest leaving frees the seat (and can come back); the host leaving closes the lobby", async () => {
    const room = await ludoRoom();
    await join(B, room.code);
    await one(B, "select leave_room($1)", [room.id]);
    expect((await seats(room.id)).map((s) => s.player_id)).toEqual([H]);
    expect(await t.as(B, "select id from rooms where id = $1", [room.id])).toEqual([]); // no longer a member
    await join(B, room.code);
    expect((await seats(room.id)).map((s) => s.player_id)).toEqual([H, B]);
    await one(H, "select leave_room($1)", [room.id]);
    expect((await t.db.query<Row>("select status from rooms where id = $1", [room.id])).rows[0].status).toBe("abandoned");
    expect(await errorOf(join(P, room.code))).toBe("ROOM_CLOSED");
  });

  it("blocked players can't sit at the same table", async () => {
    const room = await ludoRoom();
    expect(await errorOf(join(BL, room.code))).toBe("BLOCKED");
  });
});

describe("Ludo invites", () => {
  it("the host invites several friends into the lobby; accepting takes a seat", async () => {
    const room = await ludoRoom();
    const cb = await one(H, "select send_challenge($1, 'ludo', $2) as c", [h[B], room.code.toLowerCase()]);
    const cp = await one(H, "select send_challenge($1, 'ludo', $2) as c", [h[P], room.code]);
    expect(cb.c).toMatchObject({ status: "pending", game_type: "ludo", room_code: room.code });
    expect((await one(B, "select respond_challenge($1, true) as c", [cb.c.id])).c).toMatchObject({ status: "accepted", room_code: room.code });
    expect((await one(P, "select respond_challenge($1, true) as c", [cp.c.id])).c.status).toBe("accepted");
    expect((await seats(room.id)).map((s) => s.player_id)).toEqual([H, B, P]);
  });

  it("an invite into a lobby that filled up meanwhile is cancelled instead of overfilling it", async () => {
    const room = await ludoRoom();
    await one(H, "select * from set_ludo_options($1, 2, 'classic')", [room.id]);
    const c = await one(H, "select send_challenge($1, 'ludo', $2) as c", [h[K], room.code]);
    await join(Z, room.code); // a stranger with the link takes the last seat first
    expect((await one(K, "select respond_challenge($1, true) as c", [c.c.id])).c.status).toBe("cancelled");
    expect((await seats(room.id)).length).toBe(2);
  });

  it("validates invite rooms", async () => {
    const room = await ludoRoom(B); // Durgesh's lobby; Rahul isn't in it
    expect(await errorOf(one(H, "select send_challenge($1, 'ludo', $2)", [h[P], room.code]))).toBe("ROOM_NOT_FOUND");
    expect(await errorOf(one(B, "select send_challenge($1, 'couple', $2)", [h[H], room.code]))).toBe("INVALID_GAME_TYPE");
    await join(H, room.code);
    expect(await errorOf(one(B, "select send_challenge($1, 'ludo', $2)", [h[H], room.code]))).toBe("ALREADY_IN_ROOM");
  });

  it("challenging a friend to Ludo from the Friends list opens a 2-player lobby for both", async () => {
    const c = await one(H, "select send_challenge($1, 'ludo') as c", [h[K]]);
    const acc = (await one(K, "select respond_challenge($1, true) as c", [c.c.id])).c;
    const room = (await t.db.query<Row>("select * from rooms where code = $1", [acc.room_code])).rows[0];
    expect(room).toMatchObject({ game_type: "ludo", status: "waiting", player_x: H, player_o: null });
    expect((await seats(room.id)).map((s) => [s.player_id, s.color, s.ready])).toEqual([[H, "red", true], [K, "yellow", false]]);
    expect(await one(H, "select max_players from ludo_rooms where room_id = $1", [room.id])).toEqual({ max_players: 2 });
  });

  it("old two-argument challenges still work exactly as before", async () => {
    const c = await one(B, "select send_challenge($1) as c", [h[H]]);
    expect(c.c).toMatchObject({ game_type: "tictactoe", room_code: null, status: "pending" });
    const acc = (await one(H, "select respond_challenge($1, true) as c", [c.c.id])).c;
    const room = (await t.db.query<Row>("select * from rooms where code = $1", [acc.room_code])).rows[0];
    expect(room).toMatchObject({ game_type: "tictactoe", status: "playing", player_x: B, player_o: H });
  });
});
