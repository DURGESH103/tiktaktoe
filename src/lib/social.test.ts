import { describe, expect, it } from "vitest";
import { canChallenge, relationFor, secondsLeft, sortFriends, statusLabel, type FriendEntry, type FriendsData, type FriendStatus } from "./social";

const p = (handle: string, name = handle) => ({ handle, name, avatar: "😎", color: "violet" });
const f = (handle: string, last_seen_at: string | null = null): FriendEntry => ({
  player: p(handle),
  since: "2026-01-01T00:00:00Z",
  last_seen_at,
  head_to_head: { wins: 0, losses: 0, draws: 0, total: 0, last_played_at: null },
});

describe("sortFriends", () => {
  it("orders online, away, in a game, then offline by most recently seen", () => {
    const status: Record<string, FriendStatus> = { a: "offline", b: "in_game", c: "online", d: "offline", e: "away", f: "offline" };
    const list = [f("a", "2026-01-01T10:00:00Z"), f("b"), f("c"), f("d", "2026-01-01T12:00:00Z"), f("e"), f("f")];
    expect(sortFriends(list, (h) => status[h]).map((x) => x.player.handle)).toEqual(["c", "e", "b", "d", "a", "f"]);
  });

  it("breaks ties by name", () => {
    const list = [f("zed"), f("amy")];
    expect(sortFriends(list, () => "online").map((x) => x.player.handle)).toEqual(["amy", "zed"]);
  });
});

describe("statusLabel / canChallenge", () => {
  it("describes each state", () => {
    const now = Date.parse("2026-01-01T12:05:00Z");
    expect(statusLabel("online", null)).toBe("Online");
    expect(statusLabel("in_game", null)).toBe("In a game");
    expect(statusLabel("offline", "2026-01-01T12:00:00Z", now)).toBe("Last seen 5 minutes ago");
    expect(statusLabel("offline", null)).toBe("Offline");
  });

  it("only allows challenging friends who are online or away", () => {
    expect(["online", "away", "in_game", "offline"].map((s) => canChallenge(s as FriendStatus))).toEqual([true, true, false, false]);
  });
});

describe("relationFor", () => {
  const data: FriendsData = {
    friends: [f("fr")],
    incoming: [{ player: p("in"), at: "" }],
    outgoing: [{ player: p("out"), at: "" }],
    blocked: [{ player: p("bl"), at: "" }],
  };
  it("maps a handle to the button state", () => {
    expect(["fr", "in", "out", "bl", "x", "me"].map((h) => relationFor(h, data, "me"))).toEqual([
      "friends", "incoming", "requested", "blocked", "none", "self",
    ]);
  });
});

describe("secondsLeft", () => {
  it("counts down using the server clock offset", () => {
    const c = { expires_at: "2026-01-01T12:01:00Z" };
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(secondsLeft(c, 0, now)).toBe(60);
    expect(secondsLeft(c, 15_000, now)).toBe(45); // this phone's clock is 15 s behind the server
    expect(secondsLeft(c, 0, now + 120_000)).toBe(0);
  });
});
