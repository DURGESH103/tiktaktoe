// Tic-Tac-Toe regression test in two real (headless) browser windows at phone size.
//   npm run e2e:tictactoe                  (app running on http://localhost:3000)
//   BASE=https://your-app.vercel.app npm run e2e:tictactoe
// Uses the Microsoft Edge installed on this PC (set BROWSER=chrome to use Chrome instead).
// Creates a few test players and rooms in the Supabase project the app points at.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
let failures = 0;
const ok = (cond, msg) => {
  if (!cond) failures++;
  console.log(cond ? "  ✓" : "  ✗ FAIL", msg);
};

const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge", headless: true });
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function newPlayer(name) {
  const page = await (await browser.newContext(phone)).newPage();
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (e) => console.log(`  [${name} page error] ${e.message}`));
  await page.goto(BASE);
  await page.locator("#display-name").fill(name);
  await page.getByRole("button", { name: "Let's play" }).click();
  await page.getByRole("button", { name: "Create game" }).waitFor();
  return page;
}
const cell = (p, i) => p.getByRole("gridcell", { name: new RegExp(`^Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1},`) });
async function move(mover, watcher, i, mark) {
  await cell(mover, i).click();
  await watcher.getByRole("gridcell", { name: `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}, ${mark}` }).waitFor();
}

try {
  console.log("Tic-Tac-Toe: create → join by link → play → win → rematch");
  const A = await newPlayer("Rahul");
  ok((await A.getByRole("radio", { name: /Tic-Tac-Toe/ }).getAttribute("aria-checked")) === "true", "hub: Tic-Tac-Toe is selected by default");
  await A.getByRole("button", { name: "Create game" }).click();
  await A.waitForURL(/\/game\/[A-Z0-9]{5}$/);
  const code = A.url().split("/").pop();
  await A.getByText("Waiting for your friend").waitFor();
  ok(true, `room ${code} created at /game/${code}`);

  const B = await newPlayer("Durgesh");
  await B.goto(`${BASE}/game/${code}`);
  await A.getByText("Your turn").waitFor();
  await B.getByText("Rahul's turn").waitFor();
  ok(true, "second player joined via the link; turns shown on both");

  for (const [p, w, i, m] of [[A, B, 0, "X"], [B, A, 3, "O"], [A, B, 1, "X"], [B, A, 4, "O"], [A, B, 2, "X"]]) await move(p, w, i, m);
  await A.getByRole("dialog").getByText("You win!").waitFor();
  await B.getByRole("dialog").getByText("Rahul wins").waitFor();
  ok(true, "moves synced; win detected on both screens");

  await B.getByRole("dialog").getByRole("button", { name: "Rematch" }).click();
  await B.getByText("Your turn").waitFor();
  await A.getByText("Durgesh's turn").waitFor();
  ok(true, "rematch started round 2 with the other player first");
  ok((await A.getByRole("status", { name: "Series: Rahul 1, Durgesh 0, draws 0" }).count()) === 1, "series score 1–0");

  await B.reload();
  await B.getByText("Your turn").waitFor();
  ok(true, "refresh restores the game");

  console.log("Universal join box");
  const C = await newPlayer("Carol");
  await A.goto(BASE);
  await A.getByRole("button", { name: "Create game" }).click();
  await A.waitForURL(/\/game\/[A-Z0-9]{5}$/);
  const code2 = A.url().split("/").pop();
  await C.locator("#join-code").fill(code2);
  await C.getByRole("button", { name: "Join", exact: true }).click();
  await C.waitForURL(new RegExp(`/game/${code2}$`));
  await C.getByText("Rahul's turn").waitFor();
  ok(true, "typing a Tic-Tac-Toe code opens /game/CODE and joins");
  await C.goto(BASE);
  await C.locator("#join-code").fill("ZZZZZ");
  await C.getByRole("button", { name: "Join", exact: true }).click();
  await C.getByText(/Double-check the code/).waitFor();
  ok(true, "unknown code shows 'Room not found' without leaving the home screen");
} catch (e) {
  failures++;
  console.log("  ✗ FAIL", e.message.split("\n")[0]);
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nTic-Tac-Toe regression passed");
process.exit(failures ? 1 : 0);
