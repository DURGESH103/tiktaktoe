import { describe, expect, it } from "vitest";
import { CATEGORIES, categoryLabel, knowsBetter, optionText, questionText, TITLES } from "./compat";

describe("knowsBetter", () => {
  it("compares how many of the partner's answers each person guessed right", () => {
    expect(knowsBetter({ x_correct: 10, o_correct: 5 })).toBe("X");
    expect(knowsBetter({ x_correct: 3, o_correct: 7 })).toBe("O");
    expect(knowsBetter({ x_correct: 6, o_correct: 6 })).toBe("tie");
  });
});

describe("display helpers", () => {
  const q = { text_en: "Chai or coffee?", text_hi: "Chai ya coffee?", options: [{ en: "Chai", hi: "Chai" }, { en: "Neither", hi: "Koi nahi" }] };

  it("shows each player's chosen language", () => {
    expect(questionText(q, "en")).toBe("Chai or coffee?");
    expect(questionText(q, "hi")).toBe("Chai ya coffee?");
    expect(optionText(q, 1, "hi")).toBe("Koi nahi");
    expect(optionText(q, null, "en")).toBe("—");
    expect(optionText(q, 7, "en")).toBe("—");
  });

  it("has all 7 categories and the 3 titles", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["love", "lifestyle", "food", "travel", "habits", "future", "funny"]);
    expect(categoryLabel("food", "hi")).toBe("Khana");
    expect(Object.keys(TITLES)).toEqual(["soulmates", "perfect_chaos", "still_learning"]);
    expect(TITLES.soulmates.label).toBe("Soulmates 💖");
  });
});
