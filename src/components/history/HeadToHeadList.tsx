"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import Link from "next/link";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { relativeTime } from "@/lib/format";
import type { MyStats } from "@/types/db";

type Record_ = MyStats["head_to_head"][number];

/** Server-calculated record against each friend. Tapping a row filters the game list. */
export function HeadToHeadList({
  records,
  selected,
  onSelect,
}: {
  records: Record_[];
  selected: string | null;
  onSelect: (handle: string | null) => void;
}) {
  return (
    <section aria-labelledby="h2h-title" className="flex flex-col gap-3">
      <h2 id="h2h-title" className="font-display text-lg font-semibold">
        Head-to-head
      </h2>
      <GlassCard className="divide-y divide-line/10 overflow-hidden">
        {records.map((h) => {
          const { handle, name, avatar, color } = h.opponent;
          const active = selected === handle;
          return (
            <div key={handle} className={clsx("flex items-stretch transition-colors", active && "bg-accent/10")}>
              <button
                type="button"
                aria-pressed={active}
                aria-label={`Show games against ${name}: ${h.wins} wins, ${h.losses} losses, ${h.draws} draws`}
                onClick={() => onSelect(active ? null : handle)}
                className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left hover:bg-fg/[0.04]"
              >
                <AvatarBadge avatar={avatar} color={color} size="sm" />
                <div className="min-w-0 flex-1" aria-hidden>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">{name}</p>
                    <p className="shrink-0 text-sm tabular-nums">
                      <span className="font-semibold text-ok">{h.wins}W</span>
                      <span className="text-muted"> · </span>
                      <span className="font-semibold text-danger">{h.losses}L</span>
                      <span className="text-muted"> · </span>
                      <span className="font-semibold text-muted">{h.draws}D</span>
                    </p>
                  </div>
                  <RecordBar h={h} />
                  <p className="mt-1 text-xs text-muted">
                    {h.total} {h.total === 1 ? "game" : "games"}
                    {h.last_played_at && ` · last played ${relativeTime(h.last_played_at)}`}
                  </p>
                </div>
              </button>
              <Link
                href={`/u/${handle}`}
                aria-label={`${name}'s profile`}
                className="grid w-12 shrink-0 place-items-center text-muted hover:bg-fg/[0.04] hover:text-fg"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          );
        })}
      </GlassCard>
    </section>
  );
}

function RecordBar({ h }: { h: Record_ }) {
  const seg = (n: number) => `${(n / h.total) * 100}%`;
  return (
    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-fg/10">
      {(
        [
          [h.wins, "bg-ok"],
          [h.draws, "bg-muted/50"],
          [h.losses, "bg-danger"],
        ] as const
      ).map(([n, cls]) => (
        <motion.span
          key={cls}
          className={cls}
          initial={{ width: 0 }}
          animate={{ width: seg(n) }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
