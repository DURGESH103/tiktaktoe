"use client";

import { AnimatePresence, motion } from "framer-motion";
import { forwardRef } from "react";
import { TypingDots } from "./ChatPanel";

/** Floating chat button with an unread badge; shows "…" while the opponent is typing. */
export const ChatButton = forwardRef<HTMLButtonElement, { unread: number; typing: boolean; onClick: () => void }>(function ChatButton(
  { unread, typing, onClick },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileTap={{ scale: 0.92 }}
      aria-label={unread ? `Open chat, ${unread} unread ${unread === 1 ? "message" : "messages"}` : "Open chat"}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-[max(1rem,env(safe-area-inset-right))] z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-pink-600 text-white shadow-xl shadow-fuchsia-500/30"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      </svg>
      <AnimatePresence>
        {unread > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-danger px-1.5 text-xs font-bold text-white ring-2 ring-bg"
            aria-hidden
          >
            {unread > 9 ? "9+" : unread}
          </motion.span>
        )}
        {typing && unread === 0 && (
          <motion.span
            key="typing"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -left-2 -top-2 grid h-6 place-items-center rounded-full bg-surface px-2 text-fg shadow ring-2 ring-bg dark:bg-slate-700"
            aria-hidden
          >
            <TypingDots />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
});
