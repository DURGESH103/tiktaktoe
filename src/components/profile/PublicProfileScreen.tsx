"use client";

import { ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { ShareActions } from "@/components/ui/ShareActions";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { profileUrl } from "@/lib/code";
import { ProfileSkeleton, PublicProfileView } from "./PublicProfileView";

export function PublicProfileScreen({ handle }: { handle: string }) {
  const p = usePublicProfile(handle);

  if (p.status === "loading") return <ProfileSkeleton />;
  if (p.status === "error")
    return (
      <ErrorState icon="📡" title="Couldn't load profile" body="Check your connection and try again." actions={[{ label: "Try again", onClick: p.retry }]} />
    );
  if (p.status === "missing")
    return <ErrorState icon="🔍" title="Player not found" body="This profile link doesn't match anyone." actions={[{ label: "Go home", href: "/" }]} />;

  const { profile } = p;
  return (
    <div className="flex flex-col gap-6">
      <PublicProfileView profile={profile} headingId="profile-name" />

      <GlassCard className="flex flex-col gap-3 p-5">
        <h2 className="font-display text-lg font-semibold">{profile.is_me ? "Share your profile" : `Share ${profile.player.name}'s profile`}</h2>
        <ShareActions
          url={profileUrl(profile.player.handle)}
          text={profile.is_me ? "Check out my Tic-Tac-Toe stats on Tiktoe!" : `${profile.player.name}'s Tic-Tac-Toe stats on Tiktoe`}
          label="Share profile"
        />
      </GlassCard>

      {!profile.is_me && (
        <ButtonLink href="/" variant="primary" size="lg">
          Start a game
        </ButtonLink>
      )}
    </div>
  );
}
