"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PlayerChip } from "@/components/game/PlayerChip";
import { ReactionBar, ReactionLayer } from "@/components/game/Reactions";
import { WaitingScreen } from "@/components/game/WaitingScreen";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { AppHeader } from "@/components/ui/AppHeader";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { MuteToggle } from "@/components/ui/MuteToggle";
import { Skeleton } from "@/components/ui/Skeleton";
import { useOpponentPresence } from "@/hooks/useOpponentPresence";
import { useRoomFlag } from "@/hooks/useRoomFlag";
import { ERROR_COPY } from "@/lib/errors";
import { roomPath } from "@/lib/games";
import { reactionLabel } from "@/lib/reactions";
import { useCoupleRoom } from "../hooks/useCoupleRoom";
import { COUPLE_MODES } from "../modes";
import { CoupleChat } from "./CoupleChat";

/** /couple/[code]: the Couple Challenge room. Stage 1 = lobby (modes arrive in later stages). */
export function CoupleRoom({ code }: { code: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { feedback } = useSettings();
  const r = useCoupleRoom(code, user?.id ?? null);
  const presence = useOpponentPresence(r.opponentId, r.presentIds);
  const [announcement, setAnnouncement] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [hidePartner, setHidePartner] = useRoomFlag("hide-opponent", r.room?.id ?? null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const partner = r.opponentId ? r.players[r.opponentId] : undefined;
  const me = r.me ? r.players[r.me] : undefined;
  const partnerName = partner?.name ?? "Your partner";

  // A Tic-Tac-Toe code opened here: send it to its own page.
  const isOtherGame = !!r.room && (r.room.game_type ?? "tictactoe") !== "couple";
  useEffect(() => {
    if (isOtherGame) router.replace(roomPath(code, r.room?.game_type));
  }, [isOtherGame, code, r.room?.game_type, router]);

  // Partner joined while I was waiting.
  const status = r.room?.status;
  const [prevStatus, setPrevStatus] = useState(status);
  useEffect(() => {
    if (prevStatus === "waiting" && status === "playing") {
      feedback("join", "join");
      setAnnouncement(`${partnerName} joined.`);
    }
    setPrevStatus(status);
  }, [status, prevStatus, feedback, partnerName]);

  // Reactions from the partner: sound + screen-reader announcement (unless hidden).
  const [seen] = useState(() => new Set<string>());
  useEffect(() => {
    for (const x of r.reactions) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      if (x.from === r.me || hidePartner) continue;
      feedback("reaction", null);
      setAnnouncement(`${partnerName} reacted ${reactionLabel(x.emoji)}.`);
    }
  }, [r.reactions, r.me, hidePartner, feedback, partnerName, seen]);

  useEffect(() => {
    if (!confirmLeave) return;
    const t = setTimeout(() => setConfirmLeave(false), 3000);
    return () => clearTimeout(t);
  }, [confirmLeave]);

  const announce = useCallback((t: string) => setAnnouncement(t), []);

  async function leave() {
    await r.leave();
    router.push("/");
  }

  const shell = (children: React.ReactNode) => (
    <div className="theme-couple min-h-dvh">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(40rem_30rem_at_90%_-10%,rgb(244_63_94/0.22),transparent_60%),radial-gradient(35rem_30rem_at_-10%_100%,rgb(236_72_153/0.18),transparent_60%)]" />
      <AppHeader
        left={
          <div className="flex items-center gap-2">
            <Link href="/" aria-label="Back to home" className="glass grid h-12 w-12 place-items-center rounded-2xl">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <span className="glass rounded-2xl px-3 py-2 font-display text-sm font-semibold tracking-[0.2em]">
              <span className="sr-only">Room code </span>
              {code}
            </span>
          </div>
        }
        extra={<MuteToggle />}
      />
      <main className="safe-x mx-auto flex w-full max-w-md flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-2">
        {children}
        <p className="sr-only" aria-live="polite" aria-atomic>
          {announcement}
        </p>
      </main>
    </div>
  );

  if (r.loading || isOtherGame) return shell(<RoomSkeleton />);

  if (r.error) {
    const copy = ERROR_COPY[r.error];
    return shell(
      <div className="pt-8">
        <ErrorState
          icon={r.error === "ROOM_FULL" ? "🚪" : r.error === "ROOM_NOT_FOUND" ? "🔍" : "💔"}
          title={copy.title}
          body={copy.body}
          actions={[{ label: r.error === "ROOM_FULL" || r.error === "ROOM_CLOSED" ? "Start your own game" : "Back home", href: "/" }]}
        />
      </div>,
    );
  }
  if (!r.room || !r.me) return shell(<RoomSkeleton />);

  if (r.room.status === "waiting") {
    return shell(
      <WaitingScreen
        code={code}
        me={me}
        onCancel={leave}
        inviteUrl={`${window.location.origin}/couple/${code}`}
        inviteText={`${me?.name ?? "Someone"} invited you to play Couple Challenge 💞 Room code ${code}`}
      />,
    );
  }

  const abandoned = r.room.status === "abandoned";

  return shell(
    <>
      {/* The two of us. Tapping the partner opens their profile without leaving the room. */}
      <div className="relative">
        <GlassCard className="flex items-stretch gap-1 p-1.5">
          <PlayerChip player={me} mark="X" isMe active={false} align="left" hideMark />
          <motion.span
            aria-hidden
            className="grid shrink-0 place-items-center px-1 text-2xl"
            animate={{ scale: [1, 1.18, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            💞
          </motion.span>
          <PlayerChip
            player={partner}
            mark="O"
            isMe={false}
            active={false}
            presence={presence}
            align="right"
            hideMark
            onOpenProfile={partner ? () => setProfileOpen(true) : undefined}
          />
        </GlassCard>
        <ReactionLayer reactions={hidePartner ? r.reactions.filter((x) => x.from === r.me) : r.reactions} me={r.me} />
      </div>

      {abandoned ? (
        <ErrorState icon="💔" title="This room is closed" body="Start a new Couple Challenge any time." actions={[{ label: "Back home", href: "/" }]} heading="h2" />
      ) : (
        <>
          <section aria-labelledby="modes-title" className="flex flex-col gap-3">
            <h1 id="modes-title" className="font-display text-2xl font-bold">
              Pick a mode
            </h1>
            <div className="grid grid-cols-2 gap-3">
              {COUPLE_MODES.map((m, i) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                  <button
                    type="button"
                    disabled={!m.ready}
                    aria-describedby={`mode-${m.id}`}
                    className={clsx(
                      "glass relative flex h-full min-h-36 w-full flex-col items-start gap-2 rounded-3xl p-4 text-left transition",
                      m.ready ? "hover:bg-accent/10" : "cursor-not-allowed opacity-70",
                    )}
                  >
                    <span className="text-3xl" aria-hidden>
                      {m.emoji}
                    </span>
                    <span className="font-display font-semibold leading-tight">{m.title}</span>
                    <span id={`mode-${m.id}`} className="text-xs text-muted">
                      {m.blurb}
                    </span>
                    {!m.ready && (
                      <span className="absolute right-3 top-3 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                        Coming next
                      </span>
                    )}
                  </button>
                </motion.div>
              ))}
            </div>
          </section>

          <ReactionBar onReact={r.react} />
        </>
      )}

      <AnimatePresence>
        {!abandoned && presence === "away" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            className="rounded-2xl border border-warn/30 bg-warn/10 p-3 text-center text-sm"
          >
            {partnerName} stepped away. Waiting for them to come back…
          </motion.p>
        )}
      </AnimatePresence>

      {!abandoned && (
        <Button variant={confirmLeave ? "danger" : "ghost"} onClick={() => (confirmLeave ? leave() : setConfirmLeave(true))} className="mx-auto">
          {confirmLeave ? "Tap again to leave" : "Leave room"}
        </Button>
      )}

      <ProfileSheet handle={partner?.handle ?? null} open={profileOpen} onClose={() => setProfileOpen(false)} />

      {partner && (
        <CoupleChat
          roomId={r.room.id}
          me={r.me}
          partner={partner}
          partnerId={r.opponentId}
          hidePartner={hidePartner}
          onHidePartner={setHidePartner}
          readOnly={abandoned}
          onAnnounce={announce}
        />
      )}
    </>,
  );
}

function RoomSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-[4.5rem] w-full rounded-3xl" />
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
