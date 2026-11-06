"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
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
  busy,
  error,
  onRoll,
  onMove,
}: {
  game: LudoGameRow;
  me: string;
  players: Record<string, Player>;
  busy: boolean;
  error: ErrorCode | null;
  onRoll: () => void;
  onMove: (token: number) => void;
}) {
  const s = game.state;
  const myColor = (Object.entries(game.seats).find(([, id]) => id === me)?.[0] ?? null) as Color | null;
  const nameOf = (c: Color) => (game.seats[c] === me ? "You" : (players[game.seats[c] ?? ""]?.name ?? COLOR_STYLE[c].label));
  const names = Object.fromEntries(s.colors.map((c) => [c, nameOf(c)])) as Record<Color, string>;
  const myTurn = !s.finished && s.turn === myColor;
  const movable = myTurn && s.phase === "move" && s.dice ? legalMoves(s, s.turn, s.dice) : [];

  const status = s.finished
    ? "Game over"
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
                <AvatarBadge avatar={p?.avatar ?? "❔"} color={p?.color ?? "slate"} size="sm" />
                <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-bg" style={{ background: COLOR_HEX[c] }} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{nameOf(c)}</span>
                <span className="block text-xs text-muted">
                  {place >= 0 ? ["🥇 1st", "🥈 2nd", "🥉 3rd", "4th"][place] : `🏠 ${home}/4`}
                </span>
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

      <LudoBoard state={s} turnColor={s.finished ? null : s.turn} movableColor={movable.length ? myColor : null} movable={movable} onMove={onMove} names={names} />

      <div className="flex items-center gap-3">
        <Dice
          value={game.last_roll}
          rolling={busy && myTurn && s.phase === "roll"}
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
                    <Button variant="secondary" className="w-full !justify-start !px-3 text-sm" disabled={busy} onClick={() => onMove(i)}>
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
