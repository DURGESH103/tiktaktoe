/** Vibration patterns (ms). navigator.vibrate is a no-op where unsupported (e.g. iOS Safari). */
export const HAPTICS = {
  tap: 12,
  opponent: [8, 40, 8],
  win: [30, 50, 30, 50, 80],
  lose: 120,
  draw: [40, 60, 40],
  join: [20, 60, 20],
  message: 15,
  error: [25, 30, 25],
  // Ludo
  dice: [10, 40, 10, 40, 18],
  capture: [50, 40, 80],
  home: [20, 50, 20, 50, 40],
  turn: 20,
  hop: 6,
} satisfies Record<string, number | number[]>;

export type HapticName = keyof typeof HAPTICS;

export function vibrate(name: HapticName) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(HAPTICS[name]);
  } catch {
    // Some browsers throw if called before any user interaction; ignore.
  }
}
