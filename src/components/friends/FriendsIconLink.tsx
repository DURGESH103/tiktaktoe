"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSocial } from "@/components/providers/SocialProvider";

/** Header button to /friends with a badge for incoming friend requests. */
export function FriendsIconLink() {
  const social = useSocial();
  const n = social?.incomingCount ?? 0;
  return (
    <Link
      href={n ? "/friends?tab=requests" : "/friends"}
      aria-label={n ? `Friends, ${n} new ${n === 1 ? "request" : "requests"}` : "Friends"}
      className="glass relative grid h-12 w-12 place-items-center rounded-2xl text-fg"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
      </svg>
      <AnimatePresence>
        {n > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            aria-hidden
            className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-bg"
          >
            {n > 9 ? "9+" : n}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
