"use client";

import { useCallback, useEffect, useState } from "react";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { toEntries, type HistoryEntry, type RoomWithGames } from "@/lib/history";
import { getSupabase } from "@/lib/supabase/client";
import type { MyStats, Player } from "@/types/db";

/**
 * Loads the match list (finished rounds the player took part in; RLS limits rooms/games to their own)
 * and the server-calculated stats + head-to-head records.
 */
export function useHistory(me: string | null) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const sb = getSupabase();
    setError(null);

    (async () => {
      const [rooms, statsRes] = await Promise.all([
        sb
          .from("rooms")
          .select("id, code, player_x, player_o, games(*)")
          .eq("game_type", "tictactoe") // history lists Tic-Tac-Toe rounds only
          .not("player_o", "is", null)
          .order("created_at", { ascending: false }),
        sb.rpc("get_my_stats"),
      ]);
      if (cancelled) return;
      const error = rooms.error ?? statsRes.error;
      if (error) return setError(toErrorCode(error));

      const list = toEntries((rooms.data ?? []) as RoomWithGames[], me);
      const ids = [...new Set(list.map((e) => e.opponentId).filter((id): id is string => !!id))];
      if (ids.length) {
        const res = await sb.from("players").select("*").in("id", ids);
        if (cancelled) return;
        if (res.data) setPlayers(Object.fromEntries((res.data as Player[]).map((p) => [p.id, p])));
      }
      setMyStats(statsRes.data as MyStats);
      setEntries(list);
    })();

    return () => {
      cancelled = true;
    };
  }, [me, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { entries, players, myStats, error, retry };
}
