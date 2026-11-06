// Couple Challenge end-to-end test in two headless browser windows at phone size.
//   npm run e2e:couple        (app running on http://localhost:3000; BASE=... to point elsewhere)
// Grows with each stage. Stage 1: hub → create → invite → join by code → lobby, presence,
// reactions, chat, redirects, and challenging a friend to Couple Challenge. Stage 2: Compatibility.
// Stage 3: Questions deck + Challenges. Stage 4: Memories, the timeline and private photos.
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
  ok((await A.getByRole("heading", { name: "Perfect Chaos 😂" }).count()) === 1, "title: Perfect Chaos 😂");
  ok((await A.getByText("Durgesh knows Rahul better 👀").count()) === 1, "who knows who better: Durgesh");
  ok((await B.getByRole("radio", { name: "Hinglish" }).getAttribute("aria-checked")) === "true", "language choice is per player and survives refresh");
  if (process.env.SHOTS) await A.screenshot({ path: `${process.env.SHOTS}/couple-summary.png` });

  await A.getByRole("button", { name: "Back to modes" }).click();
  await A.getByRole("heading", { name: "Pick a mode" }).waitFor();
  ok(true, "back to the lobby");
  await B.getByRole("button", { name: "Back to modes" }).click();

  console.log("Stage 3: Questions deck");
  await B.getByRole("button", { name: /^Questions/ }).click();
  await A.getByText("Card 1 of 12").waitFor();
  await B.getByText("Card 1 of 12").waitFor();
  ok(true, "Questions deck starts on both screens (Fun first)");
  const card = await B.locator("article").boundingBox();
  await B.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await B.mouse.down();
  await B.mouse.move(card.x - 120, card.y + card.height / 2, { steps: 12 });
  await B.mouse.up();
  await A.getByText("Card 2 of 12").waitFor();
  ok(true, "swiping the card left draws the next card on both screens");
  for (let c = 2; c <= 4; c++) {
    await A.getByRole("button", { name: "Next card →" }).click();
    await B.getByText(`Card ${c + 1} of 12`).waitFor();
  }
  ok((await A.getByText("Level up: Deep 💭").count()) === 1, "card 5 opens the Deep level");
  for (let c = 5; c <= 11; c++) {
    await (c % 2 ? A : B).getByRole("button", { name: "Next card →" }).click();
    await A.getByText(`Card ${c + 1} of 12`).waitFor();
  }
  await A.getByRole("button", { name: "Finish 💞" }).click();
  await A.getByRole("heading", { name: "12 cards together" }).waitFor();
  await B.getByRole("heading", { name: "12 cards together" }).waitFor();
  ok(true, "deck summary on both screens (no score)");
  await A.getByRole("button", { name: "Back to modes" }).click();
  await B.getByRole("button", { name: "Back to modes" }).click();

  console.log("Stage 3: Challenges");
  await A.getByRole("button", { name: /^Challenges/ }).click();
  await A.getByText("Challenge 1 of 5").waitFor();
  await B.getByText("Challenge 1 of 5").waitFor();
  ok((await B.getByRole("button", { name: /Start timer/ }).count()) === 0, "only the performer (Rahul, round 1) gets Start timer");
  await B.getByText(/Waiting for Rahul to start/).waitFor();
  const play = async (perf, partner, outcome) => {
    if (outcome === "skip") return perf.getByRole("button", { name: "Skip this one" }).click();
    await perf.getByRole("button", { name: /Start timer/ }).click();
    await partner.getByText(/is on it… cheer them on/).waitFor();
    await perf.getByRole("button", { name: "Done ✅" }).click();
    await partner.getByText(/really do it\?/).waitFor();
    await partner.getByRole("button", { name: outcome === "yes" ? "Yes, done! 👏" : "Not quite 🙈" }).click();
  };
  await play(A, B, "yes");
  await A.getByText("Challenge complete! +15 points 🎉").waitFor();
  await B.getByText("Challenge complete! +15 points 🎉").waitFor();
  ok((await A.getByText("+15 pts").count()) === 1, "timer → Done → partner confirms → +15 points on both screens");
  if (process.env.SHOTS) await B.screenshot({ path: `${process.env.SHOTS}/challenge-done.png` });
  await B.getByRole("button", { name: "Next challenge →" }).click();
  await A.getByText("Challenge 2 of 5").waitFor();
  await play(B, A, "skip");
  await A.getByText("Skipped. No worries!").waitFor();
  ok(true, "turns alternate: round 2 is Durgesh's; Skip works");
  await A.getByRole("button", { name: "Next challenge →" }).click();
  await B.getByText("Challenge 3 of 5").waitFor();
  await play(A, B, "no");
  await A.getByText(/Not quite this time/).waitFor();
  ok(true, "partner can say 'Not quite' (no points)");
  await A.getByRole("button", { name: "Next challenge →" }).click();
  await B.getByText("Challenge 4 of 5").waitFor();
  await play(B, A, "yes");
  await B.getByRole("button", { name: "Next challenge →" }).click();
  await A.getByText("Challenge 5 of 5").waitFor();
  await play(A, B, "yes");
  await A.getByRole("button", { name: "See results 💞" }).click();
  await A.getByRole("heading", { name: "+45 points" }).waitFor();
  await B.getByRole("heading", { name: "+45 points" }).waitFor();
  ok((await A.getByLabel("Challenge streak 2").count()) === 1, "summary: 45 points, 🔥 streak 2 (calculated on the server)");
  if (process.env.SHOTS) await A.screenshot({ path: `${process.env.SHOTS}/challenge-summary.png` });

  console.log("Stage 4: Memories");
  await A.getByRole("button", { name: "Back to modes" }).click();
  await B.getByRole("button", { name: "Back to modes" }).click();
  await A.getByRole("button", { name: /^Memories/ }).click();
  await A.getByText("Memory 1 of 5").waitFor();
  await B.getByText("Memory 1 of 5").waitFor();
  ok(true, "starting Memories takes both players to prompt 1");
  const write = async (p, text) => {
    await p.getByLabel("How do you remember it?").fill(text);
    await p.getByRole("button", { name: "Lock in 💌" }).click();
  };
  await write(A, "The college canteen <b>chai</b>");
  await A.getByText(/Waiting for Durgesh to answer/).waitFor();
  await B.getByText("Rahul has written theirs ✓ — your turn!").waitFor();
  ok(true, "first to answer sees 'Waiting for Durgesh to answer…'; partner sees 'Rahul has written theirs ✓'");
  await write(B, "Canteen, over chai");
  await A.getByText("Did you remember it the same way?").waitFor();
  await B.getByText("Did you remember it the same way?").waitFor();
  ok((await B.getByText("The college canteen <b>chai</b>").count()) === 1, "both answers revealed side by side; markup shown as plain text");
  if (process.env.SHOTS) await B.screenshot({ path: `${process.env.SHOTS}/memories-reveal.png` });
  await A.getByRole("button", { name: "We matched ✅" }).click();
  await B.getByText("Rahul has voted — your call!").waitFor();
  await B.getByRole("button", { name: "We matched ✅" }).click();
  await A.getByText("You both remembered it! +20 💞").waitFor();
  await B.getByText("You both remembered it! +20 💞").waitFor();
  ok((await A.getByLabel("20 points").count()) === 1, "both tap 'We matched' → +20 points on both screens");

  // Save it to the timeline with a photo (the app icon stands in for a camera photo).
  await A.getByRole("button", { name: "Save to Our Memories 📸" }).click();
  await A.getByRole("dialog", { name: "Save to Our Memories 📸" }).waitFor();
  await A.locator('input[type="file"]').setInputFiles("public/icons/icon-512.png");
  await A.getByAltText("Selected photo").waitFor();
  await A.getByRole("button", { name: "Save memory 💞" }).click();
  await A.getByRole("dialog", { name: "Save to Our Memories 📸" }).waitFor({ state: "detached" });
  ok(true, "memory saved with a photo (resized on the phone, private bucket)");

  // Round 2: they disagree. Rounds 3–5: matched.
  await A.getByRole("button", { name: "Next memory →" }).click();
  await B.getByText("Memory 2 of 5").waitFor();
  await write(A, "Goa");
  await write(B, "Manali");
  await A.getByRole("button", { name: "We matched ✅" }).click();
  await B.getByRole("button", { name: "Different" }).click();
  await A.getByText(/You remember it differently/).waitFor();
  ok((await A.getByLabel("20 points").count()) === 1, "one 'Different' vote → no points");
  for (let i = 2; i < 5; i++) {
    await B.getByRole("button", { name: "Next memory →" }).click();
    await A.getByText(`Memory ${i + 1} of 5`).waitFor();
    await write(A, `Memory ${i + 1}`);
    await write(B, `Memory ${i + 1}`);
    await A.getByRole("button", { name: "We matched ✅" }).click();
    await B.getByRole("button", { name: "We matched ✅" }).click();
    await A.getByText("You both remembered it! +20 💞").waitFor();
  }
  await A.getByRole("button", { name: "See our memories score 💞" }).click();
  await A.getByRole("heading", { name: "+80 points" }).waitFor();
  await B.getByRole("heading", { name: "+80 points" }).waitFor();
  ok((await B.getByText("You remembered 4 of 5 the same way 💞").count()) === 1, "summary: 4 of 5 matched, +80 points (server)");

  // Timeline: B sees A's memory with the photo; only A can delete it; deletion shows up live on B.
  await B.getByRole("button", { name: "Open Our Memories 📸" }).click();
  const photo = B.getByRole("img", { name: /^Photo:/ });
  await photo.waitFor();
  await B.waitForFunction(() => [...document.querySelectorAll("img")].some((i) => i.alt.startsWith("Photo:") && i.complete && i.naturalWidth > 0));
  ok(true, "partner sees the memory and its private photo (signed URL)");
  ok((await B.getByRole("button", { name: /^Delete|Tap again to delete/ }).count()) === 0, "partner can't delete someone else's memory");
  if (process.env.SHOTS) await B.screenshot({ path: `${process.env.SHOTS}/memories-timeline.png` });
  await A.getByRole("button", { name: "Open Our Memories 📸" }).click();
  await A.getByRole("button", { name: "Delete" }).first().click();
  await A.getByRole("button", { name: "Tap again to delete" }).click();
  await B.getByText("No memories yet").waitFor({ timeout: 15_000 });
  ok(true, "creator deletes the memory (and photo); it disappears live on the partner's phone");
} catch (e) {
  failures++;
  console.log("  ✗ FAIL", e.message.split("\n")[0]);
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nCouple Challenge checks passed");
process.exit(failures ? 1 : 0);
