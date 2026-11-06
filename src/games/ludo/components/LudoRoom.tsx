"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactionBar, ReactionLayer } from "@/components/game/Reactions";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { useSocial } from "@/components/providers/SocialProvider";
import { AppHeader } from "@/components/ui/AppHeader";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { MuteToggle } from "@/components/ui/MuteToggle";
import { ShareActions } from "@/components/ui/ShareActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { ERROR_COPY } from "@/lib/errors";
import { roomPath } from "@/lib/games";
import { reactionLabel } from "@/lib/reactions";
import { useRoomFlag } from "@/hooks/useRoomFlag";
import { useLudoRoom } from "../hooks/useLudoRoom";
import { activeSeats, allowedSeats, startState } from "../lib/seats";
import type { LudoMode } from "../types";
import { InviteFriendsSheet } from "./InviteFriendsSheet";
import { LudoChat } from "./LudoChat";
import { LudoGame } from "./LudoGame";
import { LudoResults } from "./LudoResults";
import { SeatGrid } from "./SeatGrid";

/** /ludo/[code]: the Ludo table — lobby, game, and results. */
export function LudoRoom({ code }: { code: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { feedback } = useSettings();
  const social = useSocial();
  const r = useLudoRoom(code, user?.id ?? null);
  const [announcement, setAnnouncement] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Results of a finished game stay up until you go back to the lobby (per device).
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Group chat: "Mute" hides everyone else's messages and reactions (per device, per room).
  const [hideOthers, setHideOthers] = useRoomFlag("hide-opponent", r.room?.id ?? null);
  // Height left above the chat sheet on a phone (null = sheet closed): the board shrinks to fit.
  const [aboveSheet, setAboveSheet] = useState<number | null>(null);
  const onLayout = useCallback((h: number | null) => setAboveSheet(h), []);
  const announce = useCallback((t: string) => setAnnouncement(t), []);

  // A Tic-Tac-Toe or Couple code opened here: send it to its own page.
  const isOtherGame = !!r.room && r.room.game_type !== "ludo";
  useEffect(() => {
    if (isOtherGame) router.replace(roomPath(code, r.room?.game_type));
  }, [isOtherGame, code, r.room?.game_type, router]);

  const seated = useMemo(() => activeSeats(r.seats), [r.seats]);
  const mySeat = seated.find((s) => s.player_id === r.me);
  const g = r.game;
  const myTurn = !!g && g.status === "playing" && !g.state.finished && g.seats[g.state.turn] === r.me;
  const reactions = hideOthers ? r.reactions.filter((x) => x.from === r.me) : r.reactions;

  // Someone sat down or left: a little sound + an announcement for screen readers.
  const prevIds = useRef<string[] | null>(null);
  useEffect(() => {
    const ids = seated.map((s) => s.player_id);
    const prev = prevIds.current;
    prevIds.current = ids;
    if (!prev) return;
    const joined = ids.filter((id) => !prev.includes(id) && id !== r.me);
    const left = prev.filter((id) => !ids.includes(id) && id !== r.me);
    if (joined.length) {
      feedback("join", "join");
      setAnnouncement(`${joined.map((id) => r.players[id]?.name ?? "Someone").join(", ")} joined the table.`);
    } else if (left.length) setAnnouncement(`${left.map((id) => r.players[id]?.name ?? "Someone").join(", ")} left the table.`);
  }, [seated, r.me, r.players, feedback]);

  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const x of r.reactions) {
      if (seen.current.has(x.id)) continue;
      seen.current.add(x.id);
      if (x.from === r.me || hideOthers) continue;
      feedback("reaction", null);
      setAnnouncement(`${r.players[x.from]?.name ?? "Someone"} reacted ${reactionLabel(x.emoji)}.`);
    }
  }, [r.reactions, r.me, r.players, hideOthers, feedback]);

  useEffect(() => {
    if (!confirmLeave) return;
    const t = setTimeout(() => setConfirmLeave(false), 3000);
    return () => clearTimeout(t);
  }, [confirmLeave]);

  async function leave() {
    await r.leave();
    router.push("/");
  }

  // `playing`: a game is on. "Leave game" (tap twice) replaces the back button, and the page is laid
  // out to fit one phone screen.
  const shell = (children: React.ReactNode, playing = false) => (
    <div className="min-h-dvh">
      <AppHeader
        slim={playing}
        left={
          <div className="flex items-center gap-2">
            {playing ? (
              <button
                type="button"
                onClick={() => (confirmLeave ? leave() : setConfirmLeave(true))}
                aria-label={confirmLeave ? "Tap again: leaving counts as last place" : "Leave game"}
                className={clsx(
                  "glass flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-2xl px-3 text-sm font-semibold transition-colors",
                  confirmLeave && "!bg-danger text-white",
                )}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
                </svg>
                {confirmLeave && <span aria-hidden>Leave = last</span>}
              </button>
            ) : (
              <Link href="/" aria-label="Back to home" className="glass grid h-12 w-12 place-items-center rounded-2xl">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
            )}
            {!(playing && confirmLeave) && (
              <span className="glass rounded-2xl px-3 py-2 font-display text-sm font-semibold tracking-[0.2em]">
                <span className="sr-only">Room code </span>
                {code}
              </span>
            )}
          </div>
        }
        extra={<MuteToggle />}
      />
      {/* While the chat sheet is open on a phone, the content is pinned above it. */}
      <main
        style={aboveSheet != null ? { height: aboveSheet } : undefined}
        className={clsx(
          "safe-x mx-auto flex w-full max-w-md flex-col",
          playing ? "gap-1.5" : "gap-4",
          aboveSheet != null
            ? "fixed inset-x-0 top-0 z-30 overflow-y-auto overscroll-contain bg-bg pb-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
            : playing
              ? "min-h-[calc(100dvh-3.75rem-env(safe-area-inset-top))] justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-0"
              : "pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-2",
        )}
      >
        {children}
        <p className="sr-only" aria-live="polite" aria-atomic>
          {announcement}
        </p>
      </main>
      {r.room && r.me && seated.some((s) => s.player_id === r.me) && (
        <LudoChat
          roomId={r.room.id}
          me={r.me}
          players={r.players}
          otherIds={seated.map((s) => s.player_id).filter((id) => id !== r.me)}
          hideOthers={hideOthers}
          onHideOthers={setHideOthers}
          readOnly={r.room.status === "abandoned"}
          onAnnounce={announce}
          onLayout={onLayout}
          yourTurn={myTurn}
          turnKey={r.game?.seq ?? 0}
        />
      )}
    </div>
  );

  if (r.loading || isOtherGame) return shell(<LobbySkeleton />);
  if (r.error) {
    const copy = ERROR_COPY[r.error];
    return shell(
      <div className="pt-8">
        <ErrorState
          icon={r.error === "ROOM_FULL" ? "🚪" : r.error === "ROOM_NOT_FOUND" ? "🔍" : r.error === "BLOCKED" ? "🚫" : "🎲"}
          title={copy.title}
          body={copy.body}
          actions={[{ label: ["ROOM_FULL", "ROOM_CLOSED", "GAME_STARTED"].includes(r.error) ? "Start your own game" : "Back home", href: "/" }]}
        />
      </div>,
    );
  }
  if (!r.room || !r.me || !r.settings) return shell(<LobbySkeleton />);

  // A game in progress, or the results of the one that just ended (until "Back to lobby").
  const game = r.game;
  if (game && game.status === "playing" && r.room.status !== "abandoned") {
    return shell(
      <>
        <div className="relative">
          <LudoGame
            game={game}
            me={r.me}
            players={r.players}
            pending={r.pending}
            error={r.actionError}
            onRoll={() => void r.rollDice()}
            onMove={(t) => void r.moveToken(t)}
            onResume={() => void r.resume()}
            deadline={r.deadline}
            presentIds={r.presentIds}
            compactHeight={aboveSheet}
          />
          <ReactionLayer reactions={reactions} me={r.me} />
        </div>
        {/* Reactions, with the chat button floating just to their right. */}
        {aboveSheet == null && (
          <div className="-ml-2 pr-[3.75rem]">
            <ReactionBar onReact={r.react} scrollHint />
          </div>
        )}
      </>,
      true,
    );
  }
  // Results stay up even if the table closed meanwhile (e.g. the host left during the game).
  // ...only for people who played in it (someone who sits down afterwards goes straight to the lobby).
  if (game && game.status === "finished" && dismissed !== game.id && Object.values(game.seats).includes(r.me)) {
    const tableOpen = r.room.status !== "abandoned" && seated.some((x) => x.player_id === r.me);
    return shell(
      <LudoResults
        game={game}
        me={r.me}
        players={r.players}
        tableOpen={tableOpen}
        isHost={r.isHost}
        onPlayAgain={() => {
          setDismissed(game.id);
          if (!r.isHost) void r.setReady(true);
        }}
        onBack={() => setDismissed(game.id)}
      />,
    );
  }

  if (r.room.status === "abandoned") {
    return shell(
      <div className="pt-8">
        <ErrorState icon="🎲" title="This table is closed" body="The host closed the lobby. Start a new Ludo game any time." actions={[{ label: "Back home", href: "/" }]} />
      </div>,
    );
  }

  const max = r.settings.max_players;
  const openSeats = allowedSeats(max).length - seated.length;
  const start = startState(r.seats);
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/ludo/${code}`;
  const hostName = r.players[r.room.player_x]?.name ?? "The host";

  return shell(
    <>
      <section aria-labelledby="lobby-title" className="flex flex-col gap-1">
        <h1 id="lobby-title" className="font-display text-3xl font-bold">
          Ludo table 🎲
        </h1>
        <p className="text-sm text-muted" role="status">
          {seated.length} of {max} seated · {r.settings.mode === "quick" ? "Quick mode" : "Classic"}
          {r.room.status === "playing" && " · game starting…"}
        </p>
      </section>

      <div className="relative">
        <SeatGrid
          seats={r.seats}
          players={r.players}
          maxPlayers={max}
          me={r.me}
          hostId={r.room.player_x}
          presentIds={r.presentIds}
          onInvite={() => setInviteOpen(true)}
        />
        <ReactionLayer reactions={reactions} me={r.me} />
      </div>

      {r.isHost ? (
        <GlassCard className="flex flex-col gap-4 p-4">
          <Segmented
            label="Players"
            value={String(max)}
            options={[
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
            ]}
            disabled={r.busy}
            isDisabled={(v) => Number(v) < seated.length}
            onChange={(v) => void r.setOptions({ maxPlayers: Number(v) })}
          />
          <Segmented
            label="Mode"
            value={r.settings.mode}
            options={[
              { value: "classic", label: "Classic" },
              { value: "quick", label: "Quick ⚡" },
            ]}
            disabled={r.busy}
            onChange={(v) => void r.setOptions({ mode: v as LudoMode })}
          />
          <p className="-mt-2 text-xs text-muted">
            {r.settings.mode === "quick" ? "Quick: everyone starts with one token already out." : "Classic: roll a 6 to bring a token out."} Changing options asks everyone to
            press Ready again.
          </p>
        </GlassCard>
      ) : (
        <p className="text-center text-sm text-muted">
          {hostName} picks the table size and mode, then starts the game.
        </p>
      )}

      {r.actionError && (
        <p role="alert" className="text-center text-sm text-danger">
          {ERROR_COPY[r.actionError].body}
        </p>
      )}

      {r.isHost ? (
        <div className="flex flex-col gap-1">
          <Button size="lg" disabled={!start.ok} loading={r.busy} onClick={() => void r.start()}>
            Start game
          </Button>
          <p className="text-center text-xs text-muted" role="status">
            {start.reason}
          </p>
        </div>
      ) : (
        mySeat && (
          <Button
            size="lg"
            variant={mySeat.ready ? "secondary" : "primary"}
            aria-pressed={mySeat.ready}
            loading={r.busy}
            onClick={() => void r.setReady(!mySeat.ready)}
          >
            {mySeat.ready ? "Ready ✓ (tap to undo)" : "I'm ready"}
          </Button>
        )
      )}

      <GlassCard className="flex flex-col gap-3 p-4">
        <h2 className="font-display text-lg font-semibold">Invite players</h2>
        {social && (
          <Button variant="secondary" onClick={() => setInviteOpen(true)} disabled={openSeats <= 0}>
            👥 Invite friends {openSeats > 0 ? `(${openSeats} open)` : "(table full)"}
          </Button>
        )}
        <ShareActions url={link} text={`Join my Ludo table on Tiktoe 🎲 Room code ${code}`} label="Share link" />
      </GlassCard>

      <ReactionBar onReact={r.react} />

      <Button variant={confirmLeave ? "danger" : "ghost"} onClick={() => (confirmLeave ? leave() : setConfirmLeave(true))} className="mx-auto">
        {confirmLeave ? (r.isHost ? "Tap again to close the table" : "Tap again to leave") : r.isHost ? "Close table" : "Leave table"}
      </Button>

      <InviteFriendsSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roomCode={code}
        seatedHandles={new Set(seated.map((s) => r.players[s.player_id]?.handle).filter((h): h is string => !!h))}
        openSeats={openSeats}
      />
    </>,
  );
}

/** Small segmented control (radio group) with 48px targets. */
function Segmented({
  label,
  value,
  options,
  onChange,
  disabled,
  isDisabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  isDisabled?: (v: string) => boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold" id={`seg-${label}`}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`seg-${label}`} className="flex gap-1 rounded-2xl bg-fg/[0.06] p-1">
        {options.map((o) => {
          const on = o.value === value;
          const off = disabled || isDisabled?.(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={off && !on}
              onClick={() => !on && onChange(o.value)}
              className={clsx("relative min-h-12 min-w-12 rounded-xl px-3 font-semibold transition-colors", on ? "text-white" : "text-fg disabled:opacity-40")}
            >
              {on && <motion.span layoutId={`seg-pill-${label}`} className="absolute inset-0 rounded-xl bg-accent" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LobbySkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Loading the Ludo table…</span>
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-14 rounded-2xl" />
    </div>
  );
}
