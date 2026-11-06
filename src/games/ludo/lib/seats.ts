import type { LudoColor, LudoSeat } from "../types";

/** Seat order around the board (clockwise from top-left). Mirrors room_players.color in SQL. */
export const SEAT_COLORS: LudoColor[] = ["red", "green", "yellow", "blue"];

/** Tailwind classes per color, spelled out so Tailwind keeps them. */
export const COLOR_STYLE: Record<LudoColor, { label: string; fill: string; ring: string; soft: string; text: string }> = {
  red: { label: "Red", fill: "bg-red-500", ring: "ring-red-500/70", soft: "bg-red-500/15", text: "text-red-500" },
  green: { label: "Green", fill: "bg-emerald-500", ring: "ring-emerald-500/70", soft: "bg-emerald-500/15", text: "text-emerald-500" },
  yellow: { label: "Yellow", fill: "bg-amber-400", ring: "ring-amber-400/70", soft: "bg-amber-400/15", text: "text-amber-500" },
  blue: { label: "Blue", fill: "bg-sky-500", ring: "ring-sky-500/70", soft: "bg-sky-500/15", text: "text-sky-500" },
};

/** Seats in use for a table size (mirrors _ludo_allowed_seats): 2 players sit opposite. */
export function allowedSeats(max: number): number[] {
  return max === 2 ? [0, 2] : max === 3 ? [0, 1, 2] : [0, 1, 2, 3];
}

export const activeSeats = (seats: LudoSeat[]) => seats.filter((s) => !s.left_at).sort((a, b) => a.seat - b.seat);

/** Can the host start? At least 2 seated and every guest ready (the host is always ready). */
export function startState(seats: LudoSeat[]): { ok: boolean; reason: string } {
  const active = activeSeats(seats);
  if (active.length < 2) return { ok: false, reason: "Waiting for at least one more player" };
  const notReady = active.filter((s) => !s.ready).length;
  if (notReady) return { ok: false, reason: `Waiting for ${notReady} ${notReady === 1 ? "player" : "players"} to be ready` };
  return { ok: true, reason: "Everyone's ready!" };
}
