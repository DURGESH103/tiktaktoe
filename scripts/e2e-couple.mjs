// Couple Challenge end-to-end test in two headless browser windows at phone size.
//   npm run e2e:couple        (app running on http://localhost:3000; BASE=... to point elsewhere)
// Grows with each stage. Stage 1: hub → create → invite → join by code → lobby, presence,
// reactions, chat, redirects, and challenging a friend to Couple Challenge.
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

try {
  console.log("Stage 1: hub, rooms with game_type, lobby");
  const A = await newPlayer("Rahul");
  const B = await newPlayer("Durgesh");

  await A.getByRole("radio", { name: /Couple Challenge/ }).click();
  await A.getByRole("button", { name: "Create Couple Challenge" }).click();
  await A.waitForURL(/\/couple\/[A-Z0-9]{5}$/);
  const code = A.url().split("/").pop();
  await A.getByText("Waiting for your friend").waitFor();
  ok(true, `hub → Couple Challenge → room ${code} at /couple/${code}`);

  await B.locator("#join-code").fill(code);
  await B.getByRole("button", { name: "Join", exact: true }).click();
  await B.waitForURL(new RegExp(`/couple/${code}$`));
  ok(true, "universal join box detected a Couple code and opened /couple/CODE");

  await A.getByRole("heading", { name: "Pick a mode" }).waitFor();
  await B.getByRole("heading", { name: "Pick a mode" }).waitFor();
  ok((await A.getByRole("button", { name: /Compatibility Test/ }).count()) === 1, "both see the lobby with the 4 modes");
  await A.getByRole("button", { name: /^Durgesh, online/ }).waitFor();
  ok(true, "presence: Rahul sees Durgesh online");

  await A.getByRole("button", { name: "Send fire reaction" }).click();
  await B.locator("div.pointer-events-none > span", { hasText: "🔥" }).first().waitFor({ timeout: 8000 });
  ok(true, "reactions work in Couple rooms");

  await A.getByRole("button", { name: /^Open chat/ }).click();
  await A.getByLabel("Message", { exact: true }).fill("hi jaan 💖");
  await A.getByLabel("Message", { exact: true }).press("Enter");
  await B.getByRole("button", { name: "Open chat, 1 unread message" }).waitFor({ timeout: 10_000 });
  await B.getByRole("button", { name: /^Open chat/ }).click();
  await B.getByRole("log", { name: "Messages" }).getByText("hi jaan 💖").waitFor();
  ok(true, "chat works in Couple rooms (shared component, unread badge)");
  await A.getByRole("button", { name: "Close chat" }).click();
  await B.getByRole("button", { name: "Close chat" }).click();

  await B.goto(`${BASE}/game/${code}`);
  await B.waitForURL(new RegExp(`/couple/${code}$`));
  ok(true, "/game/CODE for a Couple code redirects to /couple/CODE");
  await B.getByRole("heading", { name: "Pick a mode" }).waitFor();
  ok(true, "refresh/redirect restores the lobby");

  const html = await (await fetch(`${BASE}/couple/${code}`)).text();
  ok(/Rahul invited you to Couple Challenge/.test(html), "link preview title: 'Rahul invited you to Couple Challenge 💞'");

  console.log("Challenge a friend to Couple Challenge");
  await A.goto(`${BASE}/friends`);
  const friendCode = (await A.locator("text=Your friend code").locator("..").locator("p").nth(1).innerText()).trim();
  await B.goto(`${BASE}/add/${friendCode}`);
  await B.getByRole("button", { name: /Add friend/ }).click();
  await A.goto(`${BASE}/friends?tab=requests`);
  await A.getByRole("button", { name: "Accept" }).click();
  await A.goto(`${BASE}/friends`);
  await B.goto(`${BASE}/friends`);
  await A.getByRole("button", { name: "Challenge Durgesh" }).click();
  await A.getByRole("dialog").getByRole("button", { name: /Couple Challenge/ }).click();
  await B.getByText("Rahul challenged you to Couple Challenge 💞!").waitFor({ timeout: 15_000 });
  ok(true, "friend gets 'Rahul challenged you to Couple Challenge 💞!'");
  await B.getByRole("alertdialog").getByRole("button", { name: "Accept" }).click();
  await B.waitForURL(/\/couple\/[A-Z0-9]{5}$/);
  await A.waitForURL(/\/couple\/[A-Z0-9]{5}$/);
  ok(A.url() === B.url(), "accepting takes both players into the same Couple room");
  await A.getByRole("heading", { name: "Pick a mode" }).waitFor();
} catch (e) {
  failures++;
  console.log("  ✗ FAIL", e.message.split("\n")[0]);
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nCouple Challenge checks passed");
process.exit(failures ? 1 : 0);
