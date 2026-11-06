// Ludo end-to-end test in headless browser windows at phone size, against the running app.
//   npm run e2e:ludo        (app on http://localhost:3000; BASE=... to point elsewhere)
// Grows with each stage. Stage 1: hub card → create a table → invite a friend (pop-up → seat),
// join by code and by link, seats and colours, table size and mode, Ready/Start, a full table,
// leaving, reactions and the link preview. Stage 2: a full 2-player game with scripted dice
// (test-only, via the service key in .env.test.local) to a capture and a win; the server state is
// checked against the rules engine after every step. Test rooms and dice rows are deleted at the end.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { initialState, move as engineMove, roll as engineRoll, legalMoves, distinctMoves } from "../src/games/ludo/engine.ts";
import { loadTestEnv } from "./lib/test-env.mjs";

const env = loadTestEnv({ requireServiceKey: true });
// Service-role client: ONLY for scripting test dice, reading game state, and cleaning up.
const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const testRoomCodes = new Set();

const BASE = process.env.BASE ?? "http://localhost:3000";
let failures = 0;
const ok = (cond, msg) => {
  if (!cond) failures++;
  console.log(cond ? "  ✓" : "  ✗ FAIL", msg);
};

const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge", headless: true });
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const pages = {}; // every player's page, for failure screenshots
async function newPlayer(name) {
  const page = await (await browser.newContext(phone)).newPage();
  pages[name] = page;
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (e) => console.log(`  [${name} page error] ${e.message}`));
  if (process.env.DEBUG_RPC) {
    page.on("request", (q) => q.url().includes("/rpc/") && console.log(`  [${name}] → ${q.url().split("/rpc/")[1]} ${Date.now() % 100000}`));
    page.on("requestfinished", (q) => q.url().includes("/rpc/") && console.log(`  [${name}] ← ${q.url().split("/rpc/")[1]} ${Date.now() % 100000}`));
    page.on("requestfailed", (q) => q.url().includes("/rpc/") && console.log(`  [${name}] ✗ ${q.url().split("/rpc/")[1]} ${q.failure()?.errorText}`));
  }
  await page.goto(BASE);
  await page.locator("#display-name").fill(name);
  await page.getByRole("button", { name: "Let's play" }).click();
  await page.getByRole("button", { name: "Create game" }).waitFor();
  return page;
}
const seat = (p, color) => p.getByText(new RegExp(`^${color} seat:`));

try {
  console.log("Stage 1: Ludo lobby");
  const A = await newPlayer("Rahul");
  const B = await newPlayer("Durgesh");
  const C = await newPlayer("Priya");
  const D = await newPlayer("Kabir");

  // Rahul and Durgesh become friends (through the real UI), for the invite.
  await A.goto(`${BASE}/friends`);
  const friendCode = (await A.locator("text=Your friend code").locator("..").locator("p").nth(1).innerText()).trim();
  await B.goto(`${BASE}/add/${friendCode}`);
  await B.getByRole("button", { name: /Add friend/ }).click();
  await A.goto(`${BASE}/friends?tab=requests`);
  await A.getByRole("button", { name: "Accept" }).click();
  await A.getByRole("tab", { name: "Friends (1)" }).waitFor(); // the accept has landed before we navigate away
  await B.goto(BASE);

  await A.goto(BASE);
  await A.getByRole("radio", { name: /Ludo/ }).click();
  await A.getByRole("button", { name: "Create Ludo table" }).click();
  await A.waitForURL(/\/ludo\/[A-Z0-9]{5}$/);
  const code = A.url().split("/").pop();
  testRoomCodes.add(code);
  await seat(A, "Red").waitFor();
  ok((await seat(A, "Red").innerText()).includes("Rahul, host"), `hub → Ludo → table ${code}; host sits in Red`);
  ok((await A.getByRole("button", { name: "Start game" }).isDisabled()) === true, "Start is disabled while alone");

  // Invite Durgesh from the lobby: he gets a pop-up anywhere in the app and lands in a seat.
  await A.getByRole("button", { name: /Invite friends/ }).click();
  await A.getByRole("checkbox", { name: /Durgesh/ }).check();
  await A.getByRole("button", { name: "Send 1 invite" }).click();
  await A.getByText(/Invite sent! They have a minute to accept./).waitFor();
  await A.getByRole("button", { name: "Done" }).click();
  await B.getByText("Rahul challenged you to Ludo 🎲!").waitFor({ timeout: 15_000 });
  ok(true, "friend gets 'Rahul challenged you to Ludo 🎲!'");
  await B.getByRole("alertdialog").getByRole("button", { name: "Accept" }).click();
  await B.waitForURL(new RegExp(`/ludo/${code}$`));
  await seat(A, "Green").waitFor();
  ok((await seat(A, "Green").innerText()).includes("Durgesh"), "accepting the invite seats Durgesh in Green (live on the host's screen)");

  // Priya joins with the universal join box, Kabir with the link.
  await C.getByLabel("Join with a code").fill(code);
  await C.getByRole("button", { name: "Join", exact: true }).click();
  await C.waitForURL(new RegExp(`/ludo/${code}$`));
  await seat(A, "Yellow").waitFor();
  ok(true, "universal join box opened /ludo/CODE and seated Priya in Yellow");

  // Table size: can't go below the number seated; 3 players → Kabir's link says the table is full.
  ok(await A.getByRole("radio", { name: "2" }).isDisabled(), "table size can't drop below the players seated");
  await A.getByRole("radio", { name: "3" }).click();
  await A.getByText("3 of 3 seated").waitFor();
  await D.goto(`${BASE}/ludo/${code}`);
  await D.getByText("Room is full").waitFor();
  ok(true, "a 4th player at a 3-player table sees 'Room is full'");

  // Ready → Start.
  await A.getByText("Waiting for 2 players to be ready").waitFor();
  await B.getByRole("button", { name: "I'm ready" }).click();
  await C.getByRole("button", { name: "I'm ready" }).click();
  await A.getByText("Everyone's ready!").waitFor();
  ok(await A.getByRole("button", { name: "Start game" }).isEnabled(), "Start turns on when every guest is Ready");
  await A.getByRole("radio", { name: "Quick ⚡" }).click();
  await A.getByText("Waiting for 2 players to be ready").waitFor();
  await B.getByRole("button", { name: "I'm ready" }).waitFor();
  ok(true, "switching to Quick mode asks everyone to press Ready again");
  ok((await B.getByText(/Quick mode/).count()) >= 1, "guests see the mode change live");

  // Reactions for the group.
  await B.getByRole("button", { name: "Send fire reaction" }).click();
  await A.locator("div.pointer-events-none > span", { hasText: "🔥" }).first().waitFor({ timeout: 5000 });
  ok(true, "reactions reach everyone at the table");

  // Leaving frees the seat.
  await C.getByRole("button", { name: "Leave table" }).click();
  await C.getByRole("button", { name: "Tap again to leave" }).click();
  await C.waitForURL(`${BASE}/`);
  await A.getByText("2 of 3 seated").waitFor();
  ok(true, "a guest leaving frees their seat (live)");

  // Refresh keeps your seat; a Ludo code under /game/ redirects; link preview.
  await B.goto(`${BASE}/game/${code}`);
  await B.waitForURL(new RegExp(`/ludo/${code}$`));
  await seat(B, "Green").waitFor();
  ok((await seat(B, "Green").innerText()).includes("Durgesh"), "/game/CODE for a Ludo code redirects; refresh keeps the seat");
  const html = await (await fetch(`${BASE}/ludo/${code}`)).text();
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  ok(title === "Rahul invited you to play Ludo 🎲", `link preview title: '${title}'`);

  // Host closes the table.
  await A.getByRole("button", { name: "Close table" }).click();
  await A.getByRole("button", { name: "Tap again to close the table" }).click();
  await B.getByText("This table is closed").waitFor();
  ok(true, "the host closing the table closes it for everyone");

  console.log("Stage 2: a full game (scripted dice) to a capture and a win");
  await A.goto(BASE);
  await A.getByRole("radio", { name: /Ludo/ }).click();
  await A.getByRole("button", { name: "Create Ludo table" }).click();
  await A.waitForURL(/\/ludo\/[A-Z0-9]{5}$/);
  const code2 = A.url().split("/").pop();
  testRoomCodes.add(code2);
  await A.getByRole("radio", { name: "2" }).click();
  await A.getByRole("radio", { name: "Quick ⚡" }).click();
  await B.goto(`${BASE}/ludo/${code2}`);
  await seat(A, "Yellow").waitFor();
  await B.getByRole("button", { name: "I'm ready" }).click();
  await A.getByText("Everyone's ready!").waitFor();

  // Plan the whole game with the rules engine, then script exactly those dice on the server.
  const plan = planGame();
  const { data: roomRow } = await admin.from("rooms").select("id").eq("code", code2).single();
  const ins = await admin.from("ludo_test_dice").insert(plan.steps.map((st) => ({ room_id: roomRow.id, value: st.dice })));
  if (ins.error) throw new Error(`queueing test dice failed: ${ins.error.message}`);
  ok(true, `planned ${plan.steps.length} rolls (capture at roll ${plan.captureAt + 1}); dice queued with the service key`);

  await A.getByRole("button", { name: "Start game" }).click();
  await A.getByText("Your turn — roll the dice!").waitFor();
  await B.getByText("Rahul's turn").waitFor();
  ok((await B.getByRole("button", { name: /Roll the dice|Last roll|Dice/ }).getAttribute("aria-disabled")) === "true", "both see the board; only the player whose turn it is can roll");

  const page = { red: A, yellow: B };
  const gameRow = async () => (await admin.from("ludo_games").select("*").eq("room_id", roomRow.id).order("started_at", { ascending: false }).limit(1).single()).data;
  const waitSeq = async (above) => {
    for (let i = 0; i < 300; i++) {
      const g = await gameRow();
      if (g.seq > above) return g;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`server didn't advance past seq ${above}`);
  };
  let g = await gameRow();
  let mismatch = 0;
  for (const [n, st] of plan.steps.entries()) {
    const p = page[st.color];
    await p.getByRole("button", { name: "Roll the dice" }).click();
    g = await waitSeq(g.seq);
    if (st.token !== null) {
      await p.getByRole("button", { name: new RegExp(`^Move token ${st.token + 1}:`) }).click();
      g = await waitSeq(g.seq);
    }
    if (JSON.stringify(sortKeys(g.state)) !== JSON.stringify(sortKeys(st.after))) {
      if (!mismatch++) console.log(`    step ${n}: server ${JSON.stringify(g.state)}\n             plan   ${JSON.stringify(st.after)}`);
    }
    if (n === plan.captureAt) {
      await B.getByText(/captured your token! 💥/).waitFor();
      await A.getByText(/captured Durgesh's token! 💥/).waitFor();
      ok(true, "capture: Rahul lands on Durgesh's token; both screens show it, the token goes back to the yard");
    }
  }
  ok(mismatch === 0, `server state matched the rules engine after every one of ${plan.steps.length} rolls`);
  await A.getByRole("heading", { name: "You win!" }).waitFor();
  await B.getByRole("heading", { name: "Rahul wins!" }).waitFor();
  ok((await B.getByRole("list", { name: "Final standings" }).innerText()).replace(/\s+/g, " ").includes("Rahul"), "win: results on both screens (Rahul 1st, Durgesh 2nd)");
  const { data: leftDice } = await admin.from("ludo_test_dice").select("id").eq("room_id", roomRow.id);
  ok(leftDice.length === 0, "every scripted roll was used exactly once");
  await A.getByRole("button", { name: "Back to the table" }).click();
  await A.getByText("Waiting for 1 player to be ready").waitFor();
  ok(true, "after the game the table is back in the lobby (guests press Ready again)");

  console.log("Stage 3: 3 players, turn timer, away, I'm back, leaving mid-game");
  await B.getByRole("button", { name: "Back to the table" }).click();
  await A.getByRole("radio", { name: "3" }).click();
  await C.goto(`${BASE}/ludo/${code2}`);
  await seat(A, "Green").waitFor();
  await B.getByRole("button", { name: "I'm ready" }).click();
  await C.getByRole("button", { name: "I'm ready" }).click();
  await A.getByText("Everyone's ready!").waitFor();
  // Rounds 1–4: red's turn runs out (auto 2s), green and yellow roll 2. Round 5: red and green
  // roll 2, then yellow leaves. Finally red's last roll (1).
  await admin.from("ludo_test_dice").insert([...Array(14).fill(2), 1].map((value) => ({ room_id: roomRow.id, value })));
  await A.getByRole("button", { name: "Start game" }).click();
  const page3 = { red: A, green: B, yellow: C }; // (Durgesh left the results screen above)
  let g3 = await gameRow();
  ok(JSON.stringify(g3.state.colors) === '["red","green","yellow"]', "three players: red, green, yellow take turns");
  await B.getByRole("img", { name: /seconds left/ }).waitFor();
  ok(true, "the current player's avatar shows a countdown ring on everyone's screen");

  const rollAs = async (c) => {
    await page3[c].getByRole("button", { name: "Roll the dice" }).click();
    g3 = await waitSeq(g3.seq);
  };
  // Rounds 1–3: red does nothing, so the server plays red's turn when the 20-second clock runs out.
  for (let round = 1; round <= 3; round++) {
    const t0 = Date.now();
    g3 = await waitSeq(g3.seq);
    const waited = (Date.now() - t0) / 1000;
    if (round === 1) {
      ok(waited >= 18 && waited < 40, `red's turn auto-played after the 20-second timer (${waited.toFixed(1)}s)`);
      ok(g3.last_events[0]?.type === "roll" && g3.timeouts.red === 1, "timeout: auto-roll + best move, 1 timeout counted");
    }
    await rollAs("green");
    await rollAs("yellow");
  }
  ok(JSON.stringify(g3.away) === '["red"]', "3 timeouts in a row → Rahul is marked away");
  await B.getByText("Away · auto-play").waitFor();
  // Round 4: away turns play almost at once.
  const t4 = Date.now();
  g3 = await waitSeq(g3.seq);
  const t4s = (Date.now() - t4) / 1000;
  ok(t4s < 8, `an away player's turn auto-plays quickly (${t4s.toFixed(1)}s, not 20s)`);
  await rollAs("green");
  // Rahul taps "I'm back" while it's someone else's turn.
  await A.getByRole("button", { name: "I'm back" }).click();
  for (let i = 0; i < 50 && (await gameRow()).away.length; i++) await new Promise((r) => setTimeout(r, 100));
  g3 = await gameRow();
  ok(g3.away.length === 0, "\"I'm back\" takes control back");
  await rollAs("yellow");
  // Round 5: red and green roll themselves.
  await rollAs("red");
  await rollAs("green");

  // Priya leaves on her own turn: she's skipped and ranked last.
  await C.getByText("Your turn — roll the dice!").waitFor();
  await C.getByRole("button", { name: "Leave game" }).click();
  await C.getByRole("button", { name: "Tap again: leaving counts as last place" }).click();
  await C.waitForURL(`${BASE}/`);
  g3 = await waitSeq(g3.seq);
  ok(g3.state.forfeited?.[0] === "yellow" && g3.state.turn === "red", "leaving mid-game: Priya is skipped (turn passes to red)");
  await A.getByText("Left").waitFor();
  // Fast-forward (test only, with the service key): red one step from finishing.
  await admin.from("ludo_games").update({ state: { ...g3.state, tokens: { ...g3.state.tokens, red: [56, 56, 56, 55] } } }).eq("id", g3.id);
  await A.getByRole("button", { name: "Roll the dice" }).click();
  await A.getByRole("heading", { name: "You win!" }).waitFor();
  const standings = (await B.getByRole("list", { name: "Final standings" }).innerText()).replace(/\s+/g, " ");
  ok(/Rahul.*You.*Priya/.test(standings), `standings: Rahul 1st, Durgesh 2nd, Priya (left) last — "${standings.slice(0, 60)}…"`);
} catch (e) {
  failures++;
  console.log("  ✗ FAIL", e.message.split("\n")[0]);
  const waiting = e.message.split("\n").find((l) => l.includes("waiting for"));
  if (waiting) console.log("    ", waiting.replace(/\x1b\[[0-9;]*m/g, "").trim());
  if (process.env.SHOTS) {
    for (const [name, p] of Object.entries(pages)) await p.screenshot({ path: `${process.env.SHOTS}/FAIL-${name}.png` }).catch(() => {});
    console.log(`     screenshots: ${process.env.SHOTS}/FAIL-<player>.png`);
  }
}

await browser.close();

// Clean up, pass or fail: scripted dice and the test rooms (seats, games, chat cascade with them).
if (testRoomCodes.size) {
  const { data: rooms } = await admin.from("rooms").select("id").in("code", [...testRoomCodes]);
  const ids = (rooms ?? []).map((r) => r.id);
  if (ids.length) {
    await admin.from("ludo_test_dice").delete().in("room_id", ids);
    const del = await admin.from("rooms").delete().in("id", ids);
    console.log(del.error ? `  (cleanup failed: ${del.error.message})` : `  (cleaned up ${ids.length} test rooms and their dice)`);
  }
}

/**
 * Plans a Quick 2-player game (Rahul red vs Durgesh yellow) with the rules engine:
 * red chases yellow's token and captures it, then brings all four tokens home; yellow just
 * shuffles (1s). Returns each roll's dice, the token to tap (null = automatic), and the expected state.
 */
function planGame() {
  let s = initialState(["red", "yellow"], "quick");
  const steps = [];
  let captureAt = -1;
  const loopSq = (c, p) => (p >= 0 && p <= 50 ? ({ red: 0, yellow: 26 }[c] + p) % 52 : null);
  const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
  while (!s.finished && steps.length < 400) {
    const c = s.turn;
    let dice;
    if (c === "yellow") {
      dice = 1;
    } else if (captureAt < 0) {
      const target = loopSq("yellow", s.tokens.yellow[0]);
      const gap = target === null ? 99 : (target - loopSq("red", s.tokens.red[0]) + 52) % 52;
      dice = gap >= 1 && gap <= 6 && !SAFE.includes(target) && !(gap === 6 && s.sixes === 2) ? gap : 5;
    } else {
      const active = s.tokens.red.map((p, i) => [p, i]).filter(([p]) => p >= 0 && p < 56).sort((a, b) => b[0] - a[0]);
      if (!active.length) dice = s.sixes < 2 ? 6 : 1;
      else {
        const rem = 56 - active[0][0];
        dice = rem >= 6 && s.sixes < 2 ? 6 : Math.min(rem, 5);
      }
    }
    const r = engineRoll(s, dice);
    let token = null;
    let next = r.state;
    if (r.state.phase === "move") {
      const choices = distinctMoves(r.state, c, dice);
      const legal = legalMoves(r.state, c, dice);
      // Before the capture: always move token 0. After: the most advanced token, or enter one.
      const best = [...legal].sort((a, b) => r.state.tokens[c][b] - r.state.tokens[c][a])[0];
      token = captureAt < 0 && legal.includes(0) ? 0 : choices.includes(best) ? best : choices[0];
      const m = engineMove(r.state, token);
      if (m.events.some((e) => e.captured?.length)) captureAt = steps.length;
      next = m.state;
    } else if (r.events.some((e) => e.captured?.length)) captureAt = steps.length;
    steps.push({ color: c, dice, token, after: next });
    s = next;
  }
  if (!s.finished || captureAt < 0) throw new Error("planner failed to reach a capture and a win");
  return { steps, captureAt };
}

/** Postgres returns JSON objects with sorted keys; sort ours the same way to compare. */
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nLudo checks passed");
process.exit(failures ? 1 : 0);
