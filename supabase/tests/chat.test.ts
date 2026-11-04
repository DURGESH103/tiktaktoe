import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const A = uid(21);
const B = uid(22);
const C = uid(23);
let t: Db;
let room: string;
let n = 0;
const cid = () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
const send = async (who: string, body: string, clientId = cid(), roomId = room) =>
  (await t.as<Row>(who, "select * from send_message($1, $2, $3)", [roomId, body, clientId]))[0];

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[A, "Rahul"], [B, "Durgesh"], [C, "Carol"]]) await t.addPlayer(id, name);
  room = await t.addRoom(A, B);
});

describe("send_message", () => {
  it("stores a trimmed message from a room member", async () => {
    const m = await send(A, "   Good   game!  ");
    expect(m).toMatchObject({ room_id: room, sender_id: A, body: "Good game!" });
  });

  it("strips control characters and newlines", async () => {
    expect((await send(B, "hi\n\tthere\u0007")).body).toBe("hi there");
  });

  it("blocks empty and whitespace-only messages", async () => {
    expect(await errorOf(send(A, ""))).toBe("MESSAGE_EMPTY");
    expect(await errorOf(send(A, "   \n "))).toBe("MESSAGE_EMPTY");
  });

  it("caps length at 200 characters (emoji count as one)", async () => {
    expect((await send(B, "😀".repeat(200))).body).toHaveLength(400); // 200 code points = 400 UTF-16 units
    expect(await errorOf(send(B, "x".repeat(201)))).toBe("MESSAGE_TOO_LONG");
  });

  it("is idempotent per client_id (tap to retry never duplicates)", async () => {
    const id = cid();
    const first = await send(A, "Rematch?", id);
    const again = await send(A, "Rematch?", id);
    expect(again.id).toBe(first.id);
  });

  it("rate-limits to 5 messages per 10 seconds per sender", async () => {
    const r2 = await t.addRoom(C, A);
    for (let i = 0; i < 5; i++) await send(C, `msg ${i}`, cid(), r2);
    expect(await errorOf(send(C, "one too many", cid(), r2))).toBe("RATE_LIMITED");
    // The other player isn't affected by C's limit.
    expect((await send(A, "still fine", cid(), r2)).body).toBe("still fine");
  });

  it("rejects outsiders and closed rooms", async () => {
    expect(await errorOf(send(C, "let me in"))).toBe("ROOM_NOT_FOUND");
    const closed = await t.addRoom(A, B, "abandoned");
    expect(await errorOf(send(A, "hello?", cid(), closed))).toBe("ROOM_CLOSED");
  });
});

describe("room_messages access", () => {
  it("only the two players can read a room's messages", async () => {
    expect((await t.as(A, "select * from room_messages where room_id = $1", [room])).length).toBeGreaterThan(0);
    expect((await t.as(B, "select * from room_messages where room_id = $1", [room])).length).toBeGreaterThan(0);
    expect(await t.as(C, "select * from room_messages where room_id = $1", [room])).toHaveLength(0);
    expect(await errorOf(t.as(null, "select * from room_messages"))).toMatch(/permission denied/);
  });

  it("blocks writing around the RPC", async () => {
    expect(
      await errorOf(t.as(A, "insert into room_messages (room_id, sender_id, body, client_id) values ($1, $2, 'x', $3)", [room, A, cid()])),
    ).toMatch(/permission denied/);
    expect(await errorOf(t.as(A, "update room_messages set body = 'edited'"))).toMatch(/permission denied/);
    expect(await errorOf(t.as(A, "delete from room_messages"))).toMatch(/permission denied/);
  });
});
