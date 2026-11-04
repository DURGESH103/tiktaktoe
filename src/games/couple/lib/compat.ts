import type { CompatTitle, CoupleQuestion, Lang } from "../types";

/** Display copy for the server's title keys (thresholds live in _compat_title on the server). */
export const TITLES: Record<CompatTitle, { label: string; blurb: Record<Lang, string> }> = {
  soulmates: { label: "Soulmates 💖", blurb: { en: "You two are totally in sync.", hi: "Tum dono ekdum same wavelength pe ho." } },
  perfect_chaos: { label: "Perfect Chaos 😂", blurb: { en: "Different in all the fun ways.", hi: "Alag ho, par mazedaar tareeke se." } },
  still_learning: { label: "Still Learning 🌱", blurb: { en: "So much more to discover together!", hi: "Abhi bahut kuch jaanna baaki hai!" } },
};

export const CATEGORIES: { id: string; emoji: string; label: Record<Lang, string> }[] = [
  { id: "love", emoji: "💖", label: { en: "Love", hi: "Pyaar" } },
  { id: "lifestyle", emoji: "🏡", label: { en: "Lifestyle", hi: "Lifestyle" } },
  { id: "food", emoji: "🍕", label: { en: "Food", hi: "Khana" } },
  { id: "travel", emoji: "✈️", label: { en: "Travel", hi: "Safar" } },
  { id: "habits", emoji: "⏰", label: { en: "Habits", hi: "Aadatein" } },
  { id: "future", emoji: "🔮", label: { en: "Future plans", hi: "Future plans" } },
  { id: "funny", emoji: "😂", label: { en: "Funny", hi: "Funny" } },
];

export const categoryLabel = (id: string | null, lang: Lang) => CATEGORIES.find((c) => c.id === id)?.label[lang] ?? id ?? "";

export const questionText = (q: Pick<CoupleQuestion, "text_en" | "text_hi">, lang: Lang) => (lang === "hi" ? q.text_hi : q.text_en);
export const optionText = (q: Pick<CoupleQuestion, "options">, i: number | null | undefined, lang: Lang) =>
  i == null ? "—" : (q.options?.[i]?.[lang] ?? "—");

/**
 * "Who knows the other better": X's correct guesses measure how well X knows O, and vice versa.
 * Returns which seat knows the other better, or "tie".
 */
export function knowsBetter(result: { x_correct: number; o_correct: number }): "X" | "O" | "tie" {
  if (result.x_correct === result.o_correct) return "tie";
  return result.x_correct > result.o_correct ? "X" : "O";
}
