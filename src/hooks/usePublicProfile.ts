"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { PublicProfile } from "@/types/db";

type State =
  | { status: "loading" }
  | { status: "ready"; profile: PublicProfile }
  | { status: "missing" }
  | { status: "error" };

/** Fetches a public profile by handle. Signed-in viewers also get their head-to-head. Pass null to skip. */
export function usePublicProfile(handle: string | null) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setState({ status: "loading" });
    getSupabase()
      .rpc("get_public_profile", { p_handle: handle })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setState({ status: "error" });
        else if (!data) setState({ status: "missing" });
        else setState({ status: "ready", profile: data as PublicProfile });
      });
    return () => {
      cancelled = true;
    };
  }, [handle, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
