"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import type { PublicPlayer } from "@/types/db";
import { AvatarBadge } from "./AvatarBadge";
import { Portal } from "./Portal";

export interface Toast {
  id: string;
  title: string;
  body?: string;
  avatar?: Pick<PublicPlayer, "avatar" | "color">;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
}

/** Small notifications at the top of the screen (friend requests, challenge outcomes…). */
export function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <Portal>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[70] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              role="status"
              initial={{ opacity: 0, y: -24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="glass pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-bg/90 p-3 shadow-xl"
            >
              {t.avatar && <AvatarBadge avatar={t.avatar.avatar} color={t.avatar.color} size="sm" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.body && <p className="text-xs text-muted">{t.body}</p>}
              </div>
              {t.action &&
                ("href" in t.action ? (
                  <Link
                    href={t.action.href}
                    onClick={() => onDismiss(t.id)}
                    className="grid min-h-12 shrink-0 place-items-center rounded-xl px-3 text-sm font-semibold text-accent hover:bg-accent/10"
                  >
                    {t.action.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      (t.action as { onClick: () => void }).onClick();
                      onDismiss(t.id);
                    }}
                    className="min-h-12 shrink-0 rounded-xl px-3 text-sm font-semibold text-accent hover:bg-accent/10"
                  >
                    {t.action.label}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss"
                className="grid h-12 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-fg/[0.06]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  );
}
