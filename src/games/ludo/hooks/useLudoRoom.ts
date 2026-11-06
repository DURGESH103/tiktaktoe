"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionState, Reaction } from "@/hooks/useGameRoom";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { createRateLimiter, isReaction, type ReactionEmoji } from "@/lib/reactions";
import { getSupabase } from "@/lib/supabase/client";
import type { Player, Room } from "@/types/db";
import type { LudoSeat, LudoSettings } from "../types";

const REACTION_TTL_MS = 2400;

/** State updater that keeps the current value when the new one is identical (by content). */
const keep =
  <T,>(next: T) =>
  (cur: T): T =>
    JSON.stringify(cur) === JSON.stringify(next) ? cur : next;
let reactionSeq = 0;

/**
 * Ludo room connection: join/restore, seats and table settings, presence for everyone at the
 * table, reconnects and emoji reactions. A copy of the proven useCoupleRoom pattern (not a
 * refactor of the shared hooks), extended from 2 players to room_players.
 */
export function useLudoRoom(code: string, me: string | null) {
  const sb = getSupabase();
  const [room, setRoom] = useState<Room | null>(null);
  const [settings, setSettings] = useState<LudoSettings | null>(null);
  const [seats, setSeats] = useState<LudoSeat[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [error, setError] = useState<ErrorCode | null>(null);
  const [actionError, setActionError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [presentIds, setPresentIds] = useState<Set<string> | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const roomRef = useRef<Room | null>(null);
  const seatsRef = useRef<LudoSeat[]>([]);
  seatsRef.current = seats;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const allowReaction = useRef(createRateLimiter());
  const loadSeq = useRef(0);

  const showReaction = useCallback((from: string, emoji: ReactionEmoji) => {
    const r = { id: `${Date.now()}-${++reactionSeq}`, from, emoji };
    setReactions((cur) => [...cur.slice(-11), r]);
    setTimeout(() => setReactions((cur) => cur.filter((x) => x.id !== r.id)), REACTION_TTL_MS);
  }, []);

  /** Seats + settings + everyone's profile, applied together (newest load wins). */
  const loadTable = useCallback(
    async (roomId: string) => {
      const seq = ++loadSeq.current;
      const [rs, ls] = await Promise.all([
        sb.from("room_players").select("*").eq("room_id", roomId).order("seat"),
        sb.from("ludo_rooms").select("*").eq("room_id", roomId).maybeSingle(),
      ]);
      const list = (rs.data as LudoSeat[] | null) ?? [];
      const ids = list.map((s) => s.player_id);
      const ps = ids.length ? await sb.from("players").select("*").in("id", ids) : { data: [] };
      if (seq !== loadSeq.current) return;
      // keep(): an unchanged re-sync leaves state as-is, so nothing re-renders (no flicker).
      setSeats(keep(list));
      setSettings(keep((ls.data as LudoSettings | null) ?? null));
      if (ps.data) setPlayers(keep(Object.fromEntries((ps.data as Player[]).map((p) => [p.id, p]))));
    },
    [sb],
  );

  /** join_room is idempotent for seated players, so this doubles as "restore after refresh". */
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
    if (r.game_type === "ludo") await loadTable(r.id);
    setLoading(false);
    return r;
  }, [sb, code, loadTable]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let subscribedOnce = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const r = await refresh();
      if (!r || cancelled || r.game_type !== "ludo") return;
      const reloadSoon = () => {
        clearTimeout(timer);
        timer = setTimeout(() => void loadTable(r.id), 120);
      };

      const ch = sb.channel(`room:${r.id}`, { config: { presence: { key: me } } });
      channel = ch;
      channelRef.current = ch;
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${r.id}` }, (p) => {
        roomRef.current = p.new as Room;
        setRoom(p.new as Room);
      })
        .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${r.id}` }, reloadSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "ludo_rooms", filter: `room_id=eq.${r.id}` }, reloadSoon)
        .on("presence", { event: "sync" }, () => setPresentIds(new Set(Object.keys(ch.presenceState()))))
        // Reactions: only from someone seated at this table, only the fixed emoji set, rate-limited.
        .on("broadcast", { event: "reaction" }, ({ payload }) => {
          const from = payload?.from;
          if (!from || from === me || !seatsRef.current.some((s) => s.player_id === from && !s.left_at)) return;
          if (!isReaction(payload?.emoji) || !allowReaction.current(from)) return;
          showReaction(from, payload.emoji);
        })
        .on("system", {}, (m: { extension?: string; status?: string }) => {
          if (cancelled || m.extension !== "postgres_changes" || m.status !== "ok") return;
          if (subscribedOnce) void refresh();
          else void loadTable(r.id);
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

    const onVisible = () => document.visibilityState === "visible" && roomRef.current && void refresh();
    const onOnline = () => roomRef.current && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      channelRef.current = null;
      if (channel) void sb.removeChannel(channel);
    };
  }, [me, sb, refresh, loadTable, showReaction]);

  // Safety net for dropped realtime updates (delivery isn't guaranteed): re-read the room and seats
  // every few seconds while the room is active and the tab visible. Not join_room — that could
  // re-seat someone who just left.
  const roomId = room?.id;
  useVisibleInterval(
    async () => {
      if (!roomId) return;
      const { data } = await sb.from("rooms").select("*").eq("id", roomId).maybeSingle();
      if (data) {
        roomRef.current = data as Room;
        setRoom(keep<Room | null>(data as Room));
      }
      await loadTable(roomId);
    },
    5000,
    !!room && room.game_type === "ludo" && (room.status === "waiting" || room.status === "playing"),
  );

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      setBusy(true);
      setActionError(null);
      const { error } = await sb.rpc(fn, args);
      setBusy(false);
      if (error) {
        console.warn(`[ludo] ${fn} failed:`, error);
        setActionError(toErrorCode(error));
        return false;
      }
      if (roomRef.current) await loadTable(roomRef.current.id);
      return true;
    },
    [sb, loadTable],
  );

  const setReady = useCallback((ready: boolean) => room && call("set_ludo_ready", { p_room_id: room.id, p_ready: ready }), [call, room]);
  const setOptions = useCallback(
    (maxPlayers: number, mode: string) => room && call("set_ludo_options", { p_room_id: room.id, p_max_players: maxPlayers, p_mode: mode }),
    [call, room],
  );
  const leave = useCallback(async () => {
    if (room) await sb.rpc("leave_room", { p_room_id: room.id });
  }, [room, sb]);

  const react = useCallback(
    (emoji: ReactionEmoji) => {
      if (!me || !channelRef.current) return;
      showReaction(me, emoji);
      void channelRef.current.send({ type: "broadcast", event: "reaction", payload: { from: me, emoji } });
    },
    [me, showReaction],
  );

  const isHost = !!room && room.player_x === me;
  return { loading, error, actionError, busy, room, settings, seats, players, me, isHost, presentIds, connection, reactions, react, setReady, setOptions, leave };
}
