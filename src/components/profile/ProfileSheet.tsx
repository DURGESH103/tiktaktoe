"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Sheet } from "@/components/ui/Sheet";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { ProfileSkeleton, PublicProfileView } from "./PublicProfileView";

/** Opponent's profile over the game, so checking their stats doesn't interrupt play. */
export function ProfileSheet({ handle, open, onClose }: { handle: string | null; open: boolean; onClose: () => void }) {
  const p = usePublicProfile(open ? handle : null);

  return (
    <Sheet open={open} onClose={onClose} labelledBy="profile-sheet-name">
      <div className="flex flex-col gap-4 pb-1">
        {p.status === "ready" ? (
          <PublicProfileView profile={p.profile} compact headingId="profile-sheet-name" />
        ) : p.status === "loading" ? (
          <>
            <h2 id="profile-sheet-name" className="sr-only">
              Player profile
            </h2>
            <ProfileSkeleton />
          </>
        ) : (
          <>
            <h2 id="profile-sheet-name" className="sr-only">
              Player profile
            </h2>
            <ErrorState
              icon="📡"
              title="Couldn't load profile"
              body="Please try again in a moment."
              actions={[{ label: "Try again", onClick: p.retry }]}
              heading="h2"
            />
          </>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1" data-autofocus>
            Back to game
          </Button>
          {handle && (
            // Opens in a new tab so the game keeps running here.
            <Link href={`/u/${handle}`} target="_blank" rel="noopener" className={buttonClass("ghost", "md", "flex-1")}>
              Full profile ↗
            </Link>
          )}
        </div>
      </div>
    </Sheet>
  );
}
