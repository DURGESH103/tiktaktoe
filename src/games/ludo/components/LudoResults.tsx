"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect } from "react";
import { useSettings } from "@/components/providers/SettingsProvider";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { celebrate } from "@/lib/confetti";
import type { Player } from "@/types/db";
import type { Color } from "../engine";
import { COLOR_HEX } from "../lib/board";
import { COLOR_STYLE } from "../lib/seats";
import type { LudoGameRow } from "../types";

const PLACE = ["1st", "2nd", "3rd", "4th"];
const MEDALS = ["🥇", "🥈", "🥉", "4th"];
/** Podium blocks: 2nd on the left, 1st in the middle (tallest), 3rd on the right. */
const STEPS = [
  { place: 1, height: "h-20", delay: 0.35 },
  { place: 0, height: "h-28", delay: 0.6 },
  { place: 2, height: "h-14", delay: 0.1 },
];

/** Winner screen: a podium (1st/2nd/3rd, 4th below), confetti, and "Play again". */
export function LudoResults({
  game,
  me,
  players,
  tableOpen,
  isHost,
  onPlayAgain,
  onBack,
}: {
  game: LudoGameRow;
  me: string;
  players: Record<string, Player>;
  /** The table is still open (false when the host left during the game). */
  tableOpen: boolean;
  isHost: boolean;
  onPlayAgain: () => void;
  onBack: () => void;
}) {
  const { feedback } = useSettings();
  const order = game.state.placements as Color[];
  const winner = game.seats[order[0]];
  const myPlace = order.findIndex((c) => game.seats[c] === me);
  useEffect(() => {
    void celebrate();
    feedback(myPlace === 0 ? "win" : myPlace >= 0 && myPlace < order.length - 1 ? "home" : "lose", myPlace === 0 ? "win" : null);
    // Once per finished game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  const who = (c: Color) => (game.seats[c] === me ? "You" : (players[game.seats[c] ?? ""]?.name ?? "Player"));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <h1 className="font-display text-3xl font-bold">{winner === me ? "You win! 🎉" : `${who(order[0])} wins!`}</h1>
        <p className="text-sm text-muted">{myPlace > 0 ? `You finished ${PLACE[myPlace]}.` : myPlace === 0 ? "First home with all four tokens." : "Final standings"}</p>
      </div>

      {/* Podium */}
      <ol aria-label="Final standings" className="flex items-end justify-center gap-2 px-2 pt-6">
        {STEPS.filter((st) => st.place < order.length).map((st) => {
          const c = order[st.place];
          const p = players[game.seats[c] ?? ""];
          return (
            <li key={c} className="flex w-28 flex-col items-center gap-1" style={{ order: st.place === 0 ? 2 : st.place === 1 ? 1 : 3 }}>
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: st.delay + 0.25, type: "spring", stiffness: 300, damping: 14 }}
                className="relative flex flex-col items-center"
              >
                {st.place === 0 && (
                  <motion.span
                    aria-hidden
                    className="absolute -top-7 text-2xl"
                    initial={{ y: -10, rotate: -20, opacity: 0 }}
                    animate={{ y: 0, rotate: 0, opacity: 1 }}
                    transition={{ delay: st.delay + 0.5, type: "spring" }}
                  >
                    👑
                  </motion.span>
                )}
                <span className="rounded-full ring-4" style={{ ["--tw-ring-color" as string]: COLOR_HEX[c] }}>
                  <AvatarBadge avatar={p?.avatar ?? "❔"} color={p?.color ?? "slate"} size={st.place === 0 ? "md" : "sm"} />
                </span>
                <span className="mt-1 max-w-full truncate text-sm font-semibold">{who(c)}</span>
              </motion.div>
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: st.delay, duration: 0.45, ease: "easeOut" }}
                style={{ originY: 1, background: `linear-gradient(to bottom, ${COLOR_HEX[c]}, ${COLOR_HEX[c]}99)` }}
                className={`grid w-full place-items-start justify-center rounded-t-2xl pt-2 text-white shadow-lg ${st.height}`}
              >
                <span className="font-display text-2xl font-bold drop-shadow" aria-label={`${PLACE[st.place]} place`}>
                  {st.place + 1}
                </span>
              </motion.div>
            </li>
          );
        })}
      </ol>

      {order.length > 3 && (
        <GlassCard className="flex items-center gap-3 p-3">
          <span className="w-10 text-center text-sm font-semibold text-muted" aria-label="4th place">
            {MEDALS[3]}
          </span>
          <AvatarBadge avatar={players[game.seats[order[3]] ?? ""]?.avatar ?? "❔"} color={players[game.seats[order[3]] ?? ""]?.color ?? "slate"} size="sm" />
          <span className="min-w-0 flex-1 truncate font-semibold">{who(order[3])}</span>
          <span className="text-xs font-semibold uppercase" style={{ color: COLOR_HEX[order[3]] }}>
            {COLOR_STYLE[order[3]].label}
          </span>
        </GlassCard>
      )}

      <div className="flex flex-col gap-2">
        {tableOpen ? (
          <>
            <Button size="lg" onClick={onPlayAgain}>
              Play again
            </Button>
            <p className="text-center text-xs text-muted">{isHost ? "Back to the table: start when everyone is ready." : "Marks you ready for the next game at this table."}</p>
            <Button variant="ghost" onClick={onBack}>
              Back to the table
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={onBack}>
            Back to the table
          </Button>
        )}
        <Link href="/history?game=ludo" className="mx-auto min-h-12 content-center rounded-xl px-3 text-sm font-medium text-accent hover:underline">
          Your Ludo stats &amp; history
        </Link>
      </div>
    </div>
  );
}
