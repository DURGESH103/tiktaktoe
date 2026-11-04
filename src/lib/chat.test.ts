import { describe, expect, it } from "vitest";
import { cleanMessage, uuid4, validateMessage } from "./chat";

describe("validateMessage", () => {
  it("trims and collapses whitespace like the server", () => {
    expect(validateMessage("   Good   game!  ")).toEqual({ ok: true, body: "Good game!" });
    expect(cleanMessage("hi\n\tthere\u0007")).toBe("hi there");
  });

  it("rejects empty and whitespace-only messages", () => {
    expect(validateMessage("")).toMatchObject({ ok: false, reason: "empty" });
    expect(validateMessage("  \n\t ")).toMatchObject({ ok: false, reason: "empty" });
  });

  it("allows exactly 200 characters and rejects 201", () => {
    expect(validateMessage("x".repeat(200)).ok).toBe(true);
    expect(validateMessage("x".repeat(201))).toMatchObject({ ok: false, reason: "too_long", length: 201 });
  });

  it("counts an emoji as one character, matching Postgres char_length", () => {
    expect(validateMessage("😀".repeat(200)).ok).toBe(true);
    expect(validateMessage("😀".repeat(201))).toMatchObject({ ok: false, reason: "too_long" });
  });

  it("keeps markup as plain text (rendering escapes it)", () => {
    expect(validateMessage("<img src=x onerror=alert(1)>")).toEqual({ ok: true, body: "<img src=x onerror=alert(1)>" });
  });
});

describe("uuid4", () => {
  it("produces valid, unique v4 ids", () => {
    const ids = new Set(Array.from({ length: 100 }, uuid4));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
