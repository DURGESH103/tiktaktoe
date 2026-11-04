import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [A, B, C, D] = [41, 42, 43, 44].map(uid); // Rahul, Durgesh, Carol (friend), Dev (not a friend)
let t: Db;
const h: Record<string, string> = {};

const call = async (who: string, fn: string, ...args: unknown[]) =>
  Object.values((await t.as<Json>(who, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))[0])[0] as Json;
const befriend = async (x: string, y: string) => {
  await call(x, "send_friend_request", h[y]);
  await call(y, "respond_friend_request", h[x], true);
};
const roomsBetween = async (x: string, y: string) =>
  (await t.db.query("select * from rooms where (player_x = $1 and player_o = $2) or (player_x = $2 and player_o = $1)", [x, y])).rows;
const expire = (id: string) => t.db.query("update challenges set expires_at = now() - interval '1 second' where id = $1", [id]);

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[A, "Rahul"], [B, "Durgesh"], [C, "Carol"], [D, "Dev"]]) {
    await t.addPlayer(id, name);
    h[id] = (await t.db.query<{ handle: string }>("select handle from players where id = $1", [id])).rows[0].handle;
  }
  await befriend(A, B);
  await befriend(A, C);
});

describe("send_challenge", () => {
  it("only friends can be challenged", async () => {
    expect(await errorOf(call(A, "send_challenge", h[D]))).toBe("NOT_FRIENDS");
    expect(await errorOf(call(A, "send_challenge", h[A]))).toBe("CANNOT_CHALLENGE_SELF");
  });

  it("creates a 60-second invite; a second tap returns the same one (1 pending per friend)", async () => {
    const c = await call(A, "send_challenge", h[B]);
    expect(c).toMatchObject({ direction: "out", status: "pending", other: { name: "Durgesh" }, room_code: null });
    const secs = (Date.parse(c.expires_at) - Date.parse(c.server_now)) / 1000;
    expect(secs).toBeGreaterThan(59);
    expect(secs).toBeLessThanOrEqual(60);
    expect((await call(A, "send_challenge", h[B])).id).toBe(c.id);
    expect((await call(B, "get_challenges"))[0]).toMatchObject({ id: c.id, direction: "in", other: { name: "Rahul" } });
    await call(A, "cancel_challenge", c.id);
  });
});

describe("respond_challenge", () => {
  it("accept creates one ready-to-play room with the challenger as X", async () => {
    const c = await call(A, "send_challenge", h[B]);
    const r = await call(B, "respond_challenge", c.id, true);
    expect(r).toMatchObject({ status: "accepted" });
    expect(r.room_code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    const [room] = (await t.db.query("select * from rooms where code = $1", [r.room_code])).rows as Json[];
    expect(room).toMatchObject({ player_x: A, player_o: B, status: "playing" });
    const games = (await t.db.query("select * from games where room_id = $1", [room.id])).rows;
    expect(games).toHaveLength(1);
    // The challenger sees the code too.
    expect((await call(A, "get_challenges")).find((x: Json) => x.id === c.id).room_code).toBe(r.room_code);
  });

  it("accepting twice (double tap / two devices) gives the same room, never two", async () => {
    const before = (await roomsBetween(A, C)).length;
    const c = await call(A, "send_challenge", h[C]);
    const [r1, r2] = [await call(C, "respond_challenge", c.id, true), await call(C, "respond_challenge", c.id, true)];
    expect(r2.room_code).toBe(r1.room_code);
    expect((await roomsBetween(A, C)).length).toBe(before + 1);
  });

  it("both challenging each other at once → the second challenge accepts the first", async () => {
    const before = (await roomsBetween(A, B)).length;
    const first = await call(A, "send_challenge", h[B]);
    const second = await call(B, "send_challenge", h[A]);
    expect(second).toMatchObject({ id: first.id, status: "accepted" });
    expect((await roomsBetween(A, B)).length).toBe(before + 1);
  });

  it("decline", async () => {
    const c = await call(A, "send_challenge", h[B]);
    expect((await call(B, "respond_challenge", c.id, false)).status).toBe("declined");
    expect((await call(B, "respond_challenge", c.id, true)).status).toBe("declined"); // too late to change
  });

  it("expired challenges can't be accepted", async () => {
    const c = await call(A, "send_challenge", h[B]);
    await expire(c.id);
    const before = (await roomsBetween(A, B)).length;
    expect((await call(B, "respond_challenge", c.id, true)).status).toBe("expired");
    expect((await roomsBetween(A, B)).length).toBe(before);
  });

  it("an expired-but-unmarked challenge doesn't block a new one", async () => {
    const old = await call(A, "send_challenge", h[B]);
    await expire(old.id);
    const fresh = await call(A, "send_challenge", h[B]);
    expect(fresh.id).not.toBe(old.id);
    expect(fresh.status).toBe("pending");
    await call(A, "cancel_challenge", fresh.id);
  });

  it("only the receiver can respond and only the sender can cancel", async () => {
    const c = await call(A, "send_challenge", h[B]);
    expect(await errorOf(call(A, "respond_challenge", c.id, true))).toBe("CHALLENGE_NOT_FOUND");
    expect(await errorOf(call(C, "respond_challenge", c.id, true))).toBe("CHALLENGE_NOT_FOUND");
    expect(await errorOf(call(B, "cancel_challenge", c.id))).toBe("CHALLENGE_NOT_FOUND");
    expect((await call(A, "cancel_challenge", c.id)).status).toBe("cancelled");
    expect((await call(B, "respond_challenge", c.id, true)).status).toBe("cancelled");
  });

  it("cancelling after the timer reports 'expired' (No response)", async () => {
    const c = await call(A, "send_challenge", h[B]);
    await expire(c.id);
    expect((await call(A, "cancel_challenge", c.id)).status).toBe("expired");
  });
});

describe("limits and blocking", () => {
  it("blocking cancels pending challenges and stops new ones", async () => {
    // (Carol sends it: Rahul already used up his 10-per-10-minutes in the tests above.)
    const c = await call(C, "send_challenge", h[A]);
    await call(A, "block_user", h[C]);
    expect((await t.db.query("select status from challenges where id = $1", [c.id])).rows[0]).toEqual({ status: "cancelled" });
    expect(await errorOf(call(C, "send_challenge", h[A]))).toBe("NOT_FRIENDS");
  });

  it("rate-limits to 10 challenges per 10 minutes", async () => {
    await t.db.query(
      "insert into challenges (from_user, to_user, status) select $1, $2, 'cancelled' from generate_series(1, 10)",
      [B, A],
    );
    expect(await errorOf(call(B, "send_challenge", h[A]))).toBe("RATE_LIMITED");
  });

  it("only participants can read a challenge; no direct writes", async () => {
    expect(await t.as(D, "select * from challenges")).toEqual([]);
    expect(await errorOf(t.as(A, "update challenges set status = 'accepted'"))).toMatch(/permission denied/);
    expect(await errorOf(t.as(A, "select _create_challenge_room($1, $2)", [A, B]))).toMatch(/permission denied/);
  });
});
