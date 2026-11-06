// Test harness: runs the real migrations on an in-memory Postgres (PGlite)
// with just enough Supabase emulation (roles, auth.uid(), realtime publication).
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../migrations");

const SUPABASE_EMULATION = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export const uid = (n: number) => `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_EMULATION);
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  }

  /** Runs SQL the way PostgREST does: as `authenticated` with a JWT sub, or as `anon` when user is null. */
  async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    await db.exec(
      user
        ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`
        : `set role anon; select set_config('request.jwt.claim.sub', '', false);`,
    );
    try {
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec("reset role;");
    }
  }

  async function addPlayer(id: string, name: string) {
    await db.query("insert into auth.users values ($1)", [id]);
    await as(id, "insert into players (id, name, avatar, color) values ($1, $2, '😎', 'violet')", [id, name]);
  }

  let codeSeq = 0;
  /** Creates a room directly (as superuser), returning its id. */
  async function addRoom(x: string, o: string | null, status = "playing") {
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let n = codeSeq++;
    let code = "";
    for (let i = 0; i < 5; i++, n = Math.floor(n / 32)) code = ALPHABET[n % 32] + code;
    const { rows } = await db.query<{ id: string }>(
      "insert into rooms (code, player_x, player_o, status) values ($1, $2, $3, $4) returning id",
      [code, x, o, status],
    );
    return rows[0].id;
  }

  /** Inserts a round with a given outcome. `winner` null + status playing/abandoned for unfinished rounds. */
  async function addRound(
    roomId: string,
    round: number,
    winner: "X" | "O" | "draw" | null,
    endedAt: string,
    status: "finished" | "playing" | "abandoned" = "finished",
    moves = 5,
  ) {
    const mv = JSON.stringify(Array.from({ length: moves }, (_, i) => ({ cell: i, mark: i % 2 ? "O" : "X", at: endedAt })));
    await db.query(
      `insert into games (room_id, round, starting_turn, current_turn, status, winner, moves, started_at, ended_at)
       values ($1, $2, 'X', $3, $4, $5, $6::jsonb, $7, $8)`,
      [roomId, round, status === "playing" ? "X" : null, status, winner, mv, endedAt, status === "playing" ? null : endedAt],
    );
  }

  return { db, as, addPlayer, addRoom, addRound };
}

/** Awaits a query that should fail and returns its error message. */
export async function errorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected the query to fail");
}
