// Ludo end-to-end test in headless browser windows at phone size, against the running app.
//   npm run e2e:ludo        (app on http://localhost:3000; BASE=... to point elsewhere)
// Grows with each stage. Stage 1: hub card → create a table → invite a friend (pop-up → seat),
// join by code and by link, seats and colours, table size and mode, Ready/Start, a full table,
// leaving, reactions and the link preview.
import { chromium } from "playwright-core";

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
console.log(failures ? `\n${failures} FAILURE(S)` : "\nLudo checks passed");
process.exit(failures ? 1 : 0);
