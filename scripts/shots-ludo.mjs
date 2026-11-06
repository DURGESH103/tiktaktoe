// Screenshots of a Ludo game in progress (for design reviews), at phone sizes, light and dark.
//   node --experimental-strip-types --no-warnings scripts/shots-ludo.mjs <out-dir> [label]
// Sets up a real 4-player table through the UI, then puts the game into a fixed position with the
// service key (test-only, from .env.test.local) so before/after shots are comparable.
// The test rooms are deleted at the end, pass or fail.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { loadTestEnv } from "./lib/test-env.mjs";

const OUT = process.argv[2];
const LABEL = process.argv[3] ?? "shot";
if (!OUT) throw new Error("usage: shots-ludo.mjs <out-dir> [label]");
fs.mkdirSync(OUT, { recursive: true });
const env = loadTestEnv({ requireServiceKey: true });
const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const BASE = process.env.BASE ?? "http://localhost:3000";
const codes = new Set();

const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge", headless: true });
async function newPlayer(name) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (e) => console.log(`  [${name} page error] ${e.message}`));
  await page.goto(BASE);
  await page.locator("#display-name").fill(name);
  await page.getByRole("button", { name: "Let's play" }).click();
  await page.getByRole("button", { name: "Create game" }).waitFor();
  return page;
}
const theme = (p, dark) =>
  p.evaluate((d) => {
    document.documentElement.classList.toggle("dark", d);
    localStorage.setItem("theme", d ? "dark" : "light");
  }, dark);

// A position with a bit of everything: yards, a stack of 3, a token home, home-column tokens.
const POSITION = {
  colors: ["red", "green", "yellow", "blue"],
  tokens: { red: [-1, -1, 5, 20], green: [-1, 8, 8, 8], yellow: [56, 53, -1, 30], blue: [-1, -1, -1, 12] },
  turn: "red",
  phase: "roll",
  dice: null,
  sixes: 0,
  placements: [],
  forfeited: [],
  finished: false,
};

try {
  const [A, B, C, D] = [await newPlayer("Rahul"), await newPlayer("Durgesh"), await newPlayer("Priya"), await newPlayer("Kabir")];
  await A.getByRole("radio", { name: /Ludo/ }).click();
  await A.getByRole("button", { name: "Create Ludo table" }).click();
  await A.waitForURL(/\/ludo\/[A-Z0-9]{5}$/);
  const code = A.url().split("/").pop();
  codes.add(code);
  await A.getByRole("radio", { name: "4" }).click();
  for (const p of [B, C, D]) {
    await p.goto(`${BASE}/ludo/${code}`);
    await p.getByRole("button", { name: "I'm ready" }).click();
  }
  await A.getByText("Everyone's ready!").waitFor();
  await A.getByRole("button", { name: "Start game" }).click();
  const { data: room } = await admin.from("rooms").select("id").eq("code", code).single();
  const row = async () => (await admin.from("ludo_games").select("*").eq("room_id", room.id).order("started_at", { ascending: false }).limit(1).single()).data;

  const set = async (patch) => {
    const g = await row();
    const r = await admin.from("ludo_games").update({ seq: g.seq + 1, ...patch }).eq("id", g.id);
    if (r.error) throw new Error(r.error.message);
    await A.waitForTimeout(2000);
  };
  // Roll phase (red to roll), then move phase (red rolled a 6: several tokens can move).
  await set({ state: POSITION, last_roll: 4, last_events: [{ type: "roll", color: "blue", dice: 4 }, { type: "no_moves", color: "blue" }] });
  for (const dark of [false, true]) {
    await theme(A, dark);
    await A.waitForTimeout(400);
    await A.screenshot({ path: `${OUT}/${LABEL}-roll-${dark ? "dark" : "light"}.png` });
  }
  await set({ state: { ...POSITION, phase: "move", dice: 6, sixes: 1 }, last_roll: 6, last_events: [{ type: "roll", color: "red", dice: 6 }] });
  for (const dark of [false, true]) {
    await theme(A, dark);
    await A.waitForTimeout(400);
    await A.screenshot({ path: `${OUT}/${LABEL}-move-${dark ? "dark" : "light"}.png` });
  }
  // Smallest supported phone: does it all fit without scrolling?
  await theme(A, false);
  await A.setViewportSize({ width: 375, height: 667 });
  await A.waitForTimeout(600);
  await A.screenshot({ path: `${OUT}/${LABEL}-375x667.png` });
  const scroll = await A.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  console.log(`375×667: page is ${scroll > 0 ? `${scroll}px taller than the screen` : "fully on screen"}`);
  console.log(`saved to ${OUT}`);
} catch (e) {
  console.log("FAILED:", e.message.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await browser.close();
  if (codes.size) {
    const { data: rooms } = await admin.from("rooms").select("id").in("code", [...codes]);
    const ids = (rooms ?? []).map((r) => r.id);
    if (ids.length) {
      await admin.from("ludo_test_dice").delete().in("room_id", ids);
      await admin.from("rooms").delete().in("id", ids);
      console.log(`(cleaned up ${ids.length} test room)`);
    }
  }
}
