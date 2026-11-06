"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import type { Player } from "@/types/db";
import { allowedSeats, COLOR_STYLE, SEAT_COLORS } from "../lib/seats";
import type { LudoSeat } from "../types";

/** The four colour seats. Seats not used at this table size are dimmed; open seats invite. */
export function SeatGrid({
  seats,
  players,
  maxPlayers,
  me,
  hostId,
  presentIds,
  onInvite,
}: {
  seats: LudoSeat[];
  players: Record<string, Player>;
  maxPlayers: number;
  me: string;
  hostId: string;
  presentIds: Set<string> | null;
  onInvite: () => void;
}) {
  const used = allowedSeats(maxPlayers);
  return (
    <ul aria-label="Seats" className="grid grid-cols-2 gap-3">
      {SEAT_COLORS.map((color, n) => {
        const c = COLOR_STYLE[color];
        const s = seats.find((x) => x.seat === n && !x.left_at);
        const p = s ? players[s.player_id] : undefined;
        const inUse = used.includes(n);
        const online = !!s && (s.player_id === me || !!presentIds?.has(s.player_id));
        return (
          <li key={color}>
            <motion.div
              layout
              className={clsx(
                "glass relative flex min-h-36 flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl p-3 text-center",
                s && "ring-2",
                s && c.ring,
                !inUse && "opacity-40",
              )}
            >
              <span aria-hidden className={clsx("absolute inset-x-0 top-0 h-1.5", c.fill)} />
              <AnimatePresence mode="wait" initial={false}>
                {s ? (
                  <motion.div key={s.player_id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex flex-col items-center gap-1">
                    <span className="relative">
                      <AvatarBadge avatar={p?.avatar ?? "❔"} color={p?.color ?? "slate"} />
                      <span aria-hidden className={clsx("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-bg", online ? "bg-ok" : "bg-warn")} />
                    </span>
                    <span className="max-w-full truncate text-sm font-semibold">
                      {p?.name ?? "…"}
                      {s.player_id === me && <span className="font-normal text-muted"> (you)</span>}
                    </span>
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.ready ? "bg-ok/15 text-ok" : "bg-fg/10 text-muted")}>
                      {s.player_id === hostId ? "Host" : s.ready ? "Ready ✓" : "Not ready"}
                    </span>
                    <span className="sr-only">
                      {`${c.label} seat: ${p?.name ?? "player"}, ${s.player_id === hostId ? "host" : s.ready ? "ready" : "not ready"}, ${online ? "online" : "away"}`}
                    </span>
                  </motion.div>
                ) : inUse ? (
                  <motion.button
                    key="open"
                    type="button"
                    onClick={onInvite}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line/20 text-sm text-muted hover:bg-fg/[0.04]"
                    aria-label={`${c.label} seat is open: invite a friend`}
                  >
                    <span className="text-2xl" aria-hidden>
                      ＋
                    </span>
                    Invite
                  </motion.button>
                ) : (
                  <motion.span key="unused" className="text-sm text-muted">
                    Not used at {maxPlayers} players
                  </motion.span>
                )}
              </AnimatePresence>
              <span className={clsx("text-xs font-semibold uppercase tracking-wide", c.text)} aria-hidden>
                {c.label}
              </span>
            </motion.div>
          </li>
        );
      })}
    </ul>
  );
}
