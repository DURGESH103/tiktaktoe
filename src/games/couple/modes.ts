import type { CoupleMode } from "./types";

/** The four Couple Challenge modes, in lobby order. `ready` flips on as each stage ships. */

export const COUPLE_MODES: { id: CoupleMode; emoji: string; title: string; blurb: string; ready: boolean }[] = [
  { id: "compatibility", emoji: "💘", title: "Compatibility Test", blurb: "Answer for yourself, guess for your partner. How in sync are you?", ready: true },
  { id: "memories", emoji: "📸", title: "Memories", blurb: "Remember it the same way? Build your shared timeline.", ready: false },
  { id: "questions", emoji: "💬", title: "Questions", blurb: "Swipe through Fun → Deep → Future conversation cards.", ready: false },
  { id: "challenges", emoji: "🎯", title: "Challenges", blurb: "Quick fun tasks with a timer. Keep your streak going!", ready: false },
];
