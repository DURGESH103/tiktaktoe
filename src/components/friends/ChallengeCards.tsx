"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSocial } from "@/components/providers/SocialProvider";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";
import { secondsLeft, type Challenge } from "@/lib/social";

const TOTAL = 60;

/**
 * Pop-up cards for live challenges, shown on every page:
 * incoming ("Rahul challenged you!", Accept / Decline) and outgoing ("Waiting for Rahul…", Cancel),
 * both with the same 60-second countdown (corrected for clock differences between phones).
 */
export function ChallengeCards() {
  const social = useSocial();
  const [now, setNow] = useState(() => Date.now());
  const expiring = useRef(new Set<string>());

  const challenges = social?.challenges ?? [];
  const offset = social?.clockOffset ?? 0;
  const live = challenges.filter((c) => c.status === "pending" && secondsLeft(c, offset, now) > 0);
  const incoming = live.find((c) => c.direction === "in");
  const outgoing = live.find((c) => c.direction === "out");

  // Tick only while something is counting down.
  const anyPending = challenges.some((c) => c.status === "pending");
  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [anyPending]);

  // When my own challenge runs out, tell the server, so the friend's card closes and I get "No response".
  useEffect(() => {
    if (!social) return;
    for (const c of challenges) {
      if (c.direction === "out" && c.status === "pending" && secondsLeft(c, offset, now) === 0 && !expiring.current.has(c.id)) {
        expiring.current.add(c.id);
        void social.cancelChallenge(c.id);
      }
    }
  }, [challenges, offset, now, social]);

  if (!social) return null;

  return (
    <Portal>
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {incoming && (
            <Card key={incoming.id} c={incoming} left={secondsLeft(incoming, offset, now)}>
              <p className="font-display text-lg font-semibold leading-tight">{incoming.other.name} challenged you!</p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => void social.respondChallenge(incoming.id, false)}>
                  Decline
                </Button>
                <Button className="flex-1" onClick={() => void social.respondChallenge(incoming.id, true)} data-autofocus>
                  Accept
                </Button>
              </div>
            </Card>
          )}
          {outgoing && (
            <Card key={outgoing.id} c={outgoing} left={secondsLeft(outgoing, offset, now)}>
              <p className="font-display text-base font-semibold leading-tight">Waiting for {outgoing.other.name}…</p>
              <p className="text-xs text-muted">They have a minute to accept.</p>
              <Button variant="ghost" className="mt-2 w-full" onClick={() => void social.cancelChallenge(outgoing.id)}>
                Cancel challenge
              </Button>
            </Card>
          )}
        </AnimatePresence>
      </div>
    </Portal>
  );
}

function Card({ c, left, children }: { c: Challenge; left: number; children: React.ReactNode }) {
  return (
    <motion.section
      role="alertdialog"
      aria-label={c.direction === "in" ? `Challenge from ${c.other.name}` : `Challenge to ${c.other.name}`}
      initial={{ opacity: 0, y: -30, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="glass pointer-events-auto w-full max-w-sm rounded-3xl bg-bg/90 p-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <AvatarBadge avatar={c.other.avatar} color={c.other.color} />
          <Countdown left={left} />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </motion.section>
  );
}

/** Ring around the avatar that drains over 60 s, plus the seconds left. */
function Countdown({ left }: { left: number }) {
  const r = 27;
  const circ = 2 * Math.PI * r;
  return (
    <>
      <svg className="absolute -inset-1.5 -rotate-90" width="60" height="60" viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r={r} fill="none" strokeWidth="3" className="stroke-fg/10" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          stroke={left <= 10 ? "rgb(var(--danger))" : "rgb(var(--accent))"}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - left / TOTAL)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>
      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-bg px-1.5 text-xs font-bold tabular-nums" aria-label={`${left} seconds left`}>
        {left}s
      </span>
    </>
  );
}
