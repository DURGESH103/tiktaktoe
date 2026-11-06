"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { ERROR_COPY, type ErrorCode } from "@/lib/errors";
import type { Player } from "@/types/db";
import { HOME, legalMoves, type Color, type LudoEvent } from "../engine";
import { COLOR_HEX } from "../lib/board";
import { COLOR_STYLE } from "../lib/seats";
import type { LudoGameRow } from "../types";
import { Dice } from "./Dice";
import { describe, LudoBoard } from "./LudoBoard";

/** A Ludo game in progress (the board, the dice, whose turn, the last thing that happened). */
export function LudoGame({
  game,
  me,
  players,
  pending,
  error,
  onRoll,
  onMove,
  onResume,
  deadline,
  presentIds,
}: {
  game: LudoGameRow;
  me: string;
  players: Record<string, Player>;
  /** The game request in flight, if any. */
  pending: "start" | "roll" | "move" | null;
  error: ErrorCode | null;
  onRoll: () => void;
  onMove: (token: number) => void;
  onResume: () => void;
  /** Local time the current turn runs out (see useLudoRoom). */
  deadline: number | null;
  /** Who is connected right now (presence). */
  presentIds: Set<string> | null;
}) {
  const offlineFor = useOfflineSince(Object.values(game.seats).filter((id): id is string => !!id), presentIds, me);
  const s = game.state;
  const myColor = (Object.entries(game.seats).find(([, id]) => id === me)?.[0] ?? null) as Color | null;
  const nameOf = (c: Color) => (game.seats[c] === me ? "You" : (players[game.seats[c] ?? ""]?.name ?? COLOR_STYLE[c].label));
  const names = Object.fromEntries(s.colors.map((c) => [c, nameOf(c)])) as Record<Color, string>;
  const myTurn = !s.finished && s.turn === myColor;
  const movable = myTurn && s.phase === "move" && s.dice ? legalMoves(s, s.turn, s.dice) : [];

  const away = new Set(game.away ?? []);
  const iAmAway = !!myColor && away.has(myColor);
  const status = s.finished
    ? "Game over"
    : away.has(s.turn)
      ? `Auto-playing for ${nameOf(s.turn) === "You" ? "you" : nameOf(s.turn)}…`
      : myTurn
        ? s.phase === "roll"
          ? "Your turn — roll the dice!"
          : `You rolled ${s.dice}. Pick a token to move.`
        : `${nameOf(s.turn)}'s turn`;

  return (
    <div className="flex flex-col gap-3">
      {/* Turn order + mini scoreboard (tokens home) */}
      <ol aria-label="Players" className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
        {s.colors.map((c) => {
          const p = players[game.seats[c] ?? ""];
          const home = (s.tokens[c] ?? []).filter((x) => x === HOME).length;
          const place = s.placements.indexOf(c);
          const on = !s.finished && s.turn === c;
          return (
            <li
              key={c}
              className={clsx("glass relative flex items-center gap-2 rounded-2xl p-2 transition-shadow", on && "ring-2", on && COLOR_STYLE[c].ring)}
              aria-current={on ? "true" : undefined}
            >
              <span className="relative shrink-0">
                {on && deadline !== null && <CountdownRing deadline={deadline} color={COLOR_HEX[c]} short={away.has(c)} />}
                <AvatarBadge avatar={p?.avatar ?? "❔"} color={p?.color ?? "slate"} size="sm" />
                <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-bg" style={{ background: COLOR_HEX[c] }} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{nameOf(c)}</span>
                <span className="block text-xs text-muted">
                  {place >= 0 ? ["🥇 1st", "🥈 2nd", "🥉 3rd", "4th"][place] : (s.forfeited ?? []).includes(c) ? "Left" : `🏠 ${home}/4`}
                </span>
                {away.has(c) && !s.finished && <span className="block text-[11px] font-semibold text-warn">Away · auto-play</span>}
                {!away.has(c) && offlineFor(game.seats[c]) !== null && !(s.forfeited ?? []).includes(c) && (
                  <span className="block text-[11px] font-semibold text-warn">{offlineFor(game.seats[c])! >= 30 ? "Disconnected" : "Offline…"}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex min-h-12 flex-col items-center justify-center text-center" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={status}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-full px-4 py-1.5 font-display text-lg font-semibold"
            style={{ background: `${COLOR_HEX[s.turn]}26` }}
          >
            {status}
          </motion.p>
        </AnimatePresence>
        <p className="mt-1 min-h-5 text-sm text-muted">{describeEvents(game.last_events, nameOf)}</p>
      </div>

      {iAmAway && !s.finished && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-3">
          <p className="min-w-0 flex-1 text-sm">You missed 3 turns, so your turns are being played automatically.</p>
          <Button onClick={onResume} className="shrink-0 !px-3 text-sm">
            I&apos;m back
          </Button>
        </div>
      )}

      <LudoBoard state={s} turnColor={s.finished ? null : s.turn} movableColor={movable.length ? myColor : null} movable={movable} onMove={onMove} names={names} />

      <div className="flex items-center gap-3">
        <Dice
          value={game.last_roll}
          rolling={pending === "roll"}
          canRoll={myTurn && s.phase === "roll"}
          onRoll={onRoll}
          color={COLOR_HEX[s.turn]}
        />
        <div className="min-w-0 flex-1">
          {movable.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label="Tokens you can move">
              {movable.map((i) => {
                const from = s.tokens[s.turn]![i];
                const to = from === -1 ? 0 : from + (s.dice ?? 0);
                return (
                  <li key={i}>
                    <Button variant="secondary" className="w-full !justify-start !px-3 text-sm" disabled={pending !== null} onClick={() => onMove(i)}>
                      Move token {i + 1}: {describe(s.turn, from)} → {describe(s.turn, to)}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{myTurn ? "Tap the dice to roll." : "Waiting for the other players…"}</p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {ERROR_COPY[error].body}
        </p>
      )}
    </div>
  );
}

/** One line about the last action, e.g. "Durgesh rolled 5 and captured your token! 💥". */
function describeEvents(events: LudoEvent[], nameOf: (c: Color) => string): string {
  const roll = events.find((e) => e.type === "roll");
  const parts: string[] = [];
  if (roll) parts.push(`${nameOf(roll.color)} rolled ${roll.dice}`);
  for (const e of events) {
    if (e.type === "three_sixes") parts.push("three 6s — turn lost");
    if (e.type === "no_moves") parts.push("no moves");
    if (e.type === "move") {
      if (!roll) parts.push(`${nameOf(e.color)} moved`);
      if (e.captured.length) parts.push(`captured ${e.captured.map((c) => `${nameOf(c.color) === "You" ? "your" : `${nameOf(c.color)}'s`} token`).join(" and ")}! 💥`);
      if (e.to === HOME) parts.push("a token reached home 🏠");
      if (e.done) parts.push(`${nameOf(e.color)} finished! 🎉`);
    }
  }
  return parts.join(" · ");
}

/** Ring around the current player's avatar that drains as their time runs out (red near the end). */
function CountdownRing({ deadline, color, short }: { deadline: number; color: string; short: boolean }) {
  const total = short ? 1.5 : 20;
  const [left, setLeft] = useState(() => Math.max(0, (deadline - Date.now()) / 1000));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, (deadline - Date.now()) / 1000)), 200);
    return () => clearInterval(t);
  }, [deadline]);
  const r = 22;
  const circ = 2 * Math.PI * r;
  const frac = Math.min(1, left / total);
  return (
    <svg className="pointer-events-none absolute -inset-[7px] -rotate-90" width="50" height="50" viewBox="0 0 50 50" aria-label={`${Math.ceil(left)} seconds left`} role="img">
      <circle cx="25" cy="25" r={r} fill="none" strokeWidth="3" className="stroke-fg/10" />
      <circle
        cx="25"
        cy="25"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        stroke={left <= 5 && !short ? "rgb(var(--danger))" : color}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - frac)}
        className="transition-[stroke-dashoffset] duration-200 ease-linear"
      />
    </svg>
  );
}

/** Seconds each player has been offline (null = connected). Uses room presence; me is always online. */
function useOfflineSince(ids: string[], present: Set<string> | null, me: string) {
  const since = useRef(new Map<string, number>());
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const now = Date.now();
  for (const id of ids) {
    if (id === me || !present || present.has(id)) since.current.delete(id);
    else if (!since.current.has(id)) since.current.set(id, now);
  }
  return (id: string | undefined) => {
    const t = id ? since.current.get(id) : undefined;
    return t === undefined ? null : Math.floor((now - t) / 1000);
  };
}
