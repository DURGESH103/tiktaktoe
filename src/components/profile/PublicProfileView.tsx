"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import Link from "next/link";
import { FriendButton } from "@/components/friends/FriendButton";
import { ResultPill } from "@/components/history/ResultPill";
import { StatsGrid } from "@/components/history/StatsGrid";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { dayLabel, timeLabel } from "@/lib/format";
import type { PublicPlayer, PublicProfile } from "@/types/db";

const memberSince = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });

/**
 * Profile content shared by the /u/[handle] page and the in-game bottom sheet.
 * `compact` (sheet): fewer recent matches and no links, so tapping around never leaves the game.
 */
export function PublicProfileView({
  profile,
  compact = false,
  headingId,
}: {
  profile: PublicProfile;
  compact?: boolean;
  headingId?: string;
}) {
  const { player, stats, head_to_head: h2h, recent, is_me } = profile;
  const shown = compact ? recent.slice(0, 5) : recent;
  const Heading = compact ? "h2" : "h1";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
          <AvatarBadge avatar={player.avatar} color={player.color} size="lg" />
        </motion.div>
        <div className="min-w-0">
          <Heading id={headingId} className="truncate font-display text-2xl font-bold">
            {player.name}
          </Heading>
          <p className="text-sm text-muted">Member since {memberSince(player.member_since)}</p>
          {is_me && <span className="mt-1 inline-block rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">This is you</span>}
        </div>
      </div>

      {/* Add friend / Requested / Friends ✓ (hidden for yourself and signed-out visitors). */}
      {!is_me && <FriendButton handle={player.handle} name={player.name} />}

      {h2h && (
        <GlassCard className="relative overflow-hidden p-4 text-center">
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-x/15 via-accent/10 to-o/15" />
          <p className="relative text-sm text-muted">Head-to-head</p>
          <p className="relative font-display text-xl font-semibold" aria-label={`You versus ${player.name}: ${h2h.wins} to ${h2h.losses}, ${h2h.draws} ${h2h.draws === 1 ? "draw" : "draws"}`}>
            <span aria-hidden>
              You vs {player.name}:{" "}
              <span className="tabular-nums">
                {h2h.wins} – {h2h.losses}
              </span>
              <span className="text-base font-normal text-muted">
                , {h2h.draws} {h2h.draws === 1 ? "draw" : "draws"}
              </span>
            </span>
          </p>
        </GlassCard>
      )}

      <StatsGrid stats={stats} title={`${player.name}'s stats`} />

      <section aria-labelledby={`${headingId ?? "profile"}-recent`} className="flex flex-col gap-2">
        <h3 id={`${headingId ?? "profile"}-recent`} className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Recent matches
        </h3>
        {shown.length === 0 ? (
          <GlassCard className="p-5 text-center text-sm text-muted">No finished games yet.</GlassCard>
        ) : (
          <GlassCard className="divide-y divide-line/10 overflow-hidden">
            {shown.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.03 }}
                className="flex min-h-14 items-center gap-3 px-4 py-2.5"
              >
                <Opponent opponent={m.opponent} linked={!compact} />
                <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                  <ResultPill result={m.result} />
                  <span className="text-xs text-muted">
                    {dayLabel(m.ended_at)} · {timeLabel(m.ended_at)}
                  </span>
                </div>
              </motion.div>
            ))}
          </GlassCard>
        )}
      </section>
    </div>
  );
}

function Opponent({ opponent, linked }: { opponent: PublicPlayer | null; linked: boolean }) {
  const inner = (
    <>
      <AvatarBadge avatar={opponent?.avatar ?? "❔"} color={opponent?.color ?? "slate"} size="sm" />
      <span className="truncate">
        <span className="text-muted">vs </span>
        <span className="font-semibold">{opponent?.name ?? "Unknown player"}</span>
      </span>
    </>
  );
  return opponent && linked ? (
    <Link
      href={`/u/${opponent.handle}`}
      className={clsx("flex min-h-12 min-w-0 items-center gap-2 rounded-xl hover:underline")}
    >
      {inner}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-2">{inner}</span>
  );
}

export function ProfileSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Loading profile…</span>
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[6.5rem] rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-40 rounded-3xl" />
    </div>
  );
}
