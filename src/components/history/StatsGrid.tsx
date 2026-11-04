"use client";

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import type { PlayerStats } from "@/types/db";

/** Stats tiles. Values come straight from the server (get_my_stats / get_public_profile). */
export function StatsGrid({ stats, title = "Stats" }: { stats: PlayerStats; title?: string }) {
  const pct = stats.win_rate === null ? null : Math.round(stats.win_rate * 100);

  return (
    <section aria-label={title}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Games played">
          <span className="font-display text-3xl font-bold tabular-nums">{stats.total}</span>
        </Tile>

        <Tile label="Win rate">
          <div className="flex items-center gap-3">
            <Ring value={pct ?? 0} />
            <span className="font-display text-3xl font-bold tabular-nums">{pct === null ? "—" : `${pct}%`}</span>
          </div>
        </Tile>

        <Tile label="Wins · Losses · Draws">
          <p
            className="font-display text-2xl font-bold tabular-nums"
            aria-label={`${stats.wins} wins, ${stats.losses} losses, ${stats.draws} draws`}
          >
            <span className="text-ok">{stats.wins}</span>
            <span className="text-muted"> · </span>
            <span className="text-danger">{stats.losses}</span>
            <span className="text-muted"> · </span>
            <span>{stats.draws}</span>
          </p>
        </Tile>

        <Tile label="Win streak">
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

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <GlassCard className="flex min-h-[6.5rem] flex-col justify-between gap-2 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      {children}
    </GlassCard>
  );
}

function Ring({ value }: { value: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden className="-rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="5" className="stroke-fg/10" />
      <motion.circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        stroke="rgb(var(--ok))"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - value / 100) }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
      />
    </svg>
  );
}
