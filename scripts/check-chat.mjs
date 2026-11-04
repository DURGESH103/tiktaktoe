// Checks the chat backend end to end, without a phone:
//   node scripts/check-chat.mjs        (or: npm run check:chat)
// Signs in two anonymous test players, creates a room, sends a message through
// send_message, reads it back as the other player, and confirms live delivery.
// It creates two "Chat check" test players and one room in your project.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const MIGRATION = "supabase/migrations/20261104000600_room_messages.sql";
let failed = false;
const step = (ok, label, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
};
const explain = (error) =>
  ["PGRST202", "PGRST205", "42883", "42P01"].includes(error?.code)
    ? `missing in the database → run ${MIGRATION} in the Supabase SQL Editor`
    : `${error?.code ?? ""} ${error?.message ?? error}`.trim();
const uuid = () => crypto.randomUUID();

const A = client();
const B = client();
const a = await A.auth.signInAnonymously();
const b = await B.auth.signInAnonymously();
step(!a.error && !b.error, "anonymous sign-in", a.error?.message ?? b.error?.message);
if (a.error || b.error) process.exit(1);

await A.from("players").upsert({ id: a.data.user.id, name: "Chat check A" });
await B.from("players").upsert({ id: b.data.user.id, name: "Chat check B" });
const room = await A.rpc("create_room");
step(!room.error, "create_room", room.error && explain(room.error));
const join = await B.rpc("join_room", { p_code: room.data?.code });
step(!join.error, "join_room", join.error && explain(join.error));
if (failed) process.exit(1);

// Listen as B before A sends, to check the realtime publication.
let live = null;
const ch = B.channel(`check:${room.data.id}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${room.data.id}` }, (p) => {
    live = p.new;
  });
await new Promise((resolve) =>
  ch.on("system", {}, (m) => m.extension === "postgres_changes" && resolve()).subscribe((s) => s === "CHANNEL_ERROR" && resolve()),
);

const sent = await A.rpc("send_message", { p_room_id: room.data.id, p_body: "  hello from the check script  ", p_client_id: uuid() });
step(!sent.error && sent.data?.body === "hello from the check script", "send_message (first message is not rate-limited)", sent.error ? explain(sent.error) : `stored "${sent.data?.body}"`);
if (sent.error) process.exit(1);

const read = await B.from("room_messages").select("body").eq("room_id", room.data.id);
step(read.data?.length === 1, "other player can read it (RLS)", read.error ? explain(read.error) : `${read.data?.length} row`);

for (let i = 0; i < 50 && !live; i++) await new Promise((r) => setTimeout(r, 100));
step(!!live, "delivered live over Realtime (publication)", live ? "" : "no event within 5 s: is room_messages in the supabase_realtime publication?");

const outsider = client();
await outsider.auth.signInAnonymously();
const peek = await outsider.from("room_messages").select("id").eq("room_id", room.data.id);
step((peek.data ?? []).length === 0, "outsiders can't read it (RLS)");

await A.rpc("leave_room", { p_room_id: room.data.id });
await B.removeAllChannels();
console.log(failed ? "\nChat check FAILED" : "\nChat backend OK");
process.exit(failed ? 1 : 0);
