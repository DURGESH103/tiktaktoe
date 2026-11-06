"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { celebrate } from "@/lib/confetti";
import type { Player } from "@/types/db";
import type { Color } from "../engine";
import { COLOR_HEX } from "../lib/board";
import { COLOR_STYLE } from "../lib/seats";
import type { LudoGameRow } from "../types";

const MEDALS = ["🥇", "🥈", "🥉", "4th"];

/** Final standings of a finished game. (The full podium celebration arrives in a later stage.) */
export function LudoResults({ game, me, players, onBack }: { game: LudoGameRow; me: string; players: Record<string, Player>; onBack: () => void }) {
  const order = game.state.placements as Color[];
  const winner = game.seats[order[0]];
  useEffect(() => {
    if (winner === me) void celebrate();
  }, [winner, me]);

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col items-center gap-2 p-6 text-center">
        <motion.span initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 12 }} className="text-6xl" aria-hidden>
          🏆
        </motion.span>
        <h1 className="font-display text-3xl font-bold">{winner === me ? "You win!" : `${players[winner ?? ""]?.name ?? "Someone"} wins!`}</h1>
        <p className="text-sm text-muted">Final standings</p>
      </GlassCard>
      <ol aria-label="Final standings" className="flex flex-col gap-2">
        {order.map((c, i) => {
          const p = players[game.seats[c] ?? ""];
          return (
            <motion.li key={c} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 * i }}>
              <GlassCard className="flex items-center gap-3 p-3">
                <span className="w-10 text-center text-2xl" aria-label={`${i + 1}${["st", "nd", "rd", "th"][i]} place`}>
                  {MEDALS[i]}
                </span>
                <AvatarBadge avatar={p?.avatar ?? "❔"} color={p?.color ?? "slate"} size="sm" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {game.seats[c] === me ? "You" : (p?.name ?? "Player")}
                </span>
                <span className="text-xs font-semibold uppercase" style={{ color: COLOR_HEX[c] }}>
                  {COLOR_STYLE[c].label}
                </span>
              </GlassCard>
            </motion.li>
          );
        })}
      </ol>
      <Button size="lg" onClick={onBack}>
        Back to the table
      </Button>
    </div>
  );
}
