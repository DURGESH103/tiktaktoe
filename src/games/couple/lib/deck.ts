import type { Lang } from "../types";

/** Questions-deck levels, in play order. */
export const LEVELS = {
  fun: { emoji: "😄", label: { en: "Fun", hi: "Fun" } },
  deep: { emoji: "💭", label: { en: "Deep", hi: "Gehri baatein" } },
  future: { emoji: "🔮", label: { en: "Future", hi: "Future" } },
} as const;
export type Level = keyof typeof LEVELS;

export const levelLabel = (level: string | null, lang: Lang) =>
  level && level in LEVELS ? `${LEVELS[level as Level].label[lang]} ${LEVELS[level as Level].emoji}` : "";

/**
 * Whose turn it is for a card or challenge: odd rounds player X, even rounds player O.
 * Mirrors _performer() on the server.
 */
export const turnSeat = (idx: number): "X" | "O" => (idx % 2 === 1 ? "X" : "O");

/** Seconds left on a challenge timer (0 when it has run out; the full time before it starts). */
export function timerLeft(startedAt: string | null, durationSecs: number, now = Date.now()): number {
  if (!startedAt) return durationSecs;
  return Math.max(0, Math.ceil(durationSecs - (now - Date.parse(startedAt)) / 1000));
}

export const CHALLENGE_POINTS = 15;
