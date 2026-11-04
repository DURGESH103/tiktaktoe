import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [A, B, C, D, E, S] = [31, 32, 33, 34, 35, 36].map(uid); // Rahul, Durgesh, Carol, Dev, Eve, Spammer
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
let t: Db;
const h: Record<string, string> = {};

const call = async (who: string, fn: string, ...args: unknown[]) =>
  Object.values((await t.as<Json>(who, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))[0])[0];
const friends = (who: string) => call(who, "get_friends") as Promise<Json>;

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[A, "Rahul"], [B, "Durgesh"], [C, "Carol"], [D, "Dev"], [E, "Eve"], [S, "Spammer"]]) {
    await t.addPlayer(id, name);
    h[id] = (await t.db.query<{ handle: string }>("select handle from players where id = $1", [id])).rows[0].handle;
  }
});

describe("friend requests", () => {
  it("sends a request; repeating it is a no-op", async () => {
    expect(await call(A, "send_friend_request", h[B])).toBe("requested");
    expect(await call(A, "send_friend_request", h[B])).toBe("requested");
    expect((await friends(A)).outgoing.map((x: Json) => x.player.name)).toEqual(["Durgesh"]);
    expect((await friends(B)).incoming.map((x: Json) => x.player.name)).toEqual(["Rahul"]);
  });

  it("can't accept your own request; the receiver can", async () => {
    expect(await errorOf(call(A, "respond_friend_request", h[B], true))).toBe("NO_PENDING_REQUEST");
    expect(await call(B, "respond_friend_request", h[A], true)).toBe("friends");
    expect((await friends(A)).friends.map((x: Json) => x.player.name)).toEqual(["Durgesh"]);
    expect(await call(A, "send_friend_request", h[B])).toBe("friends"); // already friends
  });

  it("mutual requests become friends automatically", async () => {
    expect(await call(A, "send_friend_request", h[C])).toBe("requested");
    expect(await call(C, "send_friend_request", h[A])).toBe("friends");
    expect((await friends(C)).friends.map((x: Json) => x.player.name)).toEqual(["Rahul"]);
  });

  it("declining and cancelling leave no relationship", async () => {
    await call(D, "send_friend_request", h[A]);
    expect(await call(A, "respond_friend_request", h[D], false)).toBe("none");
    expect((await friends(D)).outgoing).toEqual([]);
    await call(D, "send_friend_request", h[A]);
    expect(await call(D, "cancel_friend_request", h[A])).toBe("none");
    expect(await errorOf(call(D, "cancel_friend_request", h[A]))).toBe("NO_PENDING_REQUEST");
    expect((await friends(A)).incoming).toEqual([]);
  });

  it("rejects yourself and unknown handles", async () => {
    expect(await errorOf(call(A, "send_friend_request", h[A]))).toBe("CANNOT_FRIEND_SELF");
    expect(await errorOf(call(A, "send_friend_request", "zzzzzzzz"))).toBe("PLAYER_NOT_FOUND");
  });

  it("unfriends", async () => {
    expect(await call(C, "remove_friend", h[A])).toBe("none");
    expect(await errorOf(call(C, "remove_friend", h[A]))).toBe("NOT_FRIENDS");
    expect((await friends(A)).friends.map((x: Json) => x.player.name)).toEqual(["Durgesh"]);
  });

  it("rate-limits to 20 new requests per hour", async () => {
    await t.db.query("insert into friend_request_events (sender_id) select $1 from generate_series(1, 20)", [S]);
    expect(await errorOf(call(S, "send_friend_request", h[E]))).toBe("RATE_LIMITED");
  });
});

describe("blocking", () => {
  it("blocks requests both ways and hides the block from the blocked person", async () => {
    await call(E, "send_friend_request", h[D]);
    expect(await call(D, "block_user", h[E])).toBe("blocked");
    expect(await errorOf(call(E, "send_friend_request", h[D]))).toBe("BLOCKED");
    expect(await errorOf(call(D, "send_friend_request", h[E]))).toBe("BLOCKED");
    // Eve sees nothing (not even that she's blocked); Dev sees her in his blocked list.
    const eve = await friends(E);
    expect([...eve.friends, ...eve.incoming, ...eve.outgoing, ...eve.blocked]).toEqual([]);
    expect((await friends(D)).blocked.map((x: Json) => x.player.name)).toEqual(["Eve"]);
    expect(await t.as(E, "select * from friendships")).toEqual([]);
  });

  it("only the blocker can unblock", async () => {
    expect(await call(E, "unblock_user", h[D])).toBe("none"); // no effect, reveals nothing
    expect(await errorOf(call(E, "send_friend_request", h[D]))).toBe("BLOCKED");
    expect(await call(D, "unblock_user", h[E])).toBe("none");
    expect(await call(E, "send_friend_request", h[D])).toBe("requested");
  });

  it("blocked players can't chat in a shared room", async () => {
    const room = await t.addRoom(A, B);
    const cid = "00000000-0000-4000-8000-000000000001";
    expect((await t.as<Json>(A, "select * from send_message($1, 'hi', $2)", [room, cid]))[0].body).toBe("hi");
    await call(B, "block_user", h[A]);
    expect(await errorOf(t.as(A, "select * from send_message($1, 'hello?', $2)", [room, "00000000-0000-4000-8000-000000000002"]))).toBe("BLOCKED");
    await call(B, "unblock_user", h[A]);
    await call(A, "send_friend_request", h[B]);
    await call(B, "respond_friend_request", h[A], true);
  });
});

describe("search, last seen, privacy", () => {
  it("searches by name prefix or exact friend code, excluding yourself and people who blocked you", async () => {
    expect((await call(A, "search_players", "dur")).map((x: Json) => [x.player.name, x.relation])).toEqual([["Durgesh", "friends"]]);
    expect((await call(A, "search_players", h[E].toUpperCase())).map((x: Json) => x.player.name)).toEqual(["Eve"]);
    expect(await call(A, "search_players", "r")).toEqual([]); // too short
    expect((await call(A, "search_players", "rah"))).toEqual([]); // that's me
    await call(E, "block_user", h[A]);
    expect(await call(A, "search_players", "eve")).toEqual([]);
    expect(await call(A, "search_players", "%")).toEqual([]); // wildcards are literal
  });

  it("shows last seen only to accepted friends", async () => {
    await t.as(B, "select touch_last_seen()");
    const f = (await friends(A)).friends.find((x: Json) => x.player.name === "Durgesh");
    expect(f.last_seen_at).toBeTruthy();
    expect(f.head_to_head).toMatchObject({ wins: 0, losses: 0, draws: 0 });
    expect(await errorOf(t.as(A, "select * from player_activity"))).toMatch(/permission denied/);
  });

  it("never returns auth ids, and blocks direct table writes", async () => {
    expect(JSON.stringify([await friends(A), await call(A, "search_players", "dur")])).not.toMatch(UUID);
    expect(await errorOf(t.as(A, "insert into friendships values ($1, $2, 'accepted', $1)", [A < D ? A : D, A < D ? D : A]))).toMatch(/permission denied/);
    expect(await errorOf(t.as(A, "update friendships set status = 'accepted'"))).toMatch(/permission denied/);
    expect(await errorOf(t.as(A, "select _relation($1, $2)", [A, B]))).toMatch(/permission denied/);
    expect(await errorOf(t.as(null, "select get_friends()"))).toMatch(/permission denied/);
  });
});
