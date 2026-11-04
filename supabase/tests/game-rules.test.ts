import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const A = uid(11);
const B = uid(12);
const C = uid(13);
let t: Db;
let room: Row;
let g1: Row;

const move = async (who: string, game: string, cell: number) =>
  (await t.as<Row>(who, "select * from make_move($1, $2)", [game, cell]))[0];

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[A, "Alice"], [B, "Bob"], [C, "Carol"]]) await t.addPlayer(id, name);
});

describe("rooms", () => {
  it("creates a waiting room with a valid code", async () => {
    [room] = await t.as<Row>(A, "select * from create_room()");
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(room.status).toBe("waiting");
  });

  it("lets a second player join (code is case-insensitive) and starts round 1", async () => {
    expect(await errorOf(t.as(B, "select * from join_room('ZZZZZ')"))).toBe("ROOM_NOT_FOUND");
    const [joined] = await t.as<Row>(B, "select * from join_room($1)", [room.code.toLowerCase()]);
    expect(joined).toMatchObject({ player_o: B, status: "playing" });
    [g1] = await t.as<Row>(A, "select * from games where room_id = $1", [room.id]);
    expect(g1).toMatchObject({ round: 1, current_turn: "X" });
  });

  it("re-joining as a member is a no-op (refresh), a third player gets ROOM_FULL", async () => {
    expect((await t.as<Row>(A, "select * from join_room($1)", [room.code]))[0].id).toBe(room.id);
    expect(await errorOf(t.as(C, "select * from join_room($1)", [room.code]))).toBe("ROOM_FULL");
  });

  it("hides rooms and games from outsiders and blocks direct writes", async () => {
    expect(await t.as(C, "select * from rooms")).toHaveLength(0);
    expect(await t.as(C, "select * from games")).toHaveLength(0);
    expect(await errorOf(t.as(A, "update games set board = 'XXX......'"))).toMatch(/permission denied/);
    expect(await errorOf(t.as(A, "insert into rooms (code, player_x) values ('AAAAA', $1)", [A]))).toMatch(/permission denied/);
  });
});

describe("moves", () => {
  it("enforces turn order, valid cells and empty cells", async () => {
    expect(await errorOf(move(B, g1.id, 0))).toBe("NOT_YOUR_TURN");
    expect(await errorOf(move(C, g1.id, 0))).toBe("GAME_NOT_FOUND");
    expect(await errorOf(move(A, g1.id, 9))).toBe("INVALID_CELL");
    expect(await move(A, g1.id, 0)).toMatchObject({ board: "X........", current_turn: "O" });
    expect(await errorOf(move(A, g1.id, 1))).toBe("NOT_YOUR_TURN");
    expect(await errorOf(move(B, g1.id, 0))).toBe("CELL_TAKEN");
  });

  it("detects a win on the server and closes the round", async () => {
    await move(B, g1.id, 3);
    await move(A, g1.id, 1);
    await move(B, g1.id, 4);
    const s = await move(A, g1.id, 2);
    expect(s).toMatchObject({ status: "finished", winner: "X", winning_line: [0, 1, 2], current_turn: null });
    expect(s.moves).toHaveLength(5);
    expect(await errorOf(move(B, g1.id, 8))).toBe("GAME_NOT_PLAYING");
  });
});

describe("rematch and leave", () => {
  it("alternates who starts, is idempotent, and detects draws", async () => {
    const [g2] = await t.as<Row>(B, "select * from request_rematch($1)", [room.id]);
    expect(g2).toMatchObject({ round: 2, starting_turn: "O", current_turn: "O" });
    expect((await t.as<Row>(A, "select * from request_rematch($1)", [room.id]))[0].id).toBe(g2.id);

    let s: Row = {};
    for (const [who, cell] of [[B, 0], [A, 1], [B, 2], [A, 4], [B, 3], [A, 5], [B, 7], [A, 6], [B, 8]] as const)
      s = await move(who, g2.id, cell);
    expect(s).toMatchObject({ status: "finished", winner: "draw", winning_line: null });

    const [g3] = await t.as<Row>(A, "select * from request_rematch($1)", [room.id]);
    expect(g3).toMatchObject({ round: 3, starting_turn: "X" });
  });

  it("leaving closes the room and its live round", async () => {
    await t.as(B, "select leave_room($1)", [room.id]);
    const [r] = await t.as<Row>(A, "select * from rooms where id = $1", [room.id]);
    expect(r.status).toBe("abandoned");
    expect(await errorOf(t.as(C, "select * from join_room($1)", [room.code]))).toBe("ROOM_CLOSED");
    expect(await errorOf(t.as(A, "select * from request_rematch($1)", [room.id]))).toBe("ROOM_NOT_ACTIVE");
  });
});

describe("access", () => {
  it("requires a profile and a signed-in user", async () => {
    await t.db.query("insert into auth.users values ($1)", [uid(19)]);
    expect(await errorOf(t.as(uid(19), "select * from create_room()"))).toBe("NO_PROFILE");
    expect(await errorOf(t.as(null, "select * from create_room()"))).toMatch(/permission denied/);
  });
});
