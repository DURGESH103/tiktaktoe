"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `fn` every `ms` — but only while `enabled` and the tab is visible. In the background the
 * timer is stopped entirely (no wake-ups, no requests) and resumes on return. (The room hooks
 * already re-sync once when the tab becomes visible, so this doesn't.) Used as a safety net for
 * dropped realtime updates.
 */
export function useVisibleInterval(fn: () => void, ms: number, enabled: boolean) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined) timer = setInterval(() => fnRef.current(), ms);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}
