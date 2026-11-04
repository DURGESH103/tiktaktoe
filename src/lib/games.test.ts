import { describe, expect, it } from "vitest";
import { roomPath } from "./games";

describe("roomPath", () => {
  it("routes each game to its own URL, defaulting to Tic-Tac-Toe", () => {
    expect(roomPath("K7P2Q", "tictactoe")).toBe("/game/K7P2Q");
    expect(roomPath("K7P2Q", "couple")).toBe("/couple/K7P2Q");
    expect(roomPath("K7P2Q", undefined)).toBe("/game/K7P2Q"); // rooms from before game types
  });
});
