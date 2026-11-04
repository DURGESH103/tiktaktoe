"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "@/components/board/Board";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useAuth } from "@/components/providers/AuthProvider";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { dateTimeLabel } from "@/lib/format";
import { boardAt, cellName, toEntries, type HistoryEntry, type RoomWithGames } from "@/lib/history";
import { parseBoard } from "@/lib/game/logic";
import { getSupabase } from "@/lib/supabase/client";
import type { Player, Room, RoomMessage } from "@/types/db";
import { ResultPill } from "./ResultPill";

const STEP_MS = 800;

export function Replay({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const me = user?.id ?? null;
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [room, setRoom] = useState<Pick<Room, "status" | "code"> | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const sb = getSupabase();
    (async () => {
      const { data } = await sb
        .from("games")
        .select("*, rooms(id, code, status, player_x, player_o)")
        .eq("id", gameId)
        .maybeSingle();
      if (cancelled) return;
      const r = data?.rooms as (RoomWithGames & Pick<Room, "status">) | undefined;
      const [e] = data && r ? toEntries([{ ...r, games: [data] }], me) : [];
      if (!e || !r) return setState("missing");
      const ids = [r.player_x, r.player_o].filter((id): id is string => !!id);
      // This round's chat: from its start until the next round starts (so a closing "GG" is included).
      const next = await sb.from("games").select("started_at").eq("room_id", r.id).eq("round", e.round + 1).maybeSingle();
      const until = next.data?.started_at ?? new Date(new Date(e.endedAt).getTime() + 10 * 60_000).toISOString();
      const [res, msgs] = await Promise.all([
        sb.from("players").select("*").in("id", ids),
        sb.from("room_messages").select("*").eq("room_id", r.id).gte("created_at", e.startedAt).lt("created_at", until).order("created_at"),
      ]);
      if (cancelled) return;
      if (res.data) setPlayers(Object.fromEntries((res.data as Player[]).map((p) => [p.id, p])));
      setMessages((msgs.data as RoomMessage[] | null) ?? []);
      setRoom({ status: r.status, code: r.code });
      setEntry(e);
      setStep(e.moves.length); // open on the final position
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [me, gameId]);

  const total = entry?.moves.length ?? 0;
  /** Manual navigation: stops auto-play and moves to step `s` (clamped). */
  const jump = useCallback(
    (s: number) => {
      setPlaying(false);
      setStep(Math.max(0, Math.min(total, s)));
    },
    [total],
  );

  // Auto-play: advance every STEP_MS; stop at the end.
  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step, total]);

  // ← / → step through moves from anywhere on the page (except where arrows already mean something).
  const latest = useRef({ jump, step });
  latest.current = { jump, step };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[role=grid]") || t.tagName === "INPUT") return;
      const { jump, step } = latest.current;
      if (e.key === "ArrowLeft") jump(step - 1);
      if (e.key === "ArrowRight") jump(step + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cells = useMemo(() => parseBoard(entry ? boardAt(entry.moves, step) : "........."), [entry, step]);

  if (state === "loading") return <ReplaySkeleton />;
  if (state === "missing" || !entry)
    return (
      <ErrorState
        icon="🔍"
        title="Game not found"
        body="This game doesn't exist, or you weren't one of its players."
        actions={[{ label: "Back to history", href: "/history" }]}
      />
    );

  const meP = me ? players[me] : undefined;
  const opp = entry.opponentId ? players[entry.opponentId] : undefined;
  const nameFor = (mark: "X" | "O") => (mark === entry.myMark ? "You" : (opp?.name ?? "Opponent"));
  const atEnd = step === total;
  const last = step > 0 ? entry.moves[step - 1] : null;

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex items-center gap-3 p-4">
        <div className="flex -space-x-3">
          {meP && <AvatarBadge avatar={meP.avatar} color={meP.color} />}
          <AvatarBadge avatar={opp?.avatar ?? "❔"} color={opp?.color ?? "slate"} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold">vs {opp?.name ?? "Unknown player"}</h1>
          <p className="text-xs text-muted">
            Round {entry.round} · {dateTimeLabel(entry.endedAt)}
          </p>
        </div>
        <ResultPill result={entry.result} />
      </GlassCard>

      <p className="h-6 text-center text-sm text-muted" aria-live="polite">
        {step === 0
          ? `Start · ${nameFor(entry.moves[0]?.mark ?? "X")} ${nameFor(entry.moves[0]?.mark ?? "X") === "You" ? "go" : "goes"} first`
          : `Move ${step} of ${total}: ${nameFor(last!.mark)} → ${cellName(last!.cell)}`}
      </p>

      <Board cells={cells} interactive={false} winningLine={atEnd ? entry.winningLine : null} onPlay={() => {}} />

      <GlassCard className="flex flex-col gap-3 p-4">
        <input
          type="range"
          min={0}
          max={total}
          value={step}
          onChange={(e) => jump(Number(e.target.value))}
          aria-label="Move"
          aria-valuetext={step === 0 ? "Start" : `Move ${step} of ${total}`}
          className="h-12 w-full cursor-pointer accent-[rgb(var(--accent))]"
        />
        <div className="flex items-center justify-between gap-2">
          <Ctl label="First move" onClick={() => jump(0)} disabled={step === 0} d="M6 5v14M18 6l-8 6 8 6z" />
          <Ctl label="Previous move" onClick={() => jump(step - 1)} disabled={step === 0} d="M15 6l-6 6 6 6" />
          <button
            type="button"
            onClick={() => {
              if (atEnd) setStep(0);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pause" : "Play replay"}
            className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-pink-600 text-white shadow-lg shadow-fuchsia-500/25"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              {playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
            </svg>
          </button>
          <Ctl label="Next move" onClick={() => jump(step + 1)} disabled={atEnd} d="M9 6l6 6-6 6" />
          <Ctl label="Last move" onClick={() => jump(total)} disabled={atEnd} d="M18 5v14M6 6l8 6-8 6z" />
        </div>
      </GlassCard>

      <GlassCard className="p-2">
        <h2 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Moves</h2>
        <ol className="grid grid-cols-1 gap-1 min-[400px]:grid-cols-2">
          {entry.moves.map((m, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => jump(i + 1)}
                aria-current={step === i + 1 ? "step" : undefined}
                className={clsx(
                  "flex min-h-12 w-full items-center gap-2 rounded-2xl px-3 text-left text-sm transition-colors",
                  step === i + 1 ? "bg-accent/15" : "hover:bg-fg/[0.05]",
                )}
              >
                <span className="w-5 tabular-nums text-muted">{i + 1}.</span>
                <span className={clsx("font-display font-bold", m.mark === "X" ? "text-x" : "text-o")}>{m.mark}</span>
                <span className="truncate">
                  {nameFor(m.mark)} · {cellName(m.cell)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </GlassCard>

      {messages.length > 0 && (
        <GlassCard className="p-3">
          <h2 className="px-1 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Chat from this round</h2>
          <ol className="flex flex-col gap-2" aria-label="Chat messages">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={{ key: m.id, body: m.body, created_at: m.created_at, status: "sent" }}
                mine={m.sender_id === me}
                sender={players[m.sender_id]}
              />
            ))}
          </ol>
        </GlassCard>
      )}

      {room?.status === "playing" && (
        <ButtonLink href={`/game/${room.code}`} variant="primary" size="lg">
          Continue this series
        </ButtonLink>
      )}
    </div>
  );
}

function Ctl({ label, onClick, disabled, d }: { label: string; onClick: () => void; disabled: boolean; d: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-12 w-12 place-items-center rounded-2xl text-fg transition hover:bg-fg/[0.06] disabled:opacity-30"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  );
}

function ReplaySkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Loading replay…</span>
      <Skeleton className="h-20 rounded-3xl" />
      <Skeleton className="mx-auto h-6 w-48" />
      <Skeleton className="mx-auto aspect-square w-full max-w-[min(92vw,26rem)] rounded-4xl" />
      <Skeleton className="h-32 rounded-3xl" />
    </div>
  );
}
