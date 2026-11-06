import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [X, O, Z] = [81, 82, 83].map(uid); // Rahul (X), Durgesh (O), outsider
let t: Db;

const one = async (who: string | null, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
const coupleRoom = async () => {
  const room = await one(X, "select * from create_room_for('couple')");
  await one(O, "select * from join_room($1)", [room.code]);
  return room;
};
const roundsOf = async (sessionId: string) =>
  (await t.db.query<Row>("select * from couple_rounds where session_id = $1 order by idx", [sessionId])).rows;
const session = async (id: string) => (await t.db.query<Row>("select * from couple_sessions where id = $1", [id])).rows[0];
const folder = () => (X < O ? `${X}_${O}` : `${O}_${X}`);
const PHOTO_ID = "123e4567-e89b-42d3-a456-426614174000";

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[X, "Rahul"], [O, "Durgesh"], [Z, "Zed"]]) await t.addPlayer(id, name);
});

describe("Memories rounds", () => {
  it("deals 5 prompts from the Memories category", async () => {
    const room = await coupleRoom();
    const s = await one(X, "select * from start_session($1, 'memories', null)", [room.id]);
    expect(s).toMatchObject({ mode: "memories", category: "memories", total_rounds: 5 });
    const modes = await t.db.query<Row>(
      "select distinct q.mode from couple_rounds cr join couple_questions q on q.id = cr.question_id where cr.session_id = $1",
      [s.id],
    );
    expect(modes.rows.map((r) => r.mode)).toEqual(["memories"]);
  });

  it("hides the partner's written answer until both have answered; outsiders never see it", async () => {
    const room = await coupleRoom();
    const s = await one(X, "select * from start_session($1, 'memories', null)", [room.id]);
    const [r1] = await roundsOf(s.id);
    await one(X, "select * from submit_memory_answer($1, '  At the  college canteen ')", [r1.id]);
    // Stored cleaned up; X sees their own; O and the outsider see nothing yet.
    expect((await t.as(X, "select text_answer from couple_answers where round_id = $1", [r1.id]))).toEqual([{ text_answer: "At the college canteen" }]);
    expect(await t.as(O, "select * from couple_answers where round_id = $1", [r1.id])).toEqual([]);
    expect(await t.as(Z, "select * from couple_answers where round_id = $1", [r1.id])).toEqual([]);

    const after = await one(O, "select * from submit_memory_answer($1, 'Canteen, over chai')", [r1.id]);
    expect(after.revealed_at).not.toBeNull();
    expect((await t.as(O, "select * from couple_answers where round_id = $1", [r1.id])).length).toBe(2);
    expect(await t.as(Z, "select * from couple_answers where round_id = $1", [r1.id])).toEqual([]);
    expect(await errorOf(t.as(X, "select * from submit_memory_answer($1, 'changed')", [r1.id]))).toBe("ROUND_REVEALED");
  });

  it("validates answers and turns", async () => {
    const room = await coupleRoom();
    const s = await one(X, "select * from start_session($1, 'memories', null)", [room.id]);
    const [r1, r2] = await roundsOf(s.id);
    expect(await errorOf(t.as(X, "select * from submit_memory_answer($1, '   ')", [r1.id]))).toBe("MESSAGE_EMPTY");
    expect(await errorOf(t.as(X, "select * from submit_memory_answer($1, $2)", [r1.id, "a".repeat(301)]))).toBe("MESSAGE_TOO_LONG");
    expect(await errorOf(t.as(X, "select * from submit_memory_answer($1, 'later')", [r2.id]))).toBe("ROUND_NOT_CURRENT");
    expect(await errorOf(t.as(Z, "select * from submit_memory_answer($1, 'hi')", [r1.id]))).toBe("ROUND_NOT_FOUND");
    expect(await errorOf(t.as(X, "select * from vote_memory_match($1, true)", [r1.id]))).toBe("ROUND_NOT_REVEALED");
  });

  it("scores +20 only when both say 'We matched'; next needs both votes; summary on the server", async () => {
    const room = await coupleRoom();
    const s = await one(X, "select * from start_session($1, 'memories', null)", [room.id]);
    const rs = await roundsOf(s.id);
    const answerBoth = async (roundId: string) => {
      await one(X, "select * from submit_memory_answer($1, 'Goa')", [roundId]);
      await one(O, "select * from submit_memory_answer($1, 'Goa trip')", [roundId]);
    };

    await answerBoth(rs[0].id);
    const half = await one(X, "select * from vote_memory_match($1, true)", [rs[0].id]);
    expect(half).toMatchObject({ x_match: true, o_match: null, outcome: null });
    expect(await errorOf(t.as(X, "select * from next_card($1, 1)", [s.id]))).toBe("MEMORY_NOT_RESOLVED");
    expect(await one(X, "select * from vote_memory_match($1, false)", [rs[0].id])).toMatchObject({ x_match: false }); // changed mind
    await one(X, "select * from vote_memory_match($1, true)", [rs[0].id]);
    expect(await one(O, "select * from vote_memory_match($1, true)", [rs[0].id])).toMatchObject({ outcome: "matched" });
    expect((await session(s.id)).points).toBe(20);
    expect((await one(O, "select * from vote_memory_match($1, false)", [rs[0].id])).outcome).toBe("matched"); // locked
    await one(O, "select * from next_card($1, 1)", [s.id]);

    // Round 2: they disagree → "different", no points.
    await answerBoth(rs[1].id);
    await one(X, "select * from vote_memory_match($1, true)", [rs[1].id]);
    expect((await one(O, "select * from vote_memory_match($1, false)", [rs[1].id])).outcome).toBe("different");
    expect((await session(s.id)).points).toBe(20);
    await one(X, "select * from next_card($1, 2)", [s.id]);

    for (let i = 2; i < 5; i++) {
      await answerBoth(rs[i].id);
      await one(X, "select * from vote_memory_match($1, true)", [rs[i].id]);
      await one(O, "select * from vote_memory_match($1, true)", [rs[i].id]);
      await one(i % 2 ? X : O, "select * from next_card($1, $2)", [s.id, i + 1]);
    }
    expect(await session(s.id)).toMatchObject({ status: "finished", points: 80, result: { matched: 4, different: 1 } });
  });

  it("starting other modes still works (start_session was extended, not changed)", async () => {
    const room = await coupleRoom();
    const c = await one(X, "select * from start_session($1, 'compatibility', 'food')", [room.id]);
    expect(c).toMatchObject({ mode: "compatibility", total_rounds: 10 });
    await one(X, "select * from quit_session($1)", [c.id]);
    expect((await one(O, "select * from start_session($1, 'challenges', null)", [room.id])).total_rounds).toBe(5);
  });
});

describe("Our Memories timeline", () => {
  let roomId: string;
  beforeAll(async () => {
    roomId = (await coupleRoom()).id;
  });

  it("room members save memories; the pair sees them; outsiders don't", async () => {
    const m = await one(X, "select * from save_memory($1, 'Where did we first meet?', '  The college canteen ☕ ')", [roomId]);
    expect(m).toMatchObject({ title: "Where did we first meet?", body: "The college canteen ☕", photo_path: null, created_by: X });
    expect((await t.as(O, "select id from couple_memories where id = $1", [m.id])).length).toBe(1);
    expect(await t.as(Z, "select id from couple_memories")).toEqual([]);
    expect(await errorOf(t.as(Z, "select * from save_memory($1, 'x', 'y')", [roomId]))).toBe("ROOM_NOT_FOUND");
  });

  it("accepts only photo paths inside the pair's own folder", async () => {
    const ok = await one(O, "select * from save_memory($1, 'Goa', 'Beach day', $2)", [roomId, `${folder()}/${PHOTO_ID}.jpg`]);
    expect(ok.photo_path).toBe(`${folder()}/${PHOTO_ID}.jpg`);
    for (const bad of [`${Z}_${X}/${PHOTO_ID}.jpg`, `${folder()}/../${PHOTO_ID}.jpg`, `${folder()}/${PHOTO_ID}.gif`, `${PHOTO_ID}.jpg`]) {
      expect(await errorOf(t.as(O, "select * from save_memory($1, 'Goa', 'Beach day', $2)", [roomId, bad]))).toBe("INVALID_PHOTO");
    }
  });

  it("validates text and blocks direct writes", async () => {
    expect(await errorOf(t.as(X, "select * from save_memory($1, '  ', 'y')", [roomId]))).toBe("MESSAGE_EMPTY");
    expect(await errorOf(t.as(X, "select * from save_memory($1, 'x', $2)", [roomId, "a".repeat(501)]))).toBe("MESSAGE_TOO_LONG");
    expect(await errorOf(t.as(X, "insert into couple_memories (user_a, user_b, created_by, title, body) values ($1, $2, $1, 'x', 'y')", [X < O ? X : O, X < O ? O : X]))).toMatch(
      /permission denied/,
    );
  });

  it("photo folder access: the pair only", async () => {
    const can = async (who: string, f: string) => (await one(who, "select _can_access_memory_folder($1) as ok", [f])).ok;
    expect(await can(X, folder())).toBe(true);
    expect(await can(O, folder())).toBe(true);
    expect(await can(Z, folder())).toBe(false);
    const [lo, hi] = folder().split("_");
    expect(await can(X, `${hi}_${lo}`)).toBe(false); // must be in the fixed order
    expect(await can(X, "not-a-folder")).toBe(false);
  });

  it("only the creator deletes a memory, and gets the photo path back to remove the file", async () => {
    const m = await one(X, "select * from save_memory($1, 'First date', 'Pizza 🍕', $2)", [roomId, `${folder()}/${PHOTO_ID}.webp`]);
    expect(await errorOf(t.as(O, "select delete_memory($1)", [m.id]))).toBe("MEMORY_NOT_FOUND");
    expect(await errorOf(t.as(Z, "select delete_memory($1)", [m.id]))).toBe("MEMORY_NOT_FOUND");
    expect((await one(X, "select delete_memory($1) as path", [m.id])).path).toBe(`${folder()}/${PHOTO_ID}.webp`);
    expect(await t.as(O, "select id from couple_memories where id = $1", [m.id])).toEqual([]);
  });

  it("blocking hides the timeline and the photo folder", async () => {
    expect((await t.as(O, "select id from couple_memories")).length).toBeGreaterThan(0);
    await one(X, "select block_user((select handle from players where id = $1))", [O]);
    expect(await t.as(O, "select id from couple_memories")).toEqual([]);
    expect(await t.as(X, "select id from couple_memories")).toEqual([]);
    expect((await one(O, "select _can_access_memory_folder($1) as ok", [folder()])).ok).toBe(false);
    await one(X, "select unblock_user((select handle from players where id = $1))", [O]);
    expect((await t.as(O, "select id from couple_memories")).length).toBeGreaterThan(0);
  });
});
