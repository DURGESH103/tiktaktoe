"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { SeriesScore } from "@/lib/game/series";
import type { Mark, Player } from "@/types/db";

export type RoundOutcome = "win" | "loss" | "draw";

const COPY: Record<RoundOutcome, { icon: string; title: (opp: string) => string }> = {
  win: { icon: "🏆", title: () => "You win!" },
  loss: { icon: "😅", title: (opp) => `${opp} wins` },
  draw: { icon: "🤝", title: () => "It's a draw" },
};

interface Props {
  open: boolean;
  outcome: RoundOutcome;
  round: number;
  me?: Player;
  opponent?: Player;
  myMark: Mark;
  score: SeriesScore;
  nextStarterText: string;
  rematching: boolean;
  error: string | null;
  onRematch: () => void;
  onClose: () => void;
}

export function WinnerModal({
  open,
  outcome,
  round,
  me,
  opponent,
  myMark,
  score,
  nextStarterText,
  rematching,
  error,
  onRematch,
  onClose,
}: Props) {
  const copy = COPY[outcome];
  const oppName = opponent?.name ?? "Your friend";
  const oppMark: Mark = myMark === "X" ? "O" : "X";
  const mine = score[myMark];
  const theirs = score[oppMark];

  return (
    <Sheet open={open} onClose={onClose} labelledBy="result-title" describedBy="result-score" className="pt-3 text-center">
      <motion.div
        className="text-6xl"
        aria-hidden
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.1 }}
      >
        {copy.icon}
      </motion.div>
      <h2 id="result-title" className="mt-2 font-display text-3xl font-bold">
        {copy.title(oppName)}
      </h2>
      <p className="text-sm text-muted">Round {round}</p>

      <div
        id="result-score"
        className="my-5 flex items-center justify-center gap-4 rounded-3xl bg-fg/[0.05] px-4 py-4"
        aria-label={`Series score: ${me?.name ?? "You"} ${mine}, ${oppName} ${theirs}, draws ${score.draws}`}
      >
        <ScoreSide name={me?.name ?? "You"} avatar={me?.avatar} value={mine} highlight={outcome === "win"} />
        <span className="font-display text-2xl text-muted" aria-hidden>
          –
        </span>
        <ScoreSide name={oppName} avatar={opponent?.avatar} value={theirs} highlight={outcome === "loss"} />
      </div>
      <p className="-mt-3 mb-5 text-xs text-muted" aria-hidden>
        Draws {score.draws}
      </p>

      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onRematch} loading={rematching} data-autofocus>
          Rematch
        </Button>
        <Button variant="ghost" onClick={onClose}>
          View board
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">{nextStarterText}</p>
    </Sheet>
  );
}

function ScoreSide({ name, avatar, value, highlight }: { name: string; avatar?: string; value: number; highlight: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1" aria-hidden>
      <span className="text-2xl">{avatar}</span>
      <motion.span
        key={value}
        initial={highlight ? { scale: 1.8, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.25 }}
        className="font-display text-4xl font-bold tabular-nums"
      >
        {value}
      </motion.span>
      <span className="w-full truncate text-xs text-muted">{name}</span>
    </div>
  );
}
