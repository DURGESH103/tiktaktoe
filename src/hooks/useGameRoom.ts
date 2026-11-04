"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { other } from "@/lib/game/logic";
import { seriesScore, type RoundResult } from "@/lib/game/series";
import { createRateLimiter, isReaction, type ReactionEmoji } from "@/lib/reactions";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import type { Game, Mark, Player, Room } from "@/types/db";

interface PendingMove {
  gameId: string;
  cell: number;
  mark: Mark;
}

/**
 * Only accept a game snapshot that is at least as new as what we have.
 * Realtime events, RPC responses and refetches can arrive in any order.
 */
function isNewer(next: Game, cur: Game | null): boolean {
  if (!cur) return true;
  if (next.id !== cur.id) return next.round > cur.round;
  if (next.moves.length !== cur.moves.length) return next.moves.length > cur.moves.length;
  // Same move count: only allow leaving "playing" (e.g. abandoned), never going back to it.
  return !(cur.status !== "playing" && next.status === "playing");
}

export type ConnectionState = "connecting" | "live" | "reconnecting";

export interface Reaction {
  id: string;
  from: string;
  emoji: ReactionEmoji;
}

/** How long a reaction stays on screen. */
const REACTION_TTL_MS = 2400;
let reactionSeq = 0;

export function useGameRoom(code: string, me: string | null) {
  const sb = getSupabase();
  const [room, setRoom] = useState<Room | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [error, setError] = useState<ErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [rejected, setRejected] = useState<{ cell: number; code: ErrorCode } | null>(null);
  const [presentIds, setPresentIds] = useState<Set<string> | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const roomRef = useRef<Room | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const allowReaction = useRef(createRateLimiter());

  const [results, setResults] = useState<Record<string, RoundResult>>({});

  const showReaction = useCallback((from: string, emoji: ReactionEmoji) => {
    const r = { id: `${Date.now()}-${++reactionSeq}`, from, emoji }; // (randomUUID needs HTTPS; LAN testing is http)
    setReactions((cur) => [...cur.slice(-11), r]); // cap what's on screen
    setTimeout(() => setReactions((cur) => cur.filter((x) => x.id !== r.id)), REACTION_TTL_MS);
  }, []);

  /** Every game snapshot goes through here: updates the series tally and (if newer) the live board. */
  const ingest = useCallback((g: Game) => {
    setResults((cur) => {
      const prev = cur[g.id];
      // A late "playing" snapshot must not undo a finished/abandoned result.
      if (prev && prev.status !== "playing" && g.status === "playing") return cur;
      return { ...cur, [g.id]: { round: g.round, status: g.status, winner: g.winner } };
    });
    setGame((cur) => (isNewer(g, cur) ? g : cur));
  }, []);

  const loadPlayers = useCallback(
    async (r: Room) => {
      const ids = [r.player_x, r.player_o].filter((id): id is string => !!id);
      const { data } = await sb.from("players").select("*").in("id", ids);
      if (data) setPlayers(Object.fromEntries((data as Player[]).map((p) => [p.id, p])));
    },
    [sb],
  );

  /** Loads every round in the room: the latest drives the board, the rest feed the series score. */
  const loadGames = useCallback(
    async (roomId: string) => {
      const { data } = await sb.from("games").select("*").eq("room_id", roomId).order("round");
      (data as Game[] | null)?.forEach(ingest);
    },
    [sb, ingest],
  );

  /** (Re)loads everything from the DB. join_room is idempotent for members, so this doubles as "restore". */
  const refresh = useCallback(async (): Promise<Room | null> => {
    const { data, error } = await sb.rpc("join_room", { p_code: code });
    if (error || !data) {
      // Keep showing the board if we already had it and this is just a blip.
      if (!roomRef.current || toErrorCode(error) !== "NETWORK") setError(toErrorCode(error));
      setLoading(false);
      return null;
    }
    const r = data as Room;
    roomRef.current = r;
    setRoom(r);
    setError(null);
    await Promise.all([loadPlayers(r), loadGames(r.id)]);
    setLoading(false);
    return r;
  }, [sb, code, loadPlayers, loadGames]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let subscribedOnce = false;

    (async () => {
      const r = await refresh();
      if (!r || cancelled) return;

      const ch = sb.channel(`room:${r.id}`, { config: { presence: { key: me } } });
      channel = ch;
      channelRef.current = ch;
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${r.id}` }, (p) => {
        const next = p.new as Room;
        const joined = next.player_o && next.player_o !== roomRef.current?.player_o;
        roomRef.current = next;
        setRoom(next);
        if (joined) loadPlayers(next);
      })
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `room_id=eq.${r.id}` }, (p) => {
          if (p.new && "id" in p.new) ingest(p.new as Game);
        })
        .on("presence", { event: "sync" }, () => setPresentIds(new Set(Object.keys(ch.presenceState()))))
        // Emoji reactions are ephemeral broadcasts (never stored). Validate everything:
        // only the opponent, only the fixed emoji set, and rate-limited.
        .on("broadcast", { event: "reaction" }, ({ payload }) => {
          const from = payload?.from;
          const cur = roomRef.current;
          if (!cur || from === me || (from !== cur.player_x && from !== cur.player_o)) return;
          if (!isReaction(payload?.emoji) || !allowReaction.current(from)) return;
          showReaction(from, payload.emoji);
        })
        // SUBSCRIBED fires ~0.5–1s before the Postgres feed is actually live; this system
        // message marks the real start. Catch up on anything that happened before it
        // (initial load, or a disconnect), otherwise a quick first move could be missed.
        .on("system", {}, (m: { extension?: string; status?: string }) => {
          if (cancelled || m.extension !== "postgres_changes" || m.status !== "ok") return;
          if (subscribedOnce) refresh();
          else loadGames(r.id);
          subscribedOnce = true;
        })
        .subscribe(async (status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setConnection("live");
            await ch.track({ online_at: new Date().toISOString() });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnection("reconnecting");
          }
        });
    })();

    // Mobile browsers freeze sockets in the background; resync when we come back.
    const onVisible = () => document.visibilityState === "visible" && roomRef.current && refresh();
    const onOnline = () => roomRef.current && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      channelRef.current = null;
      if (channel) sb.removeChannel(channel);
    };
  }, [me, sb, refresh, loadPlayers, loadGames, ingest, showReaction]);

  /** Sends a reaction to the opponent and shows it locally (broadcasts don't echo to the sender). */
  const react = useCallback(
    (emoji: ReactionEmoji) => {
      if (!me || !channelRef.current) return;
      showReaction(me, emoji);
      void channelRef.current.send({ type: "broadcast", event: "reaction", payload: { from: me, emoji } });
    },
    [me, showReaction],
  );

  const myMark: Mark | null = !room || !me ? null : room.player_x === me ? "X" : room.player_o === me ? "O" : null;
  const opponentId = !room || !me ? null : room.player_x === me ? room.player_o : room.player_x;

  // The board as the user should see it: server state plus our not-yet-confirmed move.
  const view = useMemo(() => {
    if (!game) return null;
    const optimistic = pending && pending.gameId === game.id && game.board[pending.cell] === ".";
    const board = optimistic
      ? game.board.slice(0, pending.cell) + pending.mark + game.board.slice(pending.cell + 1)
      : game.board;
    const currentTurn = optimistic ? other(pending.mark) : game.current_turn;
    return { board, currentTurn };
  }, [game, pending]);

  /** Optimistic move: draw it now, confirm via make_move, roll back if the server says no. */
  const play = useCallback(
    async (cell: number) => {
      if (!game || !myMark || pending) return;
      if (game.status !== "playing" || game.current_turn !== myMark || game.board[cell] !== ".") return;

      setPending({ gameId: game.id, cell, mark: myMark });
      setRejected(null);
      const { data, error } = await sb.rpc("make_move", { p_game_id: game.id, p_cell: cell });
      if (error || !data) {
        setPending(null);
        setRejected({ cell, code: toErrorCode(error) });
        loadGames(game.room_id);
        return;
      }
      ingest(data as Game);
      setPending(null);
    },
    [game, myMark, pending, sb, ingest, loadGames],
  );

  /** Starts the next round (server alternates who goes first). Idempotent if both players tap it. */
  const rematch = useCallback(async (): Promise<ErrorCode | null> => {
    if (!room) return "UNKNOWN";
    const { data, error } = await sb.rpc("request_rematch", { p_room_id: room.id });
    if (error || !data) return toErrorCode(error);
    ingest(data as Game);
    return null;
  }, [room, sb, ingest]);

  const score = useMemo(() => seriesScore(Object.values(results)), [results]);
  const clearRejected = useCallback(() => setRejected(null), []);

  const leave = useCallback(async () => {
    if (!room) return;
    await sb.rpc("leave_room", { p_room_id: room.id });
  }, [room, sb]);

  return {
    loading,
    error,
    room,
    game,
    view,
    players,
    me,
    myMark,
    opponentId,
    presentIds,
    connection,
    pending: !!pending,
    rejected,
    clearRejected,
    score,
    reactions,
    react,
    play,
    rematch,
    leave,
  };
}
