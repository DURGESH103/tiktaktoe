"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useMemo, useRef, useState } from "react";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import type { CoupleAnswer, CoupleQuestion, CoupleRound, CoupleSession } from "../types";

/**
 * Live state of the room's latest Couple session: rounds, questions and the answers I'm allowed
 * to see (mine, plus my partner's once a round is revealed — enforced by RLS).
 *
 * Plugs into useCoupleRoom via `configure` / `onResync`, so it shares the room's realtime channel.
 */
export function useCoupleSession(me: string | null) {
  const [session, setSession] = useState<CoupleSession | null>(null);
  const [rounds, setRounds] = useState<CoupleRound[]>([]);
  const [questions, setQuestions] = useState<Record<number, CoupleQuestion>>({});
  const [answers, setAnswers] = useState<CoupleAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Reloads the latest session with its rounds, questions and visible answers. */
  const load = useCallback(async (roomId: string) => {
    roomIdRef.current = roomId;
    const sb = getSupabase();
    const { data: s } = await sb.from("couple_sessions").select("*").eq("room_id", roomId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    setSession((s as CoupleSession | null) ?? null);
    if (!s) {
      setRounds([]);
      setAnswers([]);
      return;
    }
    const { data: rs } = await sb.from("couple_rounds").select("*").eq("session_id", s.id).order("idx");
    const list = (rs as CoupleRound[] | null) ?? [];
    setRounds(list);
    const need = list.map((r) => r.question_id).filter((id) => !questionsRef.current[id]);
    const [qs, as] = await Promise.all([
      need.length ? sb.from("couple_questions").select("*").in("id", need) : Promise.resolve({ data: [] }),
      list.length ? sb.from("couple_answers").select("*").in("round_id", list.map((r) => r.id)) : Promise.resolve({ data: [] }),
    ]);
    if (qs.data?.length) setQuestions((cur) => ({ ...cur, ...Object.fromEntries((qs.data as CoupleQuestion[]).map((q) => [q.id, q])) }));
    setAnswers((as.data as CoupleAnswer[] | null) ?? []);
  }, []);

  const reloadSoon = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => roomIdRef.current && void load(roomIdRef.current), 120);
  }, [load]);

  /** Attach session/round listeners to the room channel (called by useCoupleRoom before subscribing). */
  const configure = useCallback(
    (ch: RealtimeChannel, roomId: string) => {
      roomIdRef.current = roomId;
      ch.on("postgres_changes", { event: "*", schema: "public", table: "couple_sessions", filter: `room_id=eq.${roomId}` }, reloadSoon).on(
        "postgres_changes",
        { event: "*", schema: "public", table: "couple_rounds", filter: `room_id=eq.${roomId}` },
        reloadSoon,
      );
    },
    [reloadSoon],
  );

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      const { error } = await getSupabase().rpc(fn, args);
      setBusy(false);
      if (error) {
        console.warn(`[couple] ${fn} failed:`, error);
        setError(toErrorCode(error));
        return false;
      }
      if (roomIdRef.current) await load(roomIdRef.current);
      return true;
    },
    [load],
  );

  const start = useCallback(
    (mode: string, category: string) => roomIdRef.current && call("start_session", { p_room_id: roomIdRef.current, p_mode: mode, p_category: category }),
    [call],
  );
  const submit = useCallback(
    (roundId: string, self: number, guess: number) => call("submit_answer", { p_round_id: roundId, p_self: self, p_guess: guess }),
    [call],
  );
  const next = useCallback(() => session && call("next_round", { p_session_id: session.id, p_from_idx: session.current_round }), [call, session]);
  const quit = useCallback(() => session && call("quit_session", { p_session_id: session.id }), [call, session]);

  const current = useMemo(() => rounds.find((r) => r.idx === session?.current_round) ?? null, [rounds, session?.current_round]);
  const answerOf = useCallback((roundId: string, playerId: string | null) => answers.find((a) => a.round_id === roundId && a.player_id === playerId) ?? null, [answers]);

  return { session, rounds, current, questions, answerOf, busy, error, me, configure, onResync: load, start, submit, next, quit };
}
