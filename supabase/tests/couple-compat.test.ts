import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [X, O, Z] = [61, 62, 63].map(uid); // Rahul (X), Durgesh (O), outsider
let t: Db;

const one = async (who: string | null, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
const coupleRoom = async () => {
  const room = await one(X, "select * from create_room_for('couple')");
  await one(O, "select * from join_room($1)", [room.code]);
  return room;
};
const start = (roomId: string, category = "food") => one(X, "select * from start_session($1, 'compatibility', $2)", [roomId, category]);
const rounds = async (sessionId: string) => (await t.db.query<Row>("select * from couple_rounds where session_id = $1 order by idx", [sessionId])).rows;
const answer = (who: string, roundId: string, self: number, guess: number) =>
  one(who, "select * from submit_answer($1, $2, $3)", [roundId, self, guess]);

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[X, "Rahul"], [O, "Durgesh"], [Z, "Zed"]]) await t.addPlayer(id, name);
});

describe("content", () => {
  it("has at least 150 prompts across all modes, each in English and Hinglish", async () => {
    const { rows } = await t.db.query<Row>("select mode, count(*)::int n from couple_questions group by mode order by mode");
    const byMode = Object.fromEntries(rows.map((r) => [r.mode, r.n]));
    expect(byMode).toEqual({ challenges: 25, compatibility: 70, memories: 25, questions: 36 });
    const missing = await t.db.query("select id from couple_questions where btrim(text_en) = '' or btrim(text_hi) = ''");
    expect(missing.rows).toHaveLength(0);
    const cats = await t.db.query<Row>("select category, count(*)::int n from couple_questions where mode = 'compatibility' group by category");
    expect(cats.rows.map((r) => [r.category, r.n]).sort()).toEqual(
      ["food", "funny", "future", "habits", "lifestyle", "love", "travel"].map((c) => [c, 10]),
    );
  });
});

describe("scoring (server-side)", () => {
  it("compatibility % = correct guesses / (2 × questions), clamped and rounded", async () => {
    const pct = async (x: number, o: number, n: number) => (await t.db.query<Row>("select _compat_pct($1, $2, $3) p", [x, o, n])).rows[0].p;
    expect(await pct(10, 10, 10)).toBe(100);
    expect(await pct(7, 8, 10)).toBe(75);
    expect(await pct(1, 0, 10)).toBe(5);
    expect(await pct(0, 0, 10)).toBe(0);
    expect(await pct(3, 4, 0)).toBe(0);
  });

  it("titles: Soulmates ≥75, Perfect Chaos 45–74, Still Learning <45", async () => {
    const title = async (p: number) => (await t.db.query<Row>("select _compat_title($1) t", [p])).rows[0].t;
    expect([await title(100), await title(75), await title(74), await title(45), await title(44), await title(0)]).toEqual([
      "soulmates", "soulmates", "perfect_chaos", "perfect_chaos", "still_learning", "still_learning",
    ]);
  });
});

describe("a full Compatibility Test", () => {
  let room: Row;
  let session: Row;
  let rs: Row[];

  it("starts 10 rounds from the chosen category; a second Start returns the same session", async () => {
    room = await coupleRoom();
    session = await start(room.id);
    expect(session).toMatchObject({ mode: "compatibility", category: "food", status: "active", current_round: 1, total_rounds: 10 });
    expect((await one(O, "select * from start_session($1, 'compatibility', 'love')", [room.id])).id).toBe(session.id);
    rs = await rounds(session.id);
    expect(rs).toHaveLength(10);
    const cats = await t.db.query<Row>("select distinct q.category from couple_rounds r join couple_questions q on q.id = r.question_id where r.session_id = $1", [session.id]);
    expect(cats.rows.map((r) => r.category)).toEqual(["food"]);
  });

  it("hides the partner's answer until both have answered", async () => {
    const r1 = rs[0];
    const after = await answer(X, r1.id, 1, 2);
    expect(after).toMatchObject({ x_answered: true, o_answered: false, revealed_at: null });
    // Durgesh can see that Rahul answered (the "answered" flag) but not what he answered.
    expect(await t.as(O, "select * from couple_answers where round_id = $1", [r1.id])).toEqual([]);
    expect((await t.as(X, "select * from couple_answers where round_id = $1", [r1.id])).length).toBe(1); // own answer
    // An outsider sees nothing at all.
    expect(await t.as(Z, "select * from couple_answers")).toEqual([]);
    expect(await t.as(Z, "select * from couple_sessions")).toEqual([]);
    expect(await t.as(Z, "select * from couple_rounds")).toEqual([]);

    const revealed = await answer(O, r1.id, 2, 1);
    expect(revealed.revealed_at).not.toBeNull();
    expect((await t.as(O, "select * from couple_answers where round_id = $1", [r1.id])).length).toBe(2);
    expect(await t.as(Z, "select * from couple_answers where round_id = $1", [r1.id])).toEqual([]);
  });

  it("validates answers and the round order", async () => {
    expect(await errorOf(answer(X, rs[0].id, 0, 0))).toBe("ROUND_REVEALED");
    expect(await errorOf(answer(X, rs[1].id, 0, 0))).toBe("ROUND_NOT_CURRENT");
    // "Next" from a round we're not on is a harmless no-op.
    expect((await one(X, "select * from next_round($1, 2)", [session.id])).current_round).toBe(1);
    expect(await errorOf(answer(Z, rs[0].id, 0, 0))).toBe("ROUND_NOT_FOUND");
  });

  it("Next is idempotent when both players tap it", async () => {
    const a = await one(X, "select * from next_round($1, 1)", [session.id]);
    const b = await one(O, "select * from next_round($1, 1)", [session.id]);
    expect([a.current_round, b.current_round]).toEqual([2, 2]);
    expect(await errorOf(answer(X, rs[1].id, 9, 0))).toBe("INVALID_ANSWER");
    expect(await errorOf(one(X, "select * from next_round($1, 2)", [session.id]))).toBe("ROUND_NOT_REVEALED");
  });

  it("finishes after round 10 with a server-calculated score and title", async () => {
    // Round 1 (already answered): X self 1 guess 2; O self 2 guess 1 → both guessed right.
    // Rounds 2–10: Rahul always guesses right, Durgesh guesses right on rounds 2–5 only.
    for (let i = 1; i < 10; i++) {
      await answer(X, rs[i].id, 0, 1); // Rahul: self 0, guesses Durgesh = 1
      await answer(O, rs[i].id, 1, i <= 4 ? 0 : 1); // Durgesh: self 1, guesses Rahul = 0 on rounds 2–5
      const s = await one(X, "select * from next_round($1, $2)", [session.id, i + 1]);
      if (i < 9) expect(s.current_round).toBe(i + 2);
      else session = s;
    }
    // Rahul (X) correct 10/10; Durgesh (O) correct 1 + 4 = 5 → 15/20 = 75% → Soulmates.
    expect(session).toMatchObject({ status: "finished", compat_pct: 75, points: 150 });
    expect(session.result).toEqual({ x_correct: 10, o_correct: 5, same_answers: 0, title: "soulmates" });
    expect(await errorOf(answer(X, rs[9].id, 0, 0))).toBe("SESSION_NOT_ACTIVE");
  });

  it("quit ends a session early", async () => {
    const s = await start(room.id, "love");
    expect((await one(O, "select * from quit_session($1)", [s.id])).status).toBe("abandoned");
  });
});

describe("question rotation", () => {
  it("doesn't repeat a question for the same pair until the category is used up", async () => {
    const room = await coupleRoom(); // same pair, fresh room
    const seen: number[][] = [];
    for (const cat of ["travel", "travel"]) {
      const s = await start(room.id, cat);
      seen.push((await rounds(s.id)).map((r) => r.question_id));
      await one(X, "select * from quit_session($1)", [s.id]);
    }
    // travel has exactly 10 questions: the first session used all of them, so the second starts a new cycle.
    expect(new Set(seen[0]).size).toBe(10);
    expect(new Set(seen[1]).size).toBe(10);

    // A category with spare questions: two sessions of 10 from a pool larger than 10 never overlap.
    await t.db.query(
      "insert into couple_questions (mode, category, text_en, text_hi, options) select 'compatibility', 'extra', 'Q' || g, 'Q' || g, '[{\"en\":\"a\",\"hi\":\"a\"},{\"en\":\"b\",\"hi\":\"b\"}]' from generate_series(1, 25) g",
    );
    const a = await start(room.id, "extra");
    const ids1 = (await rounds(a.id)).map((r) => r.question_id);
    await one(X, "select * from quit_session($1)", [a.id]);
    const b = await start(room.id, "extra");
    const ids2 = (await rounds(b.id)).map((r) => r.question_id);
    await one(X, "select * from quit_session($1)", [b.id]);
    expect(ids1.filter((id) => ids2.includes(id))).toEqual([]);
    // Third session: only 5 unseen left → those 5 plus 5 from a new cycle, no duplicates within the session.
    const c = await start(room.id, "extra");
    const ids3 = (await rounds(c.id)).map((r) => r.question_id);
    expect(new Set(ids3).size).toBe(10);
    const unseen = (await t.db.query<Row>("select id from couple_questions where category = 'extra'")).rows
      .map((r) => r.id)
      .filter((id) => !ids1.includes(id) && !ids2.includes(id));
    expect(unseen.every((id) => ids3.includes(id))).toBe(true);
  });
});

describe("access rules", () => {
  it("only room members can start; only couple rooms; blocked pairs can't play", async () => {
    const room = await coupleRoom();
    expect(await errorOf(one(Z, "select * from start_session($1, 'compatibility', 'food')", [room.id]))).toBe("ROOM_NOT_FOUND");
    const ttt = await one(X, "select * from create_room()");
    await one(O, "select * from join_room($1)", [ttt.code]);
    expect(await errorOf(start(ttt.id))).toBe("ROOM_NOT_FOUND");
    expect(await errorOf(start(room.id, "nope"))).toBe("INVALID_CATEGORY");
    expect(await errorOf(one(X, "select * from start_session($1, 'karaoke', null)", [room.id]))).toBe("MODE_NOT_AVAILABLE");
    const handle = (await t.db.query<Row>("select handle from players where id = $1", [X])).rows[0].handle;
    await one(O, "select block_user($1)", [handle]);
    expect(await errorOf(start(room.id))).toBe("BLOCKED");
  });

  it("no direct writes; usage history is private", async () => {
    expect(await errorOf(t.as(X, "insert into couple_answers (round_id, player_id, self_answer) values (gen_random_uuid(), $1, 0)", [X]))).toMatch(/permission denied/);
    expect(await errorOf(t.as(X, "update couple_sessions set compat_pct = 100"))).toMatch(/permission denied/);
    expect(await errorOf(t.as(X, "select * from couple_question_usage"))).toMatch(/permission denied/);
    expect(await errorOf(t.as(X, "select _finish_compat(gen_random_uuid())"))).toMatch(/permission denied/);
    expect(await errorOf(t.as(null, "select * from couple_questions"))).toMatch(/permission denied/);
  });
});
