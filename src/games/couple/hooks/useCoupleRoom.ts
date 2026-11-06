"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionState, Reaction } from "@/hooks/useGameRoom";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { createRateLimiter, isReaction, type ReactionEmoji } from "@/lib/reactions";
import { getSupabase } from "@/lib/supabase/client";
import type { Player, Room } from "@/types/db";

const REACTION_TTL_MS = 2400;
let reactionSeq = 0;

interface Options {
  /** Attach extra realtime listeners (e.g. Couple sessions) to the room channel before it subscribes. */
  configure?: (ch: RealtimeChannel, roomId: string) => void;
  /** Reload extra state after the initial load, a reconnect, or returning to the tab. */
  onResync?: (roomId: string) => void;
}

/**
 * Couple Challenge room connection: join/restore, live room updates, presence, reconnects and
 * emoji reactions. Deliberately a copy of the proven pattern in useGameRoom (not a refactor of it),
 * so Tic-Tac-Toe is untouched.
 */
export function useCoupleRoom(code: string, me: string | null, options: Options = {}) {
  const sb = getSupabase();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [error, setError] = useState<ErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [presentIds, setPresentIds] = useState<Set<string> | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const roomRef = useRef<Room | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const allowReaction = useRef(createRateLimiter());
  const optsRef = useRef(options);
  optsRef.current = options;

  const showReaction = useCallback((from: string, emoji: ReactionEmoji) => {
    const r = { id: `${Date.now()}-${++reactionSeq}`, from, emoji };
    setReactions((cur) => [...cur.slice(-11), r]);
    setTimeout(() => setReactions((cur) => cur.filter((x) => x.id !== r.id)), REACTION_TTL_MS);
  }, []);

  const loadPlayers = useCallback(
    async (r: Room) => {
      const ids = [r.player_x, r.player_o].filter((id): id is string => !!id);
      const { data } = await sb.from("players").select("*").in("id", ids);
      if (data) setPlayers(Object.fromEntries((data as Player[]).map((p) => [p.id, p])));
    },
    [sb],
  );

  /** join_room is idempotent for members, so this doubles as "restore after refresh". */
  const refresh = useCallback(async (): Promise<Room | null> => {
    const { data, error } = await sb.rpc("join_room", { p_code: code });
    if (error || !data) {
      if (!roomRef.current || toErrorCode(error) !== "NETWORK") setError(toErrorCode(error));
      setLoading(false);
      return null;
    }
    const r = data as Room;
    roomRef.current = r;
    setRoom(r);
    setError(null);
    await loadPlayers(r);
    optsRef.current.onResync?.(r.id);
    setLoading(false);
    return r;
  }, [sb, code, loadPlayers]);

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
        .on("presence", { event: "sync" }, () => setPresentIds(new Set(Object.keys(ch.presenceState()))))
        .on("broadcast", { event: "reaction" }, ({ payload }) => {
          const from = payload?.from;
          const cur = roomRef.current;
          if (!cur || from === me || (from !== cur.player_x && from !== cur.player_o)) return;
          if (!isReaction(payload?.emoji) || !allowReaction.current(from)) return;
          showReaction(from, payload.emoji);
        })
        // Catch up once the Postgres feed is really live, and after every reconnect.
        .on("system", {}, (m: { extension?: string; status?: string }) => {
          if (cancelled || m.extension !== "postgres_changes" || m.status !== "ok") return;
          if (subscribedOnce) void refresh();
          else optsRef.current.onResync?.(r.id);
          subscribedOnce = true;
        });
      optsRef.current.configure?.(ch, r.id);
      ch.subscribe(async (status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          await ch.track({ online_at: new Date().toISOString() });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("reconnecting");
        }
      });
    })();

    const onVisible = () => document.visibilityState === "visible" && roomRef.current && void refresh();
    const onOnline = () => roomRef.current && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      channelRef.current = null;
      if (channel) sb.removeChannel(channel);
    };
  }, [me, sb, refresh, loadPlayers, showReaction]);

  // Safety net for dropped realtime updates (delivery isn't guaranteed): while waiting for the
  // partner, re-check every few seconds so "partner joined" can't get lost.
  const waiting = room?.status === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), 5000);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  const react = useCallback(
    (emoji: ReactionEmoji) => {
      if (!me || !channelRef.current) return;
      showReaction(me, emoji);
      void channelRef.current.send({ type: "broadcast", event: "reaction", payload: { from: me, emoji } });
    },
    [me, showReaction],
  );

  const leave = useCallback(async () => {
    if (room) await sb.rpc("leave_room", { p_room_id: room.id });
  }, [room, sb]);

  const opponentId = !room || !me ? null : room.player_x === me ? room.player_o : room.player_x;

  return { loading, error, room, players, me, opponentId, presentIds, connection, reactions, react, leave };
}
