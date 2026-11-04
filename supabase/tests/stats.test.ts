import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const A = uid(1); // Rahul
const B = uid(2); // Durgesh
const C = uid(3); // Carol
const D = uid(4); // never played
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let t: Db;
const handleOf = async (id: string) =>
  (await t.db.query<{ handle: string }>("select handle from players where id = $1", [id])).rows[0].handle;
const profile = async (viewer: string | null, handle: string) =>
  (await t.as<{ p: Json }>(viewer, "select get_public_profile($1) as p", [handle]))[0].p;

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[A, "Rahul"], [B, "Durgesh"], [C, "Carol"], [D, "Dev"]]) await t.addPlayer(id, name);

  // Rahul (X) vs Durgesh (O). Rahul's results in time order: W L D W W
  const r1 = await t.addRoom(A, B);
  await t.addRound(r1, 1, "X", "2026-01-01T10:00:00Z");
  await t.addRound(r1, 2, "O", "2026-01-01T10:05:00Z");
  await t.addRound(r1, 3, "draw", "2026-01-01T10:10:00Z", "finished", 9);
  await t.addRound(r1, 4, "X", "2026-01-01T10:15:00Z");
  await t.addRound(r1, 5, "X", "2026-01-01T10:20:00Z");
  // Carol (X) vs Rahul (O): Rahul wins, then an abandoned and a live round that must not count.
  const r2 = await t.addRoom(C, A);
  await t.addRound(r2, 1, "O", "2026-01-02T09:00:00Z");
  await t.addRound(r2, 2, null, "2026-01-02T09:10:00Z", "abandoned");
  await t.addRound(r2, 3, null, "2026-01-02T09:20:00Z", "playing");
});

describe("stats (server-side)", () => {
  it("counts wins, losses, draws and win rate from finished rounds only", async () => {
    const { stats } = await profile(A, await handleOf(A));
    expect(stats).toMatchObject({ total: 6, wins: 4, losses: 1, draws: 1 });
    expect(Number(stats.win_rate)).toBeCloseTo(4 / 6, 3);
  });

  it("tracks the current streak, current win streak and best win streak", async () => {
    // Rahul's results newest first: W W W D L W
    const { stats } = await profile(A, await handleOf(A));
    expect(stats.current_streak).toEqual({ result: "win", count: 3 });
    expect(stats.current_win_streak).toBe(3);
    expect(stats.best_win_streak).toBe(3);
  });

  it("reports a best win streak longer than the current one, and zero current after a loss", async () => {
    // Durgesh newest first: L L D W L  → current: loss ×2, best win streak 1
    const { stats } = await profile(null, await handleOf(B));
    expect(stats).toMatchObject({ total: 5, wins: 1, losses: 3, draws: 1 });
    expect(stats.current_streak).toEqual({ result: "loss", count: 2 });
    expect(stats.current_win_streak).toBe(0);
    expect(stats.best_win_streak).toBe(1);
  });

  it("handles a player with no games", async () => {
    const { stats, recent } = await profile(null, await handleOf(D));
    expect(stats).toEqual({
      total: 0, wins: 0, losses: 0, draws: 0, win_rate: null,
      current_streak: null, current_win_streak: 0, best_win_streak: 0,
    });
    expect(recent).toEqual([]);
  });
});

describe("head-to-head", () => {
  it("shows the viewer's record against the profile owner", async () => {
    const p = await profile(B, await handleOf(A)); // Durgesh looking at Rahul
    expect(p.head_to_head).toMatchObject({ wins: 1, losses: 3, draws: 1, total: 5 });
  });

  it("is omitted on your own profile, when signed out, or with no games together", async () => {
    expect((await profile(A, await handleOf(A))).head_to_head).toBeNull();
    expect((await profile(A, await handleOf(A))).is_me).toBe(true);
    expect((await profile(null, await handleOf(A))).head_to_head).toBeNull();
    expect((await profile(null, await handleOf(A))).is_me).toBe(false);
    expect((await profile(D, await handleOf(A))).head_to_head).toBeNull();
  });

  it("get_my_stats lists every opponent, most played first", async () => {
    const [{ s }] = await t.as<{ s: Json }>(A, "select get_my_stats() as s");
    expect(s.head_to_head.map((h: Json) => [h.opponent.name, h.wins, h.losses, h.draws, h.total])).toEqual([
      ["Durgesh", 3, 1, 1, 5],
      ["Carol", 1, 0, 0, 1],
    ]);
    expect(s.stats.total).toBe(6);
  });
});

describe("public profile data", () => {
  it("lists recent matches newest first with linked opponents", async () => {
    const { recent, player } = await profile(null, await handleOf(A));
    expect(player).toMatchObject({ name: "Rahul", avatar: "😎", handle: await handleOf(A) });
    expect(recent.map((m: Json) => [m.opponent.name, m.result])).toEqual([
      ["Carol", "win"], ["Durgesh", "win"], ["Durgesh", "win"], ["Durgesh", "draw"], ["Durgesh", "loss"], ["Durgesh", "win"],
    ]);
    expect(recent[0].opponent.handle).toBe(await handleOf(C));
  });

  it("never exposes auth ids or room codes", async () => {
    const all = JSON.stringify([
      await profile(B, await handleOf(A)),
      (await t.as(A, "select get_my_stats() as s"))[0],
      (await t.as(null, "select get_room_invite('AAAAA') as i"))[0],
    ]);
    expect(all).not.toMatch(UUID);
    expect(all).not.toMatch(/"code"|AAAAA|"id"/);
  });

  it("returns null for unknown handles and accepts any case", async () => {
    expect(await profile(null, "zzzzzzzz")).toBeNull();
    expect(await profile(null, (await handleOf(A)).toUpperCase())).not.toBeNull();
  });

  it("room invite preview shows the host and whether the room is full", async () => {
    const [{ i }] = await t.as<{ i: Json }>(null, "select get_room_invite('aaaaa') as i");
    expect(i).toEqual({ host: { handle: await handleOf(A), name: "Rahul", avatar: "😎", color: "violet" }, status: "playing", is_full: true });
    expect((await t.as<{ i: Json }>(null, "select get_room_invite('ZZZZZ') as i"))[0].i).toBeNull();
  });
});

describe("profile write protection", () => {
  it("gives every player a unique 8-character handle", async () => {
    const { rows } = await t.db.query<{ handle: string }>("select handle from players");
    expect(new Set(rows.map((r) => r.handle)).size).toBe(rows.length);
    for (const r of rows) expect(r.handle).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
  });

  it("lets players edit name/avatar/colour, including via the app's upsert", async () => {
    await t.as(A, "update players set name = 'Rahul K' where id = $1", [A]);
    await t.as(
      A,
      `insert into players (id, name, avatar, color) values ($1, 'Rahul', '🦊', 'sky')
       on conflict (id) do update set id = excluded.id, name = excluded.name, avatar = excluded.avatar, color = excluded.color`,
      [A],
    );
    expect((await profile(null, await handleOf(A))).player).toMatchObject({ name: "Rahul", avatar: "🦊", color: "sky" });
  });

  it("blocks faking 'member since' or taking over a handle", async () => {
    expect(await errorOf(t.as(A, "update players set created_at = '2000-01-01' where id = $1", [A]))).toMatch(/permission denied/);
    expect(await errorOf(t.as(A, "update players set handle = 'aaaaaaaa' where id = $1", [A]))).toMatch(/permission denied/);
  });

  it("keeps internal helpers and private stats off the API", async () => {
    expect(await errorOf(t.as(A, "select _player_stats($1)", [B]))).toMatch(/permission denied/);
    expect(await errorOf(t.as(A, "select * from _player_results($1)", [B]))).toMatch(/permission denied/);
    expect(await errorOf(t.as(null, "select get_my_stats()"))).toMatch(/permission denied/);
  });
});
