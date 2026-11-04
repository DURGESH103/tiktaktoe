import { describe, expect, it } from "vitest";
import { createRateLimiter, isReaction, reactionLabel } from "./reactions";

describe("isReaction", () => {
  it("accepts only the fixed emoji set", () => {
    expect(isReaction("🔥")).toBe(true);
    expect(isReaction("GG")).toBe(true);
    expect(isReaction("💩")).toBe(false);
    expect(isReaction("👍")).toBe(false); // not in the set any more
    expect(isReaction("hello")).toBe(false);
    expect(isReaction(undefined)).toBe(false);
    expect(isReaction({ emoji: "🔥" })).toBe(false);
  });

  it("has a spoken label for each emoji", () => {
    expect(reactionLabel("😂")).toBe("laughing");
    expect(reactionLabel("GG")).toBe("good game");
  });
});

describe("createRateLimiter", () => {
  it("by default lets through about one per second", () => {
    const allow = createRateLimiter();
    expect([0, 100, 200, 1000, 1950, 2000].map((t) => allow("a", t))).toEqual([true, true, false, false, true, true]);
  });

  it("allows up to max per window, per sender", () => {
    const allow = createRateLimiter(3, 1000);
    expect([0, 10, 20, 30].map((t) => allow("a", t))).toEqual([true, true, true, false]);
    expect(allow("b", 30)).toBe(true); // other senders unaffected
  });

  it("frees up again once old events leave the window", () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 500)).toBe(true);
    expect(allow("a", 900)).toBe(false);
    expect(allow("a", 1001)).toBe(true); // the event at 0 has expired
  });
});
