"use client";

import { useEffect, useState } from "react";

export type PresenceStatus = "connecting" | "online" | "away" | "left";

/** How long the opponent may be gone (app switch, flaky network) before we call it "left". */
export const LEAVE_GRACE_MS = 30_000;

/**
 * online → away (immediately when they drop) → left (after the grace period).
 * Coming back at any point resets to online.
 */
export function useOpponentPresence(opponentId: string | null, presentIds: Set<string> | null): PresenceStatus {
  const synced = presentIds !== null;
  const online = !!opponentId && !!presentIds?.has(opponentId);
  const [graceOver, setGraceOver] = useState(false);

  useEffect(() => {
    setGraceOver(false);
    if (!synced || !opponentId || online) return;
    const t = setTimeout(() => setGraceOver(true), LEAVE_GRACE_MS);
    return () => clearTimeout(t);
  }, [synced, opponentId, online]);

  if (!synced) return "connecting";
  if (online) return "online";
  return graceOver ? "left" : "away";
}
