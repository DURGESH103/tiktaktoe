"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { dayLabel, timeLabel } from "@/lib/format";
import type { LudoHistoryGame, LudoStats } from "@/types/db";
import { COLOR_HEX } from "../lib/board";

const PLACE = ["1st", "2nd", "3rd", "4th"];
const MEDAL = ["🥇", "🥈", "🥉", "4th"];

/** Ludo stats tiles: games, 1st places, podiums, tokens captured, win streak (values from the server). */
export function LudoStatsGrid({ stats, title = "Ludo stats" }: { stats: LudoStats; title?: string }) {
  return (
    <section aria-label={title}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Games played">
          <Big>{stats.games}</Big>
        </Tile>
        <Tile label="1st places">
          <Big>
            <span aria-hidden>🥇 </span>
            {stats.wins}
          </Big>
        </Tile>
        <Tile label="Podiums">
          <Big>{stats.podiums}</Big>
          <p className="text-xs text-muted">Top 3, not last</p>
        </Tile>
        <Tile label="Tokens captured">
          <Big>
            <span aria-hidden>💥 </span>
            {stats.captures}
          </Big>
        </Tile>
        <Tile label="Win streak" wide>
          <p className="font-display text-2xl font-bold" aria-label={`Current win streak ${stats.current_win_streak}`}>
            <span aria-hidden>{stats.current_win_streak > 0 ? "🔥 " : ""}</span>
            {stats.current_win_streak}
          </p>
          <p className="text-xs text-muted">Best: {stats.best_win_streak}</p>
        </Tile>
      </div>
    </section>
  );
}

function Tile({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <GlassCard className={`flex min-h-[6rem] flex-col justify-between gap-2 p-4 ${wide ? "col-span-2 md:col-span-1" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      {children}
    </GlassCard>
  );
}

const Big = ({ children }: { children: React.ReactNode }) => <span className="font-display text-3xl font-bold tabular-nums">{children}</span>;

/** Finished Ludo games, newest first: my place, mode, date, and everyone's placing. */
export function LudoGameList({ games, linked = true }: { games: LudoHistoryGame[]; linked?: boolean }) {
  return (
    <ol aria-label="Ludo games" className="flex flex-col gap-2">
      {games.map((g, i) => (
        <motion.li key={g.game_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
          <GlassCard className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">
                <span aria-hidden>{MEDAL[g.place - 1]} </span>
                You finished {PLACE[g.place - 1]}
                <span className="font-normal text-muted"> of {g.players}</span>
              </p>
              <span className="shrink-0 text-xs text-muted">
                {dayLabel(g.ended_at)} · {timeLabel(g.ended_at)}
              </span>
            </div>
            <ol aria-label="Placings" className="flex flex-wrap gap-x-3 gap-y-1">
              {g.standings.map((s) => {
                const who = (
                  <>
                    <span className="text-xs font-semibold text-muted">{PLACE[s.place - 1]}</span>
                    <span className="rounded-full" style={{ boxShadow: `0 0 0 2px ${COLOR_HEX[s.color]}` }}>
                      <AvatarBadge avatar={s.player?.avatar ?? "❔"} color={s.player?.color ?? "slate"} size="xs" />
                    </span>
                    <span className="max-w-[7rem] truncate text-sm">{s.player?.name ?? "Unknown player"}</span>
                    {s.forfeited && <span className="text-xs text-muted">(left)</span>}
                  </>
                );
                return (
                  <li key={s.color} className="flex items-center gap-1.5">
                    {linked && s.player ? (
                      <Link href={`/u/${s.player.handle}`} className="flex min-h-8 items-center gap-1.5 hover:underline">
                        {who}
                      </Link>
                    ) : (
                      who
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted">
              {g.mode === "quick" ? "Quick mode" : "Classic"} · {g.captures} {g.captures === 1 ? "capture" : "captures"} by you
            </p>
          </GlassCard>
        </motion.li>
      ))}
    </ol>
  );
}
