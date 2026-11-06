import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [R, G, Y, Z] = [141, 142, 143, 144].map(uid); // host, two guests, outsider
let t: Db;
let room: Row;
let n = 0;
const cid = () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
const one = async (who: string, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
const send = (who: string, body: string, roomId = room.id) => one(who, "select * from send_message($1, $2, $3)", [roomId, body, cid()]);
const read = (who: string, roomId = room.id) => t.as<Row>(who, "select sender_id, body from room_messages where room_id = $1 order by created_at, id", [roomId]);

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[R, "Rahul"], [G, "Durgesh"], [Y, "Priya"], [Z, "Zed"]]) await t.addPlayer(id, name);
  room = await one(R, "select * from create_room_for('ludo')");
  await one(R, "select * from set_ludo_options($1, 4, 'quick')", [room.id]);
  await one(G, "select * from join_room($1)", [room.code]);
  await one(Y, "select * from join_room($1)", [room.code]);
});

describe("Ludo group chat", () => {
  it("every seated player can send, and everyone at the table reads all of it", async () => {
    await send(R, "Hi all");
    await send(G, "Hello!");
    await send(Y, "Let's go 🎲");
    for (const who of [R, G, Y]) expect((await read(who)).map((m) => m.body)).toEqual(["Hi all", "Hello!", "Let's go 🎲"]);
  });

  it("outsiders can't read or send", async () => {
    expect(await read(Z)).toEqual([]);
    expect(await errorOf(send(Z, "spam"))).toBe("ROOM_NOT_FOUND");
  });

  it("a player who leaves loses access", async () => {
    await one(Y, "select leave_room($1)", [room.id]);
    expect(await read(Y)).toEqual([]);
    expect(await errorOf(send(Y, "still here?"))).toBe("ROOM_NOT_FOUND");
    expect(await read(G)).toHaveLength(3);
  });

  it("Tic-Tac-Toe rooms are unchanged: only the two players", async () => {
    const ttt = await t.addRoom(R, G);
    await send(R, "gg", ttt);
    expect(await read(G, ttt)).toHaveLength(1);
    expect(await read(Y, ttt)).toEqual([]);
    expect(await errorOf(send(Y, "hi", ttt))).toBe("ROOM_NOT_FOUND");
  });
});
