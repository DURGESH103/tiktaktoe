"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { uuid4, validateMessage } from "@/lib/chat";
import { errorDetail, toErrorCode, type ErrorCode } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import type { RoomMessage } from "@/types/db";

export type ChatStatus = "sending" | "sent" | "failed";

export interface ChatMessage {
  /** client_id: stable from the moment I hit send, so the optimistic bubble is replaced in place. */
  key: string;
  sender_id: string;
  body: string;
  created_at: string;
  status: ChatStatus;
  error?: ErrorCode;
  /** Short Supabase error text (code · message), shown under the bubble in dev mode. */
  errorDetail?: string;
}

const HISTORY_LIMIT = 100;
const TYPING_SEND_EVERY_MS = 2000;
const TYPING_SHOW_FOR_MS = 3500;

const fromRow = (m: RoomMessage): ChatMessage => ({
  key: m.client_id,
  sender_id: m.sender_id,
  body: m.body,
  // Normalised so server rows and optimistic bubbles sort and compare consistently.
  created_at: new Date(m.created_at).toISOString(),
  status: "sent",
});

/**
 * Saved chat for a room: loads history, receives new messages live (Postgres changes),
 * sends through the send_message RPC, and shares "typing…" over Broadcast.
 */
export function useRoomChat(
  roomId: string | null,
  me: string | null,
  opponentId: string | null,
  /** Called only for messages that arrive live (not history loads), e.g. to play a sound. */
  onLiveMessage?: (m: ChatMessage) => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [opponentTyping, setOpponentTyping] = useState(false);
  /** Set when history can't be loaded (e.g. NOT_SET_UP: the chat migration hasn't been run). */
  const [loadError, setLoadError] = useState<{ code: ErrorCode; detail: string } | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const opponentRef = useRef(opponentId);
  opponentRef.current = opponentId;
  const onLiveRef = useRef(onLiveMessage);
  onLiveRef.current = onLiveMessage;

  /** Inserts or replaces by client_id and keeps time order. Local sending/failed bubbles are never lost. */
  const upsert = useCallback((incoming: ChatMessage[]) => {
    setMessages((cur) => {
      const byKey = new Map(cur.map((m) => [m.key, m]));
      for (const m of incoming) byKey.set(m.key, m);
      return [...byKey.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const load = useCallback(async () => {
    if (!roomId) return;
    const { data, error } = await getSupabase()
      .from("room_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) {
      // console.warn, not error: in dev, Next shows every console.error as an on-screen "Issue" toast over the chat input.
      console.warn("[chat] loading room_messages failed:", error);
      setLoadError({ code: toErrorCode(error), detail: errorDetail(error) });
      return;
    }
    setLoadError(null);
    upsert((data as RoomMessage[]).map(fromRow));
  }, [roomId, upsert]);

  useEffect(() => {
    if (!roomId || !me) return;
    const sb = getSupabase();
    let cancelled = false;
    void load();

    const ch = sb
      .channel(`chat:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` }, (p) => {
        const m = fromRow(p.new as RoomMessage);
        upsert([m]);
        if (m.sender_id !== me) onLiveRef.current?.(m);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.from !== opponentRef.current) return;
        setOpponentTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setOpponentTyping(false), TYPING_SHOW_FOR_MS);
      })
      // Catch up once the Postgres feed is really live (and after any reconnect).
      .on("system", {}, (m: { extension?: string; status?: string }) => {
        if (!cancelled && m.extension === "postgres_changes" && m.status === "ok") void load();
      })
      .subscribe();
    channelRef.current = ch;

    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);

    return () => {
      cancelled = true;
      clearTimeout(typingTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
      channelRef.current = null;
      sb.removeChannel(ch);
    };
  }, [roomId, me, load, upsert]);

  // A new message from them means they've stopped typing.
  const lastFromOpponent = messages.findLast((m) => m.sender_id === opponentId)?.key;
  useEffect(() => {
    setOpponentTyping(false);
  }, [lastFromOpponent]);

  const deliver = useCallback(
    async (msg: ChatMessage) => {
      if (!roomId) return;
      const { data, error } = await getSupabase().rpc("send_message", {
        p_room_id: roomId,
        p_body: msg.body,
        p_client_id: msg.key,
      });
      if (error || !data) {
        // Log the full Supabase error (code, message, details, hint) so failures are diagnosable.
        console.warn("[chat] send_message failed:", error ?? "empty response");
        upsert([{ ...msg, status: "failed", error: toErrorCode(error), errorDetail: errorDetail(error) }]);
      } else upsert([fromRow(data as RoomMessage)]);
    },
    [roomId, upsert],
  );

  /** Validates, shows the bubble immediately as "sending", then confirms with the server. */
  const send = useCallback(
    (text: string): ErrorCode | null => {
      if (!me) return "NOT_AUTHENTICATED";
      const check = validateMessage(text);
      if (!check.ok) return check.reason === "empty" ? "MESSAGE_EMPTY" : "MESSAGE_TOO_LONG";
      const msg: ChatMessage = {
        key: uuid4(),
        sender_id: me,
        body: check.body,
        created_at: new Date().toISOString(),
        status: "sending",
      };
      upsert([msg]);
      lastTypingSent.current = 0;
      void deliver(msg);
      return null;
    },
    [me, upsert, deliver],
  );

  /** Re-sends a failed message with the same client_id, so it can never be stored twice. */
  const retry = useCallback(
    (key: string) => {
      const msg = messages.find((m) => m.key === key);
      if (!msg || msg.status !== "failed") return;
      const again = { ...msg, status: "sending" as const, error: undefined, errorDetail: undefined };
      upsert([again]);
      void deliver(again);
    },
    [messages, upsert, deliver],
  );

  /** Call on every keystroke; actually broadcasts at most every 2 s. */
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (!me || !channelRef.current || now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current = now;
    void channelRef.current.send({ type: "broadcast", event: "typing", payload: { from: me } });
  }, [me]);

  return { messages, send, retry, sendTyping, opponentTyping, loadError };
}
