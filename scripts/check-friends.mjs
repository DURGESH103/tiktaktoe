// Checks the friends + challenges backend end to end, without a phone:
//   npm run check:friends
// Signs in two anonymous test players, makes them friends, sends a challenge, accepts it,
// and confirms live delivery. Creates two "Friends check" test players in your project.
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
const FILES = "supabase/migrations/20261104000700_friends.sql and 20261104000800_challenges.sql";

let failed = false;
const step = (ok, label, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
};
const explain = (e) =>
  ["PGRST202", "PGRST205", "42883", "42P01"].includes(e?.code) ? `missing in the database → run ${FILES} in the Supabase SQL Editor` : `${e?.code ?? ""} ${e?.message ?? e}`.trim();
const must = (res, label, show = () => "") => {
  step(!res.error, label, res.error ? explain(res.error) : show(res.data));
  if (res.error) {
    console.log("\nFriends check FAILED");
    process.exit(1);
  }
  return res.data;
};

const A = client();
const B = client();
const a = (await A.auth.signInAnonymously()).data.user;
const b = (await B.auth.signInAnonymously()).data.user;
await A.from("players").upsert({ id: a.id, name: "Friends check A" });
await B.from("players").upsert({ id: b.id, name: "Friends check B" });
const handleB = (await B.from("players").select("handle").eq("id", b.id).single()).data?.handle;
const handleA = (await A.from("players").select("handle").eq("id", a.id).single()).data?.handle;
step(!!handleA && !!handleB, "test players have friend codes", `${handleA}, ${handleB}`);

// B listens for live changes before A acts.
let friendEvent = false;
let challengeEvent = false;
const ch = B.channel(`check-friends:${b.id}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `user_a=eq.${b.id}` }, () => (friendEvent = true))
  .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `user_b=eq.${b.id}` }, () => (friendEvent = true))
  .on("postgres_changes", { event: "*", schema: "public", table: "challenges", filter: `to_user=eq.${b.id}` }, () => (challengeEvent = true));
await new Promise((resolve) => ch.on("system", {}, (m) => m.extension === "postgres_changes" && resolve()).subscribe((s) => s === "CHANNEL_ERROR" && resolve()));
const waitFor = async (fn) => {
  for (let i = 0; i < 50 && !fn(); i++) await new Promise((r) => setTimeout(r, 100));
  return fn();
};

must(await A.rpc("send_friend_request", { p_handle: handleB }), "send_friend_request", (r) => r);
step(await waitFor(() => friendEvent), "request delivered live (Realtime)");
const incoming = must(await B.rpc("get_friends"), "get_friends", (d) => `${d.incoming.length} incoming`);
step(incoming.incoming.some((x) => x.player.handle === handleA), "B sees the incoming request");
must(await B.rpc("respond_friend_request", { p_handle: handleA, p_accept: true }), "respond_friend_request (accept)", (r) => r);
must(await B.rpc("touch_last_seen"), "touch_last_seen");
const fr = must(await A.rpc("get_friends"), "A's friend list", (d) => `${d.friends.length} friend`);
step(fr.friends[0]?.last_seen_at != null, "friend's last seen is visible to a friend");

const c = must(await A.rpc("send_challenge", { p_handle: handleB }), "send_challenge", (d) => `${d.status}, expires in ${Math.round((Date.parse(d.expires_at) - Date.parse(d.server_now)) / 1000)}s`);
step(await waitFor(() => challengeEvent), "challenge delivered live (Realtime)");
const acc = must(await B.rpc("respond_challenge", { p_id: c.id, p_accept: true }), "respond_challenge (accept)", (d) => `room ${d.room_code}`);
step(/^[A-HJ-NP-Z2-9]{5}$/.test(acc.room_code ?? ""), "accepting created a game room");
const room = await A.rpc("join_room", { p_code: acc.room_code });
step(!room.error && room.data.status === "playing", "both players are in the room, ready to play");

const outsider = client();
await outsider.auth.signInAnonymously();
const peek = await outsider.from("challenges").select("id");
step((peek.data ?? []).length === 0, "outsiders can't see the challenge (RLS)");

await A.rpc("leave_room", { p_room_id: room.data.id });
await A.rpc("remove_friend", { p_handle: handleB });
await B.removeAllChannels();
console.log(failed ? "\nFriends check FAILED" : "\nFriends backend OK");
process.exit(failed ? 1 : 0);
