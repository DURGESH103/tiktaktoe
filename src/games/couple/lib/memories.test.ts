import { describe, expect, it } from "vitest";
import type { CoupleQuestion } from "../types";
import { charLength, cleanText, fitWithin, memoryTitle, memoryVoteState, pairFolder, photoPath } from "./memories";

const A = "11111111-1111-4111-8111-111111111111";
const B = "99999999-9999-4999-8999-999999999999";

describe("pairFolder / photoPath", () => {
  it("is the same folder whichever partner asks", () => {
    expect(pairFolder(A, B)).toBe(`${A}_${B}`);
    expect(pairFolder(B, A)).toBe(`${A}_${B}`);
    expect(photoPath(pairFolder(B, A), "abc", "webp")).toBe(`${A}_${B}/abc.webp`);
  });
});

describe("fitWithin", () => {
  it("shrinks the longer side to the limit and keeps the ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1080, 1920, 1600)).toEqual({ width: 900, height: 1600 });
  });
  it("never enlarges small photos", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("cleanText / charLength", () => {
  it("matches the server's clean-up", () => {
    expect(cleanText("  At the\n\ncollege\tcanteen  ")).toBe("At the college canteen");
  });
  it("counts an emoji as one character", () => {
    expect(charLength("chai ☕💞")).toBe(7);
  });
});

describe("memoryVoteState", () => {
  it("reads votes from my seat", () => {
    expect(memoryVoteState({ x_match: true, o_match: null, outcome: null }, "X")).toEqual({ myVote: true, partnerVoted: false, decided: false, matched: false });
    expect(memoryVoteState({ x_match: true, o_match: null, outcome: null }, "O")).toEqual({ myVote: null, partnerVoted: true, decided: false, matched: false });
  });
  it("knows when the round is decided", () => {
    expect(memoryVoteState({ x_match: true, o_match: true, outcome: "matched" }, "X")).toMatchObject({ decided: true, matched: true });
    expect(memoryVoteState({ x_match: true, o_match: false, outcome: "different" }, "O")).toMatchObject({ decided: true, matched: false, myVote: false });
  });
});

describe("memoryTitle", () => {
  const q = { id: 7, text_en: "Where did we first meet?", text_hi: "Hum pehli baar kahan mile the?" } as CoupleQuestion;
  it("shows the prompt in my language when the memory came from a prompt", () => {
    expect(memoryTitle({ title: "Where did we first meet?", question_id: 7 }, { 7: q }, "hi")).toBe("Hum pehli baar kahan mile the?");
  });
  it("falls back to the saved title", () => {
    expect(memoryTitle({ title: "Our Goa trip", question_id: null }, {}, "hi")).toBe("Our Goa trip");
  });
});
