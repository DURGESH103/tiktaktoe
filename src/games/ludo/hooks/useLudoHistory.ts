"use client";

import { useCallback, useEffect, useState } from "react";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import type { MyLudo } from "@/types/db";

/** My Ludo stats and finished games (get_my_ludo), for the Ludo tab of /history. */
export function useLudoHistory(me: string | null) {
  const [data, setData] = useState<MyLudo | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setError(null);
    void getSupabase()
      .rpc("get_my_ludo", { p_limit: 50 })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) return setError(toErrorCode(error));
        setData(data as MyLudo);
      });
    return () => {
      cancelled = true;
    };
  }, [me, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, retry };
}
