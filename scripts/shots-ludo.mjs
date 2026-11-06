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

// A 3-player game (red = you, green, yellow; blue's seat empty) with a bit of everything: yellow has
// all four tokens out (one on the top row), red, green and yellow share the safe square 9 (a mixed
// stack), red has two tokens on one square, and red and green have finished tokens in the centre.
const POSITION = {
  colors: ["red", "green", "yellow"],
  tokens: { red: [8, 21, 21, 56], green: [56, 56, 47, -1], yellow: [38, 34, 3, 20] },
  turn: "red",
  phase: "roll",
  dice: null,
  sixes: 0,
  placements: [],
  forfeited: [],
  finished: false,
};

try {
  const [A, B, C] = [await newPlayer("Durgesh"), await newPlayer("kittu"), await newPlayer("Rahul")];
  await A.getByRole("radio", { name: /Ludo/ }).click();
  await A.getByRole("button", { name: "Create Ludo table" }).click();
  await A.waitForURL(/\/ludo\/[A-Z0-9]{5}$/);
  const code = A.url().split("/").pop();
  codes.add(code);
  await A.getByRole("radio", { name: "3" }).click();
  for (const p of [B, C]) {
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
  await set({ state: POSITION, last_roll: 4, last_events: [{ type: "roll", color: "yellow", dice: 4 }, { type: "no_moves", color: "yellow" }] });
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
  // Common phone sizes: does it all fit without scrolling?
  await theme(A, false);
  for (const [w, h] of [[360, 740], [375, 667], [390, 844], [412, 915]]) {
    await A.setViewportSize({ width: w, height: h });
    await A.waitForTimeout(600);
    await A.screenshot({ path: `${OUT}/${LABEL}-${w}x${h}.png` });
    const scroll = await A.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    console.log(`${w}×${h}: ${scroll > 0 ? `page is ${scroll}px taller than the screen` : "fully on screen"}`);
  }

  if (process.env.MOTION) {
    // Smoothness: a real token move (red 8 → 14, six hops) and a real dice roll (scripted 3), first
    // at 4× CPU slowdown while counting animation frames, then again recorded as a GIF.
    await A.setViewportSize({ width: 390, height: 844 });
    const cdp = await A.context().newCDPSession(A);
    const frameGaps = (ms) =>
      A.evaluate(
        (ms) =>
          new Promise((done) => {
            const gaps = [];
            let last = performance.now();
            const end = last + ms;
            const tick = (t) => {
              gaps.push(t - last);
              last = t;
              if (t < end) requestAnimationFrame(tick);
              else done(gaps);
            };
            requestAnimationFrame(tick);
          }),
        ms,
      );
    const report = (what, gaps) => {
      const dropped = gaps.filter((g) => g > 25).length;
      console.log(`${what}: ${gaps.length} frames, ${dropped} dropped (gap > 25 ms), worst gap ${Math.round(Math.max(...gaps))} ms`);
    };
    const moveTurn = () => set({ state: { ...POSITION, phase: "move", dice: 6, sixes: 1 }, last_roll: 6, last_events: [{ type: "roll", color: "red", dice: 6 }] });
    const rollTurn = async () => {
      await set({ state: POSITION, last_roll: 4, last_events: [] });
      await admin.from("ludo_test_dice").insert({ room_id: room.id, value: 3 });
    };
    const doMove = () => A.locator('[data-token="red-0"][data-movable]').dispatchEvent("click");
    const doRoll = () => A.getByRole("button", { name: "Roll the dice" }).click();

    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await moveTurn();
    report("idle (only the turn glow and bouncing tokens), 4× CPU slowdown", await frameGaps(1500));
    let gaps = frameGaps(2200);
    await doMove();
    report("token move, 4× CPU slowdown", await gaps);
    await rollTurn();
    gaps = frameGaps(2200);
    await doRoll();
    report("dice roll, 4× CPU slowdown", await gaps);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    // GIF: screencast frames (with their timestamps) joined into an animation.
    const frames = [];
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ data: Buffer.from(f.data, "base64"), t: f.metadata.timestamp });
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await rollTurn();
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 360, maxHeight: 780 });
    await A.waitForTimeout(300);
    await doRoll();
    await A.waitForTimeout(1800);
    await moveTurn();
    await doMove();
    await A.waitForTimeout(1800);
    await cdp.send("Page.stopScreencast");
    const { default: sharp } = await import("sharp");
    const imgs = await Promise.all(frames.map((f) => sharp(f.data).resize(360, 780, { fit: "contain", background: "#ffffff" }).png().toBuffer()));
    const delay = frames.map((f, i) => Math.max(20, Math.round(((frames[i + 1]?.t ?? f.t + 0.05) - f.t) * 1000)));
    await sharp(imgs, { join: { animated: true } }).gif({ delay, loop: 0 }).toFile(`${OUT}/${LABEL}-motion.gif`);
    console.log(`GIF: ${frames.length} frames → ${OUT}/${LABEL}-motion.gif`);
  }
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
