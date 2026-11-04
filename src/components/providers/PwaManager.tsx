"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Portal } from "@/components/ui/Portal";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CHECK_EVERY_MS = 5 * 60_000;

/**
 * Production: registers the service worker and shows "Update available — tap to refresh"
 * when a newer deploy is live. Development: no service worker (and removes any old one).
 */
export function PwaManager() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      return;
    }
    // Needs a secure context (HTTPS or localhost); on plain-http LAN testing it simply doesn't register.
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`).catch(() => {});

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { buildId } = (await res.json()) as { buildId?: string };
        if (buildId && buildId !== BUILD_ID) setUpdateReady(true);
      } catch {
        // offline: try again later
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(check, CHECK_EVERY_MS);
    void check();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, []);

  return (
    <Portal>
      <AnimatePresence>
        {updateReady && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            onClick={() => window.location.reload()}
            className="glass fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 z-[70] flex min-h-12 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-bg/90 px-5 text-sm font-semibold shadow-xl"
          >
            <span aria-hidden>✨</span> Update available — tap to refresh
          </motion.button>
        )}
      </AnimatePresence>
    </Portal>
  );
}
