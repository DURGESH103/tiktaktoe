"use client";

import { useCallback, useEffect, useState } from "react";

/** A per-room boolean remembered on this device (e.g. "hide opponent" for this game). */
export function useRoomFlag(name: string, roomId: string | null) {
  const key = roomId ? `${name}:${roomId}` : null;
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!key) return;
    try {
      setOn(localStorage.getItem(key) === "1");
    } catch {}
  }, [key]);

  const set = useCallback(
    (v: boolean) => {
      setOn(v);
      if (!key) return;
      try {
        if (v) localStorage.setItem(key, "1");
        else localStorage.removeItem(key);
      } catch {}
    },
    [key],
  );

  return [on, set] as const;
}
