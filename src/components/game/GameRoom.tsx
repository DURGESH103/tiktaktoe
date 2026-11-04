"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "@/components/board/Board";
import { ChatButton } from "@/components/chat/ChatButton";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { AppHeader } from "@/components/ui/AppHeader";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { MuteToggle } from "@/components/ui/MuteToggle";
import { Portal } from "@/components/ui/Portal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useGameRoom } from "@/hooks/useGameRoom";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOpponentPresence } from "@/hooks/useOpponentPresence";
import { useRoomChat } from "@/hooks/useRoomChat";
import { useRoomFlag } from "@/hooks/useRoomFlag";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { ERROR_COPY, type ErrorCode } from "@/lib/errors";
import { celebrate } from "@/lib/confetti";
import { other, parseBoard } from "@/lib/game/logic";
import { roomPath } from "@/lib/games";
import { cellName } from "@/lib/history";
import { reactionLabel } from "@/lib/reactions";
import { PlayerChip } from "./PlayerChip";
import { ReactionBar, ReactionLayer } from "./Reactions";
import { SeriesScoreBadge } from "./SeriesScoreBadge";
import { TurnIndicator } from "./TurnIndicator";
import { WaitingScreen } from "./WaitingScreen";
import { WinnerModal, type RoundOutcome } from "./WinnerModal";

const RESULT_FEEDBACK = { win: "win", loss: "lose", draw: "draw" } as const;

const ERROR_ICONS: Partial<Record<ErrorCode, string>> = {
  ROOM_FULL: "🚪",
  ROOM_NOT_FOUND: "🔍",
  ROOM_CLOSED: "👋",
  NETWORK: "📡",
};

export function GameRoom({ code }: { code: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const g = useGameRoom(code, user?.id ?? null);
  const presence = useOpponentPresence(g.opponentId, g.presentIds);

  // A Couple Challenge code opened at /game/CODE (e.g. typed by hand): send it to its own page.
  const isOtherGame = !!g.room?.game_type && g.room.game_type !== "tictactoe";
  useEffect(() => {
    if (isOtherGame) router.replace(roomPath(code, g.room?.game_type));
  }, [isOtherGame, code, g.room?.game_type, router]);
  const [dismissedLeft, setDismissedLeft] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const { feedback } = useSettings();
  // Screen-reader announcements for things that happen without the user acting (opponent moves, reactions).
  const [announcement, setAnnouncement] = useState("");
  const oppName = (g.opponentId && g.players[g.opponentId]?.name) || "Your friend";
  const oppNameRef = useRef(oppName);
  oppNameRef.current = oppName;
  const roomId = g.room?.id ?? null;
  // "Mute opponent" for this game: hides their chat messages and reactions on this device.
  const [hideOpponent, setHideOpponent] = useRoomFlag("hide-opponent", roomId);
  const hideRef = useRef(hideOpponent);
  hideRef.current = hideOpponent;

  // Let a rejected move shake for a moment, then clear it.
  const { rejected, clearRejected } = g;
  useEffect(() => {
    if (!rejected) return;
    feedback("error", "error");
    const t = setTimeout(clearRejected, 2500);
    return () => clearTimeout(t);
  }, [rejected, clearRejected, feedback]);

  useEffect(() => {
    if (presence === "online") setDismissedLeft(false);
  }, [presence]);

  useEffect(() => {
    if (!confirmLeave) return;
    const t = setTimeout(() => setConfirmLeave(false), 3000);
    return () => clearTimeout(t);
  }, [confirmLeave]);

  const cells = useMemo(() => (g.view ? parseBoard(g.view.board) : null), [g.view]);

  // ---- Round result: modal, confetti, rematch ----
  const roundOver = !!g.game && g.game.status === "finished" && g.room?.status !== "abandoned";
  const outcome: RoundOutcome | null = !roundOver
    ? null
    : g.game!.winner === "draw"
      ? "draw"
      : g.game!.winner === g.myMark
        ? "win"
        : "loss";
  const gameId = g.game?.id;
  const gameStatus = g.game?.status;
  const seenPlaying = useRef(new Set<string>());
  const celebrated = useRef(new Set<string>());
  const [resultOpenFor, setResultOpenFor] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    if (gameStatus === "playing") {
      seenPlaying.current.add(gameId);
      setRematchError(null);
      return;
    }
    if (!roundOver) return;
    // Rounds we watched finish get the full show; a finished round restored on refresh
    // just reopens the result without confetti.
    const live = seenPlaying.current.has(gameId);
    if (live && outcome) {
      feedback(RESULT_FEEDBACK[outcome], RESULT_FEEDBACK[outcome]);
    }
    const t = setTimeout(
      () => {
        setResultOpenFor(gameId);
        if (live && outcome === "win" && !celebrated.current.has(gameId)) {
          celebrated.current.add(gameId);
          void celebrate();
        }
      },
      live ? 950 : 300, // let the strike animation land first
    );
    return () => clearTimeout(t);
    // feedback is deliberately not a dependency: toggling mute must not replay the result.
  }, [gameId, gameStatus, roundOver, outcome]);

  // ---- Live events from the other side: opponent moves, friend joining, reactions ----
  const moveCount = g.game?.moves.length ?? 0;
  const lastSeen = useRef<{ id: string; n: number } | null>(null);
  useEffect(() => {
    const game = g.game;
    if (!game) return;
    const prev = lastSeen.current;
    lastSeen.current = { id: game.id, n: game.moves.length };
    // Only react to moves that arrive while we're watching (not the initial load or a refresh).
    if (!prev || prev.id !== game.id || game.moves.length <= prev.n) return;
    const m = game.moves[game.moves.length - 1];
    if (m.mark === g.myMark) return;
    if (game.status === "playing") feedback("opponent", "opponent"); // round-end sound covers the final move
    setAnnouncement(`${oppName} played ${m.mark} at ${cellName(m.cell)}.`);
  }, [gameId, moveCount]);

  const roomStatus = g.room?.status;
  const prevRoomStatus = useRef(roomStatus);
  useEffect(() => {
    if (prevRoomStatus.current === "waiting" && roomStatus === "playing") {
      feedback("join", "join");
      setAnnouncement(`${oppName} joined. You play X and go first.`);
    }
    prevRoomStatus.current = roomStatus;
  }, [roomStatus]);

  const seenReactions = useRef(new Set<string>());
  useEffect(() => {
    for (const r of g.reactions) {
      if (seenReactions.current.has(r.id)) continue;
      seenReactions.current.add(r.id);
      if (r.from === g.me || hideRef.current) continue;
      feedback("reaction", null);
      setAnnouncement(`${oppName} reacted ${reactionLabel(r.emoji)}.`);
    }
  }, [g.reactions]);

  // ---- Chat ----
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const onLiveMessage = useCallback(() => {
    if (hideRef.current || chatOpenRef.current) return; // open chat already shows (and announces) it
    feedback("message", "message");
    setAnnouncement(`New message from ${oppNameRef.current}.`);
  }, [feedback]);
  const chat = useRoomChat(roomId, g.me, g.opponentId, onLiveMessage);

  // Unread = their messages newer than what I last saw with the chat open (remembered per room).
  const [lastRead, setLastRead] = useState<string | null>(null);
  useEffect(() => {
    if (!roomId) return;
    try {
      setLastRead(localStorage.getItem(`chat-read:${roomId}`) ?? "");
    } catch {
      setLastRead("");
    }
  }, [roomId]);
  const newest = chat.messages.at(-1)?.created_at ?? "";
  useEffect(() => {
    if (!chatOpen || !roomId || lastRead === null || !newest || newest <= lastRead) return;
    setLastRead(newest);
    try {
      localStorage.setItem(`chat-read:${roomId}`, newest);
    } catch {}
  }, [chatOpen, newest, lastRead, roomId]);
  const unread =
    chatOpen || hideOpponent || lastRead === null
      ? 0
      : chat.messages.filter((m) => m.sender_id === g.opponentId && m.created_at > lastRead).length;
  const closeChat = useCallback(() => {
    setChatOpen(false);
    setChatExpanded(false);
    requestAnimationFrame(() => chatButtonRef.current?.focus());
  }, []);

  // Phone layout while chatting: the sheet takes ~45% of the visible screen (or nearly all of it when
  // expanded) and the game shrinks into the space above it, so every cell stays visible and tappable.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const viewport = useVisualViewport();
  const [chatExpanded, setChatExpanded] = useState(false);
  const visibleH = viewport.height || 800;
  const sheetH = chatExpanded
    ? visibleH - 56
    : Math.round(Math.max(visibleH * 0.45, Math.min(260, visibleH - 160))); // never too short for input + a few messages
  const compact = chatOpen && !isDesktop;
  // Largest square that fits above the sheet, below the turn chip (48px) and padding; never under 3×48px cells.
  const boardFit = compact
    ? Math.round(Math.max(156, Math.min((typeof window !== "undefined" ? window.innerWidth : 375) - 32, visibleH - sheetH - 48 - 20)))
    : undefined;

  const { play } = g;
  const onPlay = useCallback(
    (cell: number) => {
      feedback("place", "tap");
      void play(cell);
    },
    [feedback, play],
  );

  const { rematch } = g;
  const onRematch = useCallback(async () => {
    setRematching(true);
    setRematchError(null);
    const err = await rematch();
    setRematching(false);
    if (err) setRematchError(ERROR_COPY[err].body);
  }, [rematch]);
  const closeResult = useCallback(() => setResultOpenFor(null), []);

  async function leaveAndGoHome() {
    await g.leave();
    router.push("/");
  }

  const header = (
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
  );

  const shell = (children: React.ReactNode) => (
    <>
      {header}
      {/*
        Normal: bottom padding leaves room for the floating chat button; on desktop the board slides left for the chat panel.
        Compact (phone, chat open): pinned to the visible area above the chat sheet, showing just the turn chip and board.
      */}
      <main
        style={compact ? { top: viewport.top, height: Math.max(0, visibleH - sheetH) } : undefined}
        className={clsx(
          "safe-x mx-auto flex w-full max-w-md flex-col",
          compact
            ? "fixed inset-x-0 z-30 gap-1 bg-bg pb-2 pt-[calc(env(safe-area-inset-top)+0.25rem)]"
            : "gap-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-2 transition-transform duration-300",
          chatOpen && "lg:-translate-x-48",
        )}
      >
        {children}
        <p className="sr-only" aria-live="polite" aria-atomic>
          {announcement}
        </p>
      </main>
    </>
  );

  if (g.loading || isOtherGame) return shell(<GameSkeleton />);

  if (g.error) {
    const copy = ERROR_COPY[g.error];
    return shell(
      <div className="pt-8">
        <ErrorState
          icon={ERROR_ICONS[g.error] ?? "😕"}
          title={copy.title}
          body={copy.body}
          actions={
            g.error === "ROOM_FULL" || g.error === "ROOM_CLOSED"
              ? [{ label: "Start your own game", href: "/" }]
              : [{ label: "Back home", href: "/" }]
          }
        />
      </div>,
    );
  }

  if (!g.room || !g.myMark) return shell(<GameSkeleton />);

  const me = g.players[g.me!];
  const opponent = g.opponentId ? g.players[g.opponentId] : undefined;

  if (g.room.status === "waiting") {
    return shell(<WaitingScreen code={code} me={me} onCancel={leaveAndGoHome} />);
  }

  const game = g.game;
  const finished = game && game.status === "finished";
  const abandoned = g.room.status === "abandoned" || game?.status === "abandoned";
  const turn = g.view?.currentTurn ?? null;
  const myTurn = !!game && game.status === "playing" && turn === g.myMark && !abandoned;

  let turnText = "Get ready…";
  let tone: "X" | "O" | "neutral" | "win" = "neutral";
  if (abandoned) {
    turnText = "Game ended";
  } else if (finished) {
    if (game.winner === "draw") turnText = "It's a draw 🤝";
    else if (game.winner === g.myMark) [turnText, tone] = ["You win! 🎉", "win"];
    else [turnText, tone] = [`${oppName} wins`, game.winner as "X" | "O"];
  } else if (turn) {
    turnText = myTurn ? "Your turn" : `${oppName}'s turn`;
    tone = turn;
  }

  const xChip = { id: g.room.player_x, mark: "X" as const };
  const oChip = { id: g.room.player_o, mark: "O" as const };
  const chips = g.myMark === "X" ? [xChip, oChip] : [oChip, xChip]; // me on the left
  const renderChip = (c: typeof xChip | typeof oChip, align: "left" | "right") => (
    <PlayerChip
      player={c.id ? g.players[c.id] : undefined}
      mark={c.mark}
      isMe={c.id === g.me}
      active={!finished && !abandoned && turn === c.mark}
      presence={c.id === g.me ? undefined : presence}
      onOpenProfile={c.id && c.id !== g.me && g.players[c.id] ? () => setProfileOpen(true) : undefined}
      align={align}
    />
  );

  return shell(
    <>
      {/* Reactions pop out of the sender's avatar on these cards. Hidden in the compact chat layout. */}
      <div className={compact ? "hidden" : "relative"}>
        <GlassCard className="flex items-stretch gap-1 p-1.5">
          {renderChip(chips[0], "left")}
          <SeriesScoreBadge
            mine={g.score[g.myMark]}
            theirs={g.score[other(g.myMark)]}
            draws={g.score.draws}
            myName={me?.name ?? "You"}
            oppName={oppName}
          />
          {renderChip(chips[1], "right")}
        </GlassCard>
        <ReactionLayer reactions={hideOpponent ? g.reactions.filter((r) => r.from === g.me) : g.reactions} me={g.me} />
      </div>

      <TurnIndicator text={turnText} tone={tone} />

      {/* Always wrapped, so switching to the compact layout resizes the same board instead of remounting it. */}
      <div className={compact ? "flex min-h-0 flex-1 items-center justify-center" : undefined}>
        {cells && (
          <Board
            key={game?.id /* fresh entrance animation each round */}
            cells={cells}
            interactive={myTurn && !g.pending}
            winningLine={game?.winning_line ?? null}
            onPlay={onPlay}
            shakeCell={g.rejected?.cell ?? null}
            fitSize={boardFit}
          />
        )}
      </div>

      {!abandoned && opponent && (
        <div className={compact ? "hidden" : undefined}>
          <ReactionBar onReact={g.react} />
        </div>
      )}

      <div className={compact ? "hidden" : "min-h-[3.5rem]"}>
        <AnimatePresence mode="popLayout">
          {g.rejected && (
            <Notice key="rejected" tone="danger">
              {ERROR_COPY[g.rejected.code].title}. {ERROR_COPY[g.rejected.code].body}
            </Notice>
          )}
          {!g.rejected && g.connection === "reconnecting" && (
            <Notice key="reconnecting" tone="warn">
              Reconnecting… your game is safe.
            </Notice>
          )}
          {!g.rejected && g.connection !== "reconnecting" && !abandoned && presence === "away" && (
            <Notice key="away" tone="warn">
              {oppName} stepped away. Waiting for them to come back…
            </Notice>
          )}
          {!g.rejected && !abandoned && presence === "left" && !dismissedLeft && (
            <Notice key="left" tone="danger">
              <span className="block">{oppName} seems to have left.</span>
              <span className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => setDismissedLeft(true)} className="flex-1">
                  Keep waiting
                </Button>
                <Button variant="danger" onClick={leaveAndGoHome} className="flex-1">
                  Leave room
                </Button>
              </span>
            </Notice>
          )}
          {abandoned && (
            <Notice key="abandoned" tone="neutral">
              <span className="block">This room is closed.</span>
              <span className="mt-2 flex">
                <Button onClick={() => router.push("/")} className="flex-1">
                  Start a new game
                </Button>
              </span>
            </Notice>
          )}
          {finished && !abandoned && resultOpenFor !== game.id && (
            <Notice key="finished" tone="neutral">
              <span className="block text-muted">
                Round {game.round} · {game.moves.length} moves
              </span>
              <span className="mt-2 flex">
                <Button onClick={onRematch} loading={rematching} className="flex-1">
                  Rematch
                </Button>
              </span>
              {rematchError && <span className="mt-2 block text-danger">{rematchError}</span>}
            </Notice>
          )}
        </AnimatePresence>
      </div>

      <ProfileSheet handle={opponent?.handle ?? null} open={profileOpen} onClose={closeProfile} />

      {opponent && g.me && (
        <>
          <Portal>
            <AnimatePresence>
              {!chatOpen && (
                <ChatButton ref={chatButtonRef} unread={unread} typing={chat.opponentTyping && !hideOpponent} onClick={() => setChatOpen(true)} />
              )}
            </AnimatePresence>
          </Portal>
          <ChatPanel
            open={chatOpen}
            onClose={closeChat}
            me={g.me}
            opponent={opponent}
            messages={chat.messages}
            opponentTyping={chat.opponentTyping}
            hideOpponent={hideOpponent}
            onHideOpponent={setHideOpponent}
            readOnly={abandoned}
            onSend={chat.send}
            onRetry={chat.retry}
            onTyping={chat.sendTyping}
            loadError={chat.loadError}
            isDesktop={isDesktop}
            height={sheetH}
            keyboard={viewport.keyboard}
            expanded={chatExpanded}
            onExpandedChange={setChatExpanded}
            yourTurn={myTurn}
            turnKey={moveCount}
          />
        </>
      )}

      {game && outcome && (
        <WinnerModal
          open={resultOpenFor === game.id}
          outcome={outcome}
          round={game.round}
          me={me}
          opponent={opponent}
          myMark={g.myMark}
          score={g.score}
          nextStarterText={
            other(game.starting_turn) === g.myMark ? "You go first next round" : `${oppName} goes first next round`
          }
          rematching={rematching}
          error={rematchError}
          onRematch={onRematch}
          onClose={closeResult}
        />
      )}

      {!abandoned && !compact && (
        <Button
          variant={confirmLeave ? "danger" : "ghost"}
          onClick={() => (confirmLeave ? leaveAndGoHome() : setConfirmLeave(true))}
          className="mx-auto"
        >
          {confirmLeave ? "Tap again to leave" : "Leave game"}
        </Button>
      )}
    </>,
  );
}

function Notice({ tone, children }: { tone: "warn" | "danger" | "neutral"; children: React.ReactNode }) {
  const colors = {
    warn: "border-warn/30 bg-warn/10 text-fg",
    danger: "border-danger/30 bg-danger/10 text-fg",
    neutral: "border-line/10 bg-fg/[0.05] text-fg",
  }[tone];
  return (
    <motion.div
      layout
      role="status"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`rounded-2xl border p-3 text-center text-sm ${colors}`}
    >
      {children}
    </motion.div>
  );
}

function GameSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Loading game…</span>
      <Skeleton className="h-[4.5rem] w-full rounded-3xl" />
      <Skeleton className="mx-auto h-10 w-40 rounded-full" />
      <div className="glass mx-auto grid aspect-square w-full max-w-[min(92vw,26rem)] grid-cols-3 grid-rows-3 gap-2 rounded-4xl p-2">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
