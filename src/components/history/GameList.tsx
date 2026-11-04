"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { dayLabel, timeLabel } from "@/lib/format";
import type { HistoryEntry } from "@/lib/history";
import type { Player } from "@/types/db";
import { MiniBoard } from "./MiniBoard";
import { ResultPill } from "./ResultPill";

const RESULT_WORD = { win: "won", loss: "lost", draw: "drew" } as const;

/** Past rounds grouped by day, newest first. Each row opens the replay. */
export function GameList({ entries, players }: { entries: HistoryEntry[]; players: Record<string, Player> }) {
  const groups: { label: string; items: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const label = dayLabel(e.endedAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="flex flex-col gap-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h3>
          <GlassCard className="divide-y divide-line/10 overflow-hidden">
            {g.items.map((e, i) => {
              const opp = e.opponentId ? players[e.opponentId] : undefined;
              const name = opp?.name ?? "Unknown player";
              return (
                <motion.div
                  key={e.gameId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 10) * 0.03 }}
                >
                  <Link
                    href={`/history/${e.gameId}`}
                    aria-label={`You ${RESULT_WORD[e.result]} against ${name}, round ${e.round}, ${e.moves.length} moves, ${timeLabel(e.endedAt)}. Open replay.`}
                    className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-fg/[0.04]"
                  >
                    <MiniBoard board={e.board} winningLine={e.winningLine} className="h-11 w-11" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        <AvatarBadge avatar={opp?.avatar ?? "❔"} color={opp?.color ?? "slate"} size="xs" />
                        <span className="truncate">vs {name}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {timeLabel(e.endedAt)} · Round {e.round} · {e.moves.length} moves · played {e.myMark}
                      </p>
                    </div>
                    <ResultPill result={e.result} />
                  </Link>
                </motion.div>
              );
            })}
          </GlassCard>
        </section>
      ))}
    </div>
  );
}
