"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/components/providers/SettingsProvider";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { ERROR_COPY, type ErrorCode } from "@/lib/errors";
import type { Player } from "@/types/db";
import { HOME, legalMoves, type Color, type LudoEvent } from "../engine";
import { COLOR_HEX } from "../lib/board";
import { HOP_S, KNOCK_S } from "../lib/motion";
import { COLOR_STYLE } from "../lib/seats";
import type { LudoGameRow } from "../types";
import { Dice, MiniDie, ROLL_MS } from "./Dice";
import { describe, LudoBoard } from "./LudoBoard";

/** Player panels sit next to their own yard: red top-left, green top-right, blue bottom-left, yellow bottom-right. */
const TOP_ROW: Color[] = ["red", "green"];
const BOTTOM_ROW: Color[] = ["blue", "yellow"];
const PLACE = ["1st", "2nd", "3rd", "4th"];
/** Pause between the dice landing and an automatic (only possible) move. */
const AUTO_MOVE_PAUSE = 0.25;

/**
 * A Ludo game in progress: the board, with a panel for each player next to their yard (avatar, turn
 * timer, their own dice). Tap your dice to roll, then tap a bouncing token.
 */
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
  compactHeight = null,
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
  /** Height available while the chat sheet is open on a phone: just the board and the dice that matter. */
  compactHeight?: number | null;
}) {
  const offlineFor = useOfflineSince(Object.values(game.seats).filter((id): id is string => !!id), presentIds, me);
  const s = game.state;
  const myColor = (Object.entries(game.seats).find(([, id]) => id === me)?.[0] ?? null) as Color | null;
  const nameOf = (c: Color) => (game.seats[c] === me ? "You" : (players[game.seats[c] ?? ""]?.name ?? COLOR_STYLE[c].label));
  const names = Object.fromEntries(s.colors.map((c) => [c, nameOf(c)])) as Record<Color, string>;
  const myTurn = !s.finished && s.turn === myColor;
  const canRoll = myTurn && s.phase === "roll";
  const movable = myTurn && s.phase === "move" && s.dice ? legalMoves(s, s.turn, s.dice) : [];

  // Each player's latest roll (for their own dice). A token moved in the same update as the roll
  // (the server plays the only possible move itself) waits for the dice to land first.
  const rolls = useRolls(game);
  const hasRoll = game.last_events.some((e) => e.type === "roll");
  const moveDelay = hasRoll && game.last_events.some((e) => e.type === "move") ? ROLL_MS / 1000 + AUTO_MOVE_PAUSE : 0;
  const { toast, noMoves } = useGameEffects(game, myColor, moveDelay, nameOf);
  const compact = compactHeight != null;

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

  const panel = (c: Color, side: "left" | "right") => {
    const p = players[game.seats[c] ?? ""];
    const place = s.placements.indexOf(c);
    const left = (s.forfeited ?? []).includes(c);
    const off = offlineFor(game.seats[c]);
    const on = !s.finished && s.turn === c;
    const mine = c === myColor;
    const note =
      place >= 0 && !left ? (
        <span className="font-semibold text-fg">🏆 {PLACE[place]}</span>
      ) : left ? (
        "Left"
      ) : away.has(c) && !s.finished ? (
        <span className="rounded-full bg-amber-500/15 px-1.5 font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-200">Away · auto-play</span>
      ) : off !== null ? (
        <span className="rounded-full bg-amber-500/15 px-1.5 font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-200">{off >= 30 ? "Disconnected" : "Offline…"}</span>
      ) : noMoves === c ? (
        <span className="font-semibold">No moves</span>
      ) : on && s.sixes > 0 ? (
        <span className="flex items-center gap-0.5" aria-label={`${s.sixes} six${s.sixes > 1 ? "es" : ""} in a row`}>
          {Array.from({ length: s.sixes }, (_, i) => (
            <MiniDie key={i} value={6} warn={s.sixes >= 2} />
          ))}
        </span>
      ) : mine && canRoll ? (
        <span className="font-semibold">Tap to roll</span>
      ) : (
        `🏠 ${(s.tokens[c] ?? []).filter((x) => x === HOME).length}/4`
      );
    return (
      <div
        key={c}
        data-panel={c}
        className={clsx(
          "glass flex min-w-0 items-center gap-1.5 rounded-2xl px-1.5 py-1 transition-shadow",
          side === "right" && "flex-row-reverse text-right",
          left && "opacity-50",
        )}
        style={on ? { boxShadow: `0 0 0 2px ${COLOR_HEX[c]}, 0 0 18px ${COLOR_HEX[c]}66` } : undefined}
        aria-current={on ? "true" : undefined}
      >
        {/* Player colour = ring around the avatar; the small dot is online status (green online, grey away/offline). */}
        <span className="relative ml-0.5 shrink-0">
          {on && deadline !== null && <CountdownRing deadline={deadline} color={COLOR_HEX[c]} short={away.has(c)} />}
          <span className="block rounded-full" style={{ boxShadow: `0 0 0 2.5px ${COLOR_HEX[c]}` }}>
            <AvatarBadge avatar={p?.avatar ?? "❔"} color={p?.color ?? "slate"} size="sm" />
          </span>
          {!left && (
            <span
              role="img"
              aria-label={away.has(c) || off !== null ? "Away" : "Online"}
              className={clsx("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-bg", away.has(c) || off !== null ? "bg-slate-400" : "bg-emerald-500")}
            />
          )}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold">{nameOf(c)}</span>
          <span className={clsx("flex min-h-4 items-center whitespace-nowrap text-[11px] text-muted", side === "right" && "justify-end")}>{note}</span>
        </span>
        <span className="relative shrink-0">
          {mine && canRoll && pending !== "roll" && <TapHint />}
          <Dice
          value={rolls[c]?.value ?? null}
          rollKey={rolls[c]?.key ?? null}
          rolling={mine && pending === "roll"}
          canRoll={mine && canRoll}
          onRoll={mine ? onRoll : undefined}
          active={on}
          size={mine ? 34 : 30}
          label={`${nameOf(c)}'s dice`}
          color={COLOR_HEX[c]}
          owner={c}
          />
        </span>
      </div>
    );
  };
  // Always two rows (an empty seat keeps its space as a faint placeholder), so the board stays centred.
  const row = (colors: Color[], label: string) => (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={label}>
      {colors.map((c, i) =>
        s.colors.includes(c) ? (
          panel(c, i === 0 ? "left" : "right")
        ) : (
          <div key={c} className="grid min-h-[2.75rem] place-items-center text-xs text-fg/25">Empty seat</div>
        ),
      )}
    </div>
  );
  const pill = toast?.text ?? (s.finished ? "Game over" : myTurn ? (s.phase === "roll" ? "Your turn — tap your dice!" : "Tap a glowing token") : `${nameOf(s.turn)}'s turn`);
  // Chat open on a phone: only your panel and the current player's, under the board.
  const compactRow = [...new Set([myColor, s.finished ? null : s.turn].filter((c): c is Color => !!c))];

  return (
    <div className="-mx-3 flex flex-col gap-1.5">
      {!compact && row(TOP_ROW, "Top players")}

      {/* Turn label (briefly "Roll again!", "No moves", … when they happen). */}
      <div className="flex h-6 justify-center" aria-hidden>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={pill}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={myTurn && !toast ? { opacity: 1, y: 0, scale: [1, 1.06, 1] } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={myTurn && !toast ? { scale: { duration: 1.2, repeat: Infinity }, default: { duration: 0.2 } } : { duration: 0.2 }}
            className={clsx(
              "rounded-full px-3 py-0.5 text-[13px] font-semibold shadow-sm",
              toast ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-white",
            )}
            style={toast ? undefined : { background: COLOR_HEX[s.turn], color: s.turn === "yellow" ? "#1f2937" : "#fff" }}
          >
            {pill}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="relative mx-auto w-full" style={{ maxWidth: compact ? Math.max(180, compactHeight - 80) : "max(240px, calc(100dvh - 300px))" }}>
        <LudoBoard
          key={game.id}
          state={s}
          turnColor={s.finished ? null : s.turn}
          movableColor={movable.length ? myColor : null}
          movable={movable}
          onMove={onMove}
          names={names}
          delay={moveDelay}
        />
        {iAmAway && !s.finished && (
          <div role="alert" className="absolute inset-x-2 top-2 z-10 flex items-center gap-3 rounded-2xl border border-warn/40 bg-bg/95 p-2.5 shadow-lg">
            <p className="min-w-0 flex-1 text-sm">You missed 3 turns, so your turns are being played automatically.</p>
            <Button onClick={onResume} className="shrink-0 !px-3 text-sm">
              I&apos;m back
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="absolute inset-x-4 bottom-2 z-10 rounded-xl bg-bg/95 px-3 py-1.5 text-center text-sm text-danger shadow">
            {ERROR_COPY[error].body}
          </p>
        )}
      </div>

      {compact ? (
        <div className="grid grid-cols-2 gap-2">{compactRow.map((c) => panel(c, "left"))}</div>
      ) : (
        row(BOTTOM_ROW, "Bottom players")
      )}

      {/* For screen readers (and keyboards): what's happening, and the moves as buttons. */}
      <div className="sr-only" aria-live="polite">
        <p>{status}</p>
        <p>{describeEvents(game.last_events, nameOf)}</p>
      </div>
      {movable.length > 0 && (
        <ul className="sr-only" aria-label="Tokens you can move">
          {movable.map((i) => {
            const from = s.tokens[s.turn]![i];
            const to = from === -1 ? 0 : from + (s.dice ?? 0);
            return (
              <li key={i}>
                <button type="button" disabled={pending !== null} onClick={() => onMove(i)} className="focus:not-sr-only">
                  Move token {i + 1}: {describe(s.turn, from)} → {describe(s.turn, to)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A small arrow bobbing above your dice when it's time to roll. */
function TapHint() {
  return (
    <motion.svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 16 16"
      className="pointer-events-none absolute -top-4 left-1/2 z-10 -ml-[9px] text-fg drop-shadow"
      animate={{ y: [0, 4, 0] }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <path d="M6.5 1h3v7H13l-5 6-5-6h3.5z" fill="currentColor" stroke="rgb(var(--bg))" strokeWidth="1" />
    </motion.svg>
  );
}

/** Each colour's latest roll as { key, value }; `key` changes on every new roll (drives that dice's tumble). */
function useRolls(game: LudoGameRow) {
  const init = () => {
    const r: Partial<Record<Color, { key: number; value: number }>> = {};
    const e = game.last_events.find((x) => x.type === "roll");
    if (e?.type === "roll") r[e.color] = { key: game.seq, value: e.dice };
    return { seq: game.seq, rolls: r };
  };
  const [st, setSt] = useState(init);
  if (game.seq !== st.seq) {
    const e = game.last_events.find((x) => x.type === "roll");
    setSt({ seq: game.seq, rolls: e?.type === "roll" ? { ...st.rolls, [e.color]: { key: game.seq, value: e.dice } } : st.rolls });
  }
  return st.rolls;
}

/**
 * Sounds, vibration and little messages for what just happened, timed to the animation: the dice
 * rattle, a tick per square hopped, "Kill!" as the capturer lands, a chime when a token gets home,
 * "Roll again!" / "Three 6s — turn lost" toasts, "No moves" in the player's panel, and a ping when it
 * becomes your turn. Vibrates only for things that concern you.
 */
function useGameEffects(game: LudoGameRow, myColor: Color | null, moveDelay: number, nameOf: (c: Color) => string) {
  const { feedback } = useSettings();
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [noMoves, setNoMoves] = useState<Color | null>(null);
  const lastSeq = useRef(game.seq);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const s = game.state;
  useEffect(() => {
    if (game.seq <= lastSeq.current) return;
    lastSeq.current = game.seq;
    const later = (sec: number, fn: () => void) => timers.current.push(setTimeout(fn, sec * 1000));
    const show = (sec: number, text: string) =>
      later(sec, () => {
        const id = Date.now();
        setToast({ id, text });
        later(1.2, () => setToast((t) => (t?.id === id ? null : t)));
      });
    const landedDice = ROLL_MS / 1000;
    let landed = 0;
    for (const e of game.last_events) {
      if (e.type === "roll") feedback("dice", e.color === myColor ? "dice" : null);
      if (e.type === "three_sixes") show(landedDice, "Three 6s — turn lost");
      if (e.type === "no_moves") {
        later(landedDice, () => setNoMoves(e.color));
        show(landedDice, e.color === myColor ? "No moves" : `${nameRef.current(e.color)}: no moves`);
        later(landedDice + 1.6, () => setNoMoves((c) => (c === e.color ? null : c)));
      }
      if (e.type !== "move") continue;
      const steps = e.from === -1 ? 1 : e.to - e.from;
      const mine = e.color === myColor;
      for (let k = 1; k <= steps; k++) later(moveDelay + k * HOP_S, () => feedback("hop", mine ? "hop" : null));
      landed = moveDelay + steps * HOP_S;
      if (e.captured.length) {
        const involved = mine || e.captured.some((c) => c.color === myColor);
        later(landed, () => feedback("capture", involved ? "capture" : null));
      }
      if (e.to === HOME) later(landed, () => feedback("home", mine ? "home" : null));
      if (e.extra && !e.done && !game.state.finished) show(landed + (e.captured.length ? KNOCK_S : 0), mine ? "Roll again!" : `${nameRef.current(e.color)} rolls again!`);
    }
    if (!s.finished && s.turn === myColor && s.phase === "roll" && game.last_events.every((e) => e.type !== "roll" || e.color !== myColor)) {
      later(landed + 0.1, () => feedback("turn", "turn"));
    }
  }, [game.seq, game.last_events, game.state.finished, s.finished, s.turn, s.phase, myColor, moveDelay, feedback]);
  return { toast, noMoves };
}

/** One line about the last action, e.g. "Durgesh rolled 5 · captured your token! 💥" (screen readers). */
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

/** Ring around the current player's avatar that drains as their time runs out (red in the last 5 s). */
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
