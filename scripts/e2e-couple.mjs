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

  console.log("Stage 2: Compatibility Test");
  // Rahul challenged, so he is player X. Answers are option indexes (0 = first option).
  const pick = async (p, self, guess) => {
    await p.getByRole("radiogroup", { name: "Your answer" }).getByRole("radio").nth(self).click();
    await p.getByRole("radiogroup", { name: /^Your guess for/ }).getByRole("radio").nth(guess).click();
    await p.getByRole("button", { name: /Lock in/ }).click();
  };
  await B.getByRole("radio", { name: "Hinglish" }).click();
  await A.getByRole("button", { name: /Compatibility Test/ }).click();
  await A.getByRole("dialog").getByRole("button", { name: /Food/ }).click();
  await A.getByText("Question 1 of 10").waitFor();
  await B.getByText("Question 1 of 10").waitFor();
  ok(true, "starting a test takes both players to question 1");

  await pick(A, 0, 1);
  await A.getByText(/Waiting for Durgesh to answer/).waitFor();
  ok(true, "first to answer sees 'Waiting for Durgesh to answer…' with their avatar");
  await B.getByText("Rahul has answered ✓ — your turn!").waitFor();
  ok(true, "partner sees 'Rahul has answered ✓' (without seeing the answer)");
  await pick(B, 1, 0);
  await A.getByRole("button", { name: "Next question →" }).waitFor();
  await B.getByRole("button", { name: "Next question →" }).waitFor();
  ok((await A.locator("li", { hasText: ", correct" }).count()) === 2, "reveal: both guesses right, shown on both screens");

  await A.getByRole("button", { name: "Next question →" }).click();
  await A.getByText("Question 2 of 10").waitFor();
  await B.getByText("Question 2 of 10").waitFor();
  ok(true, "Next moves both players on");

  for (let q = 2; q <= 10; q++) {
    await pick(A, 0, 0); // Rahul guesses Durgesh = option 0 (wrong: Durgesh picks 1)
    await pick(B, 1, 0); // Durgesh guesses Rahul = option 0 (right)
    if (q === 3) {
      await B.reload();
      await B.getByText("Question 3 of 10").waitFor();
      ok(true, "refresh mid-test restores the question and progress");
    }
    const next = q < 10 ? "Next question →" : "See our result 💞";
    await A.getByRole("button", { name: next }).waitFor();
    if (q === 4) {
      await B.getByRole("button", { name: /^Open chat/ }).click();
      const sheet = await B.getByRole("dialog", { name: /Chat with/ }).boundingBox();
      const btn = await B.getByRole("button", { name: next }).boundingBox();
      ok(btn && sheet && btn.y + btn.height <= sheet.y + 1, "chat open: the answer area stays visible above the chat sheet");
      await B.getByRole("button", { name: "Close chat" }).click();
    }
    await A.getByRole("button", { name: next }).click();
    if (q < 10) await B.getByText(`Question ${q + 1} of 10`).waitFor();
  }

  // Rahul (X) guessed right 1/10, Durgesh (O) 10/10 → 11/20 = 55% → Perfect Chaos.
  await A.getByLabel("55 percent compatible").waitFor();
  await B.getByLabel("55 percent compatible").waitFor();
  ok(true, "summary on both screens: 55% (calculated on the server)");
  ok((await A.getByText("Perfect Chaos 😂").count()) === 1, "title: Perfect Chaos 😂");
  ok((await A.getByText("Durgesh knows Rahul better 👀").count()) === 1, "who knows who better: Durgesh");
  ok((await B.getByRole("radio", { name: "Hinglish" }).getAttribute("aria-checked")) === "true", "language choice is per player and survives refresh");
  if (process.env.SHOTS) await A.screenshot({ path: `${process.env.SHOTS}/couple-summary.png` });

  await A.getByRole("button", { name: "Back to modes" }).click();
  await A.getByRole("heading", { name: "Pick a mode" }).waitFor();
  ok(true, "back to the lobby");
} catch (e) {
  failures++;
  console.log("  ✗ FAIL", e.message.split("\n")[0]);
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nCouple Challenge checks passed");
process.exit(failures ? 1 : 0);
