import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [X, O, Z, P, Q] = [71, 72, 73, 74, 75].map(uid); // Rahul (X), Durgesh (O), outsider, and a fresh pair
let t: Db;

const one = async (who: string | null, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
const coupleRoom = async () => {
  const room = await one(X, "select * from create_room_for('couple')");
  await one(O, "select * from join_room($1)", [room.code]);
  return room;
};
const rounds = async (sessionId: string) =>
  (await t.db.query<Row>("select cr.*, q.level, q.category, q.duration_secs from couple_rounds cr join couple_questions q on q.id = cr.question_id where session_id = $1 order by idx", [sessionId])).rows;
const session = async (id: string) => (await t.db.query<Row>("select * from couple_sessions where id = $1", [id])).rows[0];

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[X, "Rahul"], [O, "Durgesh"], [Z, "Zed"], [P, "Priya"], [Q, "Kabir"]]) await t.addPlayer(id, name);
});

describe("Questions deck", () => {
  it("deals 12 cards: 4 Fun, then 4 Deep, then 4 Future", async () => {
    const room = await coupleRoom();
    const s = await one(X, "select * from start_session($1, 'questions', null)", [room.id]);
    expect(s).toMatchObject({ mode: "questions", category: "all", total_rounds: 12 });
    expect((await rounds(s.id)).map((r) => r.level)).toEqual([...Array(4).fill("fun"), ...Array(4).fill("deep"), ...Array(4).fill("future")]);
  });

  it("either player draws the next card; a double tap is a no-op; no score at the end", async () => {
    const room = await coupleRoom();
    const s = await one(O, "select * from start_session($1, 'questions', null)", [room.id]);
    expect((await one(X, "select * from next_card($1, 1)", [s.id])).current_round).toBe(2);
    expect((await one(O, "select * from next_card($1, 1)", [s.id])).current_round).toBe(2); // stale tap
    for (let i = 2; i <= 12; i++) await one(i % 2 ? X : O, "select * from next_card($1, $2)", [s.id, i]);
    expect(await session(s.id)).toMatchObject({ status: "finished", points: 0, result: { cards: 12 } });
  });

  it("rotates cards per level for the same pair", async () => {
    // A fresh pair, so earlier tests haven't used any cards yet.
    const room = await one(P, "select * from create_room_for('couple')");
    await one(Q, "select * from join_room($1)", [room.code]);
    const a = await one(P, "select * from start_session($1, 'questions', null)", [room.id]);
    const first = (await rounds(a.id)).map((r) => r.question_id);
    await one(P, "select * from quit_session($1)", [a.id]);
    const b = await one(Q, "select * from start_session($1, 'questions', null)", [room.id]);
    const second = (await rounds(b.id)).map((r) => r.question_id);
    await one(P, "select * from quit_session($1)", [b.id]);
    // 12 per level in the bank: two sessions of 4 per level never overlap.
    expect(first.filter((id) => second.includes(id))).toEqual([]);
  });
});

describe("Challenges", () => {
  let room: Row;
  let s: Row;
  let rs: Row[];

  it("deals 5 tasks with timers taken from the task text", async () => {
    room = await coupleRoom();
    s = await one(X, "select * from start_session($1, 'challenges', null)", [room.id]);
    expect(s).toMatchObject({ mode: "challenges", total_rounds: 5 });
    rs = await rounds(s.id);
    expect(rs.every((r) => [20, 30, 60].includes(r.duration_secs))).toBe(true);
    const timers = (await t.db.query<Row>("select text_en, duration_secs from couple_questions where mode = 'challenges'")).rows;
    expect(timers.find((q) => q.text_en.includes("30 seconds"))?.duration_secs).toBe(30);
    expect(timers.find((q) => q.text_en.includes("20-second"))?.duration_secs).toBe(20);
    expect(timers.find((q) => q.text_en.includes("1 minute"))?.duration_secs).toBe(60);
  });

  it("only the performer (X on odd rounds) starts the timer and claims Done", async () => {
    expect(await errorOf(one(O, "select * from start_challenge_timer($1)", [rs[0].id]))).toBe("NOT_YOUR_CHALLENGE");
    expect((await one(X, "select * from start_challenge_timer($1)", [rs[0].id])).timer_started_at).not.toBeNull();
    expect(await errorOf(one(O, "select * from complete_challenge($1, true)", [rs[0].id]))).toBe("NOT_YOUR_CHALLENGE");
    expect(await errorOf(one(X, "select * from next_card($1, 1)", [s.id]))).toBe("CHALLENGE_NOT_RESOLVED");
    expect(await errorOf(one(O, "select * from confirm_challenge($1, true)", [rs[0].id]))).toBe("NOTHING_TO_CONFIRM");
    expect((await one(X, "select * from complete_challenge($1, true)", [rs[0].id])).outcome).toBe("claimed");
    expect(await errorOf(one(X, "select * from complete_challenge($1, true)", [rs[0].id]))).toBe("CHALLENGE_ALREADY_DONE");
  });

  it("only the partner confirms; confirmation scores 15 points", async () => {
    expect(await errorOf(one(X, "select * from confirm_challenge($1, true)", [rs[0].id]))).toBe("PARTNER_MUST_CONFIRM");
    expect(await errorOf(one(X, "select * from next_card($1, 1)", [s.id]))).toBe("CHALLENGE_NOT_RESOLVED"); // claimed isn't enough
    expect((await one(O, "select * from confirm_challenge($1, true)", [rs[0].id])).outcome).toBe("completed");
    expect((await session(s.id)).points).toBe(15);
    expect((await one(O, "select * from next_card($1, 1)", [s.id])).current_round).toBe(2);
  });

  it("round 2 belongs to O; outsiders can't act; old rounds are locked", async () => {
    expect(await errorOf(one(X, "select * from complete_challenge($1, true)", [rs[1].id]))).toBe("NOT_YOUR_CHALLENGE");
    expect(await errorOf(one(Z, "select * from complete_challenge($1, true)", [rs[1].id]))).toBe("ROUND_NOT_FOUND");
    expect(await errorOf(one(O, "select * from complete_challenge($1, true)", [rs[0].id]))).toBe("ROUND_NOT_CURRENT");
    await one(O, "select * from complete_challenge($1, true)", [rs[1].id]);
    expect((await one(X, "select * from confirm_challenge($1, false)", [rs[1].id])).outcome).toBe("failed"); // "not quite": no points
    await one(X, "select * from next_card($1, 2)", [s.id]);
  });

  it("skip, finish, and a server-side summary with the streak", async () => {
    await one(X, "select * from complete_challenge($1, false)", [rs[2].id]); // round 3: X skips
    await one(X, "select * from next_card($1, 3)", [s.id]);
    for (const [i, perf, partner] of [[3, O, X], [4, X, O]] as const) {
      await one(perf, "select * from complete_challenge($1, true)", [rs[i].id]);
      await one(partner, "select * from confirm_challenge($1, true)", [rs[i].id]);
      await one(perf, "select * from next_card($1, $2)", [s.id, i + 1]);
    }
    const done = await session(s.id);
    // completed: rounds 1, 4, 5 · failed: 2 · skipped: 3 · streak = the last two completed in a row
    expect(done).toMatchObject({ status: "finished", points: 45 });
    expect(done.result).toEqual({ completed: 3, failed: 1, skipped: 1, streak: 2 });
  });

  it("the streak carries across sessions and resets on a skip", async () => {
    const play = async (outcomes: ("done" | "skip")[]) => {
      const s2 = await one(X, "select * from start_session($1, 'challenges', null)", [room.id]);
      const r2 = await rounds(s2.id);
      for (let i = 0; i < r2.length; i++) {
        const [perf, partner] = i % 2 === 0 ? [X, O] : [O, X];
        if (outcomes[i] === "skip") await one(perf, "select * from complete_challenge($1, false)", [r2[i].id]);
        else {
          await one(perf, "select * from complete_challenge($1, true)", [r2[i].id]);
          await one(partner, "select * from confirm_challenge($1, true)", [r2[i].id]);
        }
        await one(perf, "select * from next_card($1, $2)", [s2.id, i + 1]);
      }
      return (await session(s2.id)).result.streak;
    };
    expect(await play(["done", "done", "done", "done", "done"])).toBe(7); // 2 from before + 5
    expect(await play(["done", "done", "done", "skip", "done"])).toBe(1);
  });
});

describe("compatibility is unchanged", () => {
  it("still deals 10 questions from the chosen category; Memories still waits for stage 4", async () => {
    const room = await coupleRoom();
    const s = await one(X, "select * from start_session($1, 'compatibility', 'travel')", [room.id]);
    expect(s).toMatchObject({ mode: "compatibility", category: "travel", total_rounds: 10 });
    await one(X, "select * from quit_session($1)", [s.id]);
    expect(await errorOf(one(X, "select * from start_session($1, 'memories', null)", [room.id]))).toBe("MODE_NOT_AVAILABLE");
    expect(await errorOf(one(X, "select * from next_card($1, 1)", [s.id]))).toBe("MODE_NOT_AVAILABLE");
  });
});
