// Checks room creation/joining for both games against the live database:
//   npm run check:rooms
// The first part calls create_room / join_room with exactly the arguments the app sent before
// game types existed, i.e. what an old, still-open browser tab does after the migration.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const MIGRATION = "supabase/migrations/20261104000900_game_types.sql";

let failed = false;
const step = (ok, label, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
};
const missing = (e) => ["PGRST202", "PGRST205", "42883", "42P01", "42703"].includes(e?.code);

const A = client();
const B = client();
const a = (await A.auth.signInAnonymously()).data.user;
const b = (await B.auth.signInAnonymously()).data.user;
await A.from("players").upsert({ id: a.id, name: "Rooms check A" });
await B.from("players").upsert({ id: b.id, name: "Rooms check B" });

console.log("Old app version (Tic-Tac-Toe, unchanged calls):");
const room = await A.rpc("create_room");
step(!room.error, "create_room()", room.error?.message ?? `room ${room.data?.code}, game_type=${room.data?.game_type ?? "(column not there yet)"}`);
const join = await B.rpc("join_room", { p_code: room.data?.code });
step(!join.error && join.data?.status === "playing", "join_room({ p_code })", join.error?.message ?? "joined");
const games = await A.from("games").select("round, current_turn").eq("room_id", room.data?.id);
step(games.data?.length === 1 && games.data[0].current_turn === "X", "round 1 created, X to move");
const mv = await A.rpc("make_move", { p_game_id: (await A.from("games").select("id").eq("room_id", room.data.id).single()).data.id, p_cell: 4 });
step(!mv.error, "make_move works");
await A.rpc("leave_room", { p_room_id: room.data.id });

console.log("New: Couple Challenge rooms:");
const c = await A.rpc("create_room_for", { p_game_type: "couple" });
if (missing(c.error)) {
  step(false, "create_room_for('couple')", `missing in the database → run ${MIGRATION} in the Supabase SQL Editor`);
} else {
  step(!c.error && c.data?.game_type === "couple", "create_room_for('couple')", c.error?.message ?? `room ${c.data?.code}`);
  const inv = await client().rpc("get_room_invite", { p_code: c.data.code });
  step(inv.data?.game_type === "couple", "get_room_invite reports game_type (join box / previews)");
  const cj = await B.rpc("join_room", { p_code: c.data.code });
  step(!cj.error && cj.data?.status === "playing", "join_room on a couple room");
  const cg = await A.from("games").select("id").eq("room_id", c.data.id);
  step((cg.data ?? []).length === 0, "no Tic-Tac-Toe round created for a couple room");
  await A.rpc("leave_room", { p_room_id: c.data.id });
}

console.log(failed ? "\nRooms check FAILED" : "\nRooms OK for both games");
process.exit(failed ? 1 : 0);
