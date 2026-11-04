export const AVATARS = ["😎", "🦊", "🐼", "🐯", "🦄", "🐸", "🐙", "🦁", "🐵", "🤖", "👾", "🔥", "⚡", "🌈", "🍕", "🎧"];

/** Accent colours for the avatar badge. Class strings are spelled out so Tailwind keeps them. */
export const COLORS = {
  violet: "from-violet-500 to-fuchsia-500",
  sky: "from-sky-400 to-blue-600",
  emerald: "from-emerald-400 to-teal-600",
  amber: "from-amber-400 to-orange-600",
  rose: "from-rose-400 to-pink-600",
  slate: "from-slate-400 to-slate-700",
} as const;

export type ColorKey = keyof typeof COLORS;
export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];
export const gradientFor = (c: string) => COLORS[(c as ColorKey)] ?? COLORS.violet;
