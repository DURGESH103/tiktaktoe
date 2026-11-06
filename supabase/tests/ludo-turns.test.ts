import { beforeAll, describe, expect, it } from "vitest";
import { createDb, errorOf, uid } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [R, G, Y, B, Z] = [131, 132, 133, 134, 135].map(uid); // red host, green, yellow, blue, outsider
let t: Db;
const one = async (who: string | null, sql: string, params: unknown[] = []) => (await t.as<Row>(who, sql, params))[0];
const game = async (id: string) => (await t.db.query<Row>("select * from ludo_games where id = $1", [id])).rows[0];
const queueDice = (roomId: string, values: number[]) =>
  t.db.query("insert into ludo_test_dice (room_id, value) select $1, unnest($2::smallint[])", [roomId, values]);
/** Simulates the clock running out (the trigger leaves direct deadline edits alone). */
const expire = (id: string) => t.db.query("update ludo_games set turn_deadline = now() - interval '1 second' where id = $1", [id]);
const secondsLeft = (g: Row) => (new Date(g.turn_deadline).getTime() - new Date(g.turn_started_at).getTime()) / 1000;
const roll = (who: string, g: Row) => one(who, "select * from roll_dice($1, $2)", [g.id, g.seq]);
const timeout = (who: string, g: Row) => one(who, "select * from ludo_timeout($1, $2)", [g.id, g.seq]);

async function table(players: string[], mode = "quick") {
  const room = await one(R, "select * from create_room_for('ludo')");
  await one(R, "select * from set_ludo_options($1, $2, $3)", [room.id, players.length, mode]);
  for (const p of players.slice(1)) {
    await one(p, "select * from join_room($1)", [room.code]);
    await one(p, "select * from set_ludo_ready($1, true)", [room.id]);
  }
  return { room, g: await one(R, "select * from start_ludo($1)", [room.id]) };
}

beforeAll(async () => {
  t = await createDb();
  for (const [id, name] of [[R, "Rahul"], [G, "Durgesh"], [Y, "Priya"], [B, "Kabir"], [Z, "Zed"]]) await t.addPlayer(id, name);
});

describe("3–4 players", () => {
  it("four players take turns clockwise: red, green, yellow, blue", async () => {
    const { g, room } = await table([R, G, Y, B], "classic");
    expect(g.state.colors).toEqual(["red", "green", "yellow", "blue"]);
    await queueDice(room.id, [2, 2, 2, 2]);
    let s = g;
    const turns: string[] = [];
    for (const who of [R, G, Y, B]) {
      turns.push(s.state.turn);
      s = await roll(who, s);
    }
    expect(turns).toEqual(["red", "green", "yellow", "blue"]);
    expect(s.state.turn).toBe("red");
  });

  it("three players use red, green and yellow", async () => {
    const { g } = await table([R, G, Y]);
    expect(Object.keys(g.seats).sort()).toEqual(["green", "red", "yellow"]);
  });
});

describe("turn timer", () => {
  it("each action stamps a 20-second deadline", async () => {
    const { g, room } = await table([R, G]);
    expect(secondsLeft(g)).toBe(20);
    await queueDice(room.id, [6]);
    const s = await roll(R, g); // red: token 0 out + yard tokens → choice → 20 s to move
    expect(s.state.phase).toBe("move");
    expect(secondsLeft(s)).toBe(20);
  });

  it("nobody can trigger a timeout early; outsiders never can", async () => {
    const { g } = await table([R, G]);
    expect(await errorOf(timeout(G, g))).toBe("TOO_EARLY");
    await expire(g.id);
    expect(await errorOf(timeout(Z, await game(g.id)))).toBe("GAME_NOT_FOUND");
  });

  it("after the deadline any player's app can auto-play the turn: roll + best move", async () => {
    const { g, room } = await table([R, G]);
    await queueDice(room.id, [6]);
    await expire(g.id);
    const s = await timeout(G, await game(g.id)); // Durgesh's app plays Rahul's turn
    // 6 with token 0 out: best move brings a new token out (yard beats "most advanced").
    expect(s.state.tokens.red).toEqual([0, 0, -1, -1]);
    expect(s.last_events.map((e: Row) => e.type)).toEqual(["roll", "move"]);
    expect(s.timeouts).toEqual({ red: 1 });
    expect(s.state).toMatchObject({ turn: "red", phase: "roll" }); // the 6 still earns an extra roll
  });

  it("a timeout in the move phase plays the best move with the existing roll", async () => {
    const { g, room } = await table([R, G]);
    await queueDice(room.id, [6]);
    const rolled = await roll(R, g);
    await expire(g.id);
    const s = await timeout(R, await game(g.id));
    expect(s.state.tokens.red).toEqual([0, 0, -1, -1]);
    expect(s.last_roll).toBe(6);
  });

  it("two apps timing out at once: only the first counts", async () => {
    const { g, room } = await table([R, G]);
    await queueDice(room.id, [3]);
    await expire(g.id);
    const seen = await game(g.id);
    await timeout(G, seen);
    expect(await errorOf(timeout(R, seen))).toBe("STALE_MOVE");
    expect((await game(g.id)).timeouts).toEqual({ red: 1 });
  });
});

describe("away players", () => {
  it("3 timeouts in a row → away: their turns auto-play after 1.5 s", async () => {
    const { g, room } = await table([R, G]);
    await queueDice(room.id, [2, 2, 2, 2, 2, 2]);
    let s = g;
    for (let k = 1; k <= 3; k++) {
      await expire(g.id);
      s = await timeout(G, await game(g.id)); // red times out
      expect(s.timeouts.red).toBe(k);
      s = await roll(G, s); // green plays normally
    }
    expect(s.away).toEqual(["red"]);
    expect(s.state.turn).toBe("red");
    expect(secondsLeft(s)).toBe(1.5);
    // Away turns don't count further.
    await expire(g.id);
    s = await timeout(G, await game(g.id));
    expect(s.timeouts.red).toBe(3);
  });

  it("rolling yourself takes back control (count and away cleared)", async () => {
    const { g, room } = await table([R, G]);
    await queueDice(room.id, [2, 2, 2, 2, 2, 2, 2]);
    let s = g;
    for (let k = 0; k < 3; k++) {
      await expire(g.id);
      s = await roll(G, await timeout(G, await game(g.id)));
    }
    expect(s.away).toEqual(["red"]);
    s = await roll(R, s);
    expect(s.away).toEqual([]);
    expect(s.timeouts).toEqual({});
  });

  it("\"I'm back\" clears away and restarts the 20-second clock on your turn", async () => {
    const { g, room } = await table([R, G]);
    await queueDice(room.id, [2, 2, 2, 2, 2, 2]);
    let s = g;
    for (let k = 0; k < 3; k++) {
      await expire(g.id);
      s = await roll(G, await timeout(G, await game(g.id)));
    }
    s = await one(R, "select * from ludo_resume($1)", [g.id]);
    expect(s.away).toEqual([]);
    expect(s.timeouts).toEqual({});
    expect(secondsLeft(s)).toBe(20);
  });
});

describe("leaving mid-game", () => {
  it("a leaver is skipped and ranked last; the game goes on", async () => {
    const { g, room } = await table([R, G, Y]);
    await queueDice(room.id, [2]);
    let s = await roll(R, g); // → green's turn
    await one(G, "select leave_room($1)", [room.id]); // green leaves on their own turn
    s = await game(g.id);
    expect(s.state).toMatchObject({ forfeited: ["green"], turn: "yellow", finished: false });
    expect(s.state.tokens.green).toEqual([-1, -1, -1, -1]);
    expect(s.last_events).toEqual([{ type: "forfeit", color: "green" }]);
    expect(await t.as(G, "select id from ludo_games where id = $1", [g.id])).toEqual([]); // no longer at the table
    // Red finishes → yellow is the last active player → green (left) is last.
    await t.db.query("update ludo_games set state = jsonb_set(jsonb_set(state, '{tokens,red}', '[56,56,56,55]'), '{turn}', '\"red\"') where id = $1", [g.id]);
    await queueDice(room.id, [1]);
    s = await roll(R, await game(g.id));
    expect(s.state).toMatchObject({ finished: true, placements: ["red", "yellow", "green"] });
    expect((await t.db.query<Row>("select status from rooms where id = $1", [room.id])).rows[0].status).toBe("waiting");
  });

  it("when only one player is left, the game ends at once", async () => {
    const { g, room } = await table([R, G]);
    await one(G, "select leave_room($1)", [room.id]);
    const s = await game(g.id);
    expect(s).toMatchObject({ status: "finished" });
    expect(s.state.placements).toEqual(["red", "yellow"]); // 2 players sit red/yellow
  });

  it("if the host leaves mid-game the table closes when the game ends", async () => {
    const { g, room } = await table([R, G, Y]);
    await one(R, "select leave_room($1)", [room.id]);
    expect((await game(g.id)).state.forfeited).toEqual(["red"]);
    await one(G, "select leave_room($1)", [room.id]); // now only yellow is left → game over
    expect((await game(g.id)).state.placements).toEqual(["yellow", "green", "red"]);
    expect((await t.db.query<Row>("select status from rooms where id = $1", [room.id])).rows[0].status).toBe("abandoned");
  });

  it("finished games can't time out", async () => {
    const { g, room } = await table([R, G]);
    await one(G, "select leave_room($1)", [room.id]);
    expect(await errorOf(timeout(R, await game(g.id)))).toBe("GAME_NOT_PLAYING");
  });
});
