import { describe, expect, it } from "vitest";
import { errorDetail, toErrorCode } from "./errors";

describe("toErrorCode", () => {
  it("passes through the codes our SQL functions raise", () => {
    expect(toErrorCode({ code: "P0001", message: "RATE_LIMITED" })).toBe("RATE_LIMITED");
  });

  it("recognises a missing table or function (migration not run)", () => {
    expect(toErrorCode({ code: "PGRST202", message: "Could not find the function public.send_message…" })).toBe("NOT_SET_UP");
    expect(toErrorCode({ code: "PGRST205", message: "Could not find the table 'public.room_messages'…" })).toBe("NOT_SET_UP");
  });

  it("detects network failures and falls back to UNKNOWN", () => {
    expect(toErrorCode(new TypeError("Failed to fetch"))).toBe("NETWORK");
    expect(toErrorCode({ code: "XX000", message: "boom" })).toBe("UNKNOWN");
  });
});

describe("errorDetail", () => {
  it("summarises code, message and hint on one line", () => {
    expect(errorDetail({ code: "PGRST202", message: "Could not find the function", hint: "Perhaps you meant…" })).toBe(
      "PGRST202 · Could not find the function · Perhaps you meant…",
    );
    expect(errorDetail({ message: "x".repeat(300) })).toHaveLength(140);
    expect(errorDetail(null)).toBe("no response");
  });
});
