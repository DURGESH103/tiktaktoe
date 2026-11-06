// Checks Memories + private photo storage on your real Supabase project, without a phone:
//   npm run check:memories
// Creates three anonymous test players ("Memories check A/B/Outsider"), a Couple room, one
// memory and one small photo, then deletes the memory and photo again.
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
const FILE = "supabase/migrations/20261104001300_couple_memories.sql";
const BUCKET = "couple-memories";

let failed = false;
const step = (ok, label, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
};
const missing = (e) => ["PGRST202", "PGRST205", "42883", "42P01"].includes(e?.code) || /bucket not found/i.test(e?.message ?? "");
const stop = (e, label) => {
  step(false, label, missing(e) ? `missing in the database → run ${FILE} (after 0012) in the Supabase SQL Editor` : `${e?.code ?? ""} ${e?.message ?? e}`.trim());
  console.log("\nMemories check FAILED");
  process.exit(1);
};

const [A, B, Z] = [client(), client(), client()];
const ids = [];
for (const [c, name] of [[A, "Memories check A"], [B, "Memories check B"], [Z, "Memories check Outsider"]]) {
  const { data, error } = await c.auth.signInAnonymously();
  if (error) stop(error, "anonymous sign-in");
  await c.from("players").upsert({ id: data.user.id, name });
  ids.push(data.user.id);
}
const [a, b] = ids;
const folder = a < b ? `${a}_${b}` : `${b}_${a}`;

const room = await A.rpc("create_room_for", { p_game_type: "couple" });
if (room.error) stop(room.error, "create_room_for('couple')");
const join = await B.rpc("join_room", { p_code: room.data.code });
if (join.error) stop(join.error, "join_room");

// A tiny valid JPEG (1×1 px).
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
const path = `${folder}/${crypto.randomUUID()}.jpg`;

const up = await A.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
if (up.error) stop(up.error, "partner A uploads a photo to the pair's private folder");
step(true, "partner A uploads a photo to the pair's private folder");

const saved = await A.rpc("save_memory", { p_room_id: room.data.id, p_title: "Check", p_body: "Saved by the check script", p_photo_path: path, p_question_id: null });
if (saved.error) stop(saved.error, "save_memory");
step(true, "save_memory with the photo");

const bRow = await B.from("couple_memories").select("id, photo_path").eq("id", saved.data.id);
step(bRow.data?.length === 1, "partner B sees the memory (RLS)");
const bUrl = await B.storage.from(BUCKET).createSignedUrl(path, 60);
step(!bUrl.error && !!bUrl.data?.signedUrl, "partner B can open the photo via a signed URL", bUrl.error?.message);

const zRow = await Z.from("couple_memories").select("id").eq("id", saved.data.id);
step((zRow.data ?? []).length === 0, "outsider can't see the memory");
const zUrl = await Z.storage.from(BUCKET).createSignedUrl(path, 60);
step(!!zUrl.error, "outsider can't open the photo", zUrl.error ? "denied" : "GOT A URL");
const zUp = await Z.storage.from(BUCKET).upload(`${folder}/${crypto.randomUUID()}.jpg`, jpeg, { contentType: "image/jpeg" });
step(!!zUp.error, "outsider can't upload into the pair's folder");

const big = await A.storage.from(BUCKET).upload(`${folder}/${crypto.randomUUID()}.jpg`, Buffer.alloc(2 * 1024 * 1024 + 10), { contentType: "image/jpeg" });
step(!!big.error, "photos over 2 MB are refused by the bucket");
const gif = await A.storage.from(BUCKET).upload(`${folder}/${crypto.randomUUID()}.gif`, Buffer.from("GIF89a"), { contentType: "image/gif" });
step(!!gif.error, "non-image / unsupported types are refused");

const bDel = await B.storage.from(BUCKET).remove([path]);
const stillThere = await A.storage.from(BUCKET).createSignedUrl(path, 60);
step(!stillThere.error, "partner B can't delete A's photo", bDel.error?.message ?? "no-op");

const del = await A.rpc("delete_memory", { p_id: saved.data.id });
step(!del.error && del.data === path, "delete_memory returns the photo path to remove", del.error?.message);
const rm = await A.storage.from(BUCKET).remove([path]);
const gone = await A.storage.from(BUCKET).createSignedUrl(path, 60);
step(!rm.error && !!gone.error, "creator removes their photo");

await A.rpc("leave_room", { p_room_id: room.data.id });
console.log(failed ? "\nMemories check FAILED" : "\nMemories + photo storage OK");
process.exit(failed ? 1 : 0);
