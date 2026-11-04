"use client";

import { motion } from "framer-motion";
import { useAuth } from "@/components/providers/AuthProvider";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { FriendButton } from "./FriendButton";

/** Landing page for a shared friend link (/add/<friend code>). */
export function AddFriendScreen({ code }: { code: string }) {
  const { player } = useAuth();
  const p = usePublicProfile(code);

  if (p.status === "loading")
    return (
      <GlassCard className="flex flex-col items-center gap-4 p-8" aria-busy>
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-12 w-full rounded-2xl" />
      </GlassCard>
    );
  if (p.status !== "ready")
    return <ErrorState icon="🔍" title="Friend code not found" body="Check the link or ask your friend to share it again." actions={[{ label: "Go home", href: "/" }]} />;

  const { player: them, stats, is_me } = p.profile;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <GlassCard className="flex flex-col items-center gap-3 px-6 py-8 text-center">
        <AvatarBadge avatar={them.avatar} color={them.color} size="lg" />
        <h1 className="font-display text-2xl font-bold">{is_me ? "This is your friend link" : `Add ${them.name} as a friend?`}</h1>
        <p className="text-sm text-muted">
          {is_me
            ? "Share it so friends can add you."
            : `${stats.total} ${stats.total === 1 ? "game" : "games"} played · see when they're online and challenge them anytime.`}
        </p>
        {!is_me && player && <FriendButton handle={them.handle} name={them.name} className="mt-2 w-full" />}
        <div className="mt-2 flex w-full flex-col gap-2">
          <ButtonLink href="/friends" variant="secondary">
            Go to Friends
          </ButtonLink>
          <ButtonLink href={`/u/${them.handle}`} variant="ghost">
            View profile
          </ButtonLink>
        </div>
      </GlassCard>
    </motion.div>
  );
}
