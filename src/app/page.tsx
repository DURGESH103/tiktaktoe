"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { FriendsIconLink } from "@/components/friends/FriendsIconLink";
import { AppHeader } from "@/components/ui/AppHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { CODE_LENGTH, isValidCode, normalizeCode } from "@/lib/code";
import { ERROR_COPY, toErrorCode } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import type { Room } from "@/types/db";

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
};

export default function HomePage() {
  const router = useRouter();
  const { player } = useAuth();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  async function createGame() {
    setCreating(true);
    setCreateError(null);
    const { data, error } = await getSupabase().rpc("create_room");
    if (error || !data) {
      setCreateError(ERROR_COPY[toErrorCode(error)].body);
      setCreating(false);
      return;
    }
    router.push(`/game/${(data as Room).code}`);
  }

  function joinGame(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidCode(code)) {
      setJoinError(`Codes are ${CODE_LENGTH} characters, like K7P2Q.`);
      return;
    }
    router.push(`/game/${code}`);
  }

  return (
    <>
      <AppHeader extra={<FriendsIconLink />} />
      <motion.main
        className="safe-x mx-auto flex w-full max-w-md flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
      >
        <motion.section variants={item} className="py-4">
          <p className="text-muted">Hey {player?.name} {player?.avatar}</p>
          <h1 className="mt-1 font-display text-4xl font-bold leading-tight tracking-tight">
            Ready for a{" "}
            <span className="bg-gradient-to-r from-x via-accent to-o bg-clip-text text-transparent">quick match?</span>
          </h1>
        </motion.section>

        <motion.div variants={item}>
          <GlassCard className="flex flex-col gap-3 p-5">
            <div>
              <h2 className="font-display text-lg font-semibold">Play with a friend</h2>
              <p className="text-sm text-muted">Create a room and send them the link.</p>
            </div>
            <Button size="lg" onClick={createGame} loading={creating}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create game
            </Button>
            {createError && (
              <p role="alert" className="text-sm text-danger">
                {createError}
              </p>
            )}
          </GlassCard>
        </motion.div>

        <motion.div variants={item}>
          <GlassCard className="p-5">
            <form onSubmit={joinGame} className="flex flex-col gap-3" noValidate>
              <div>
                <h2 className="font-display text-lg font-semibold">
                  <label htmlFor="join-code">Join with a code</label>
                </h2>
                <p id="join-hint" className="text-sm text-muted">
                  Ask your friend for their 5-character code.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  id="join-code"
                  value={code}
                  onChange={(e) => {
                    setCode(normalizeCode(e.target.value));
                    setJoinError(null);
                  }}
                  placeholder="K7P2Q"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  aria-describedby={joinError ? "join-error" : "join-hint"}
                  aria-invalid={!!joinError}
                  className="glass min-h-14 w-full min-w-0 rounded-2xl px-4 text-center font-display text-2xl font-semibold uppercase tracking-[0.35em] text-fg placeholder:tracking-[0.35em] placeholder:text-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <Button type="submit" size="lg" variant="secondary" disabled={code.length === 0} className="shrink-0">
                  Join
                </Button>
              </div>
              {joinError && (
                <p id="join-error" role="alert" className="text-sm text-danger">
                  {joinError}
                </p>
              )}
            </form>
          </GlassCard>
        </motion.div>

        <motion.div variants={item} className="grid grid-cols-2 gap-3">
          <ButtonLink href="/friends" size="lg" className="w-full justify-between">
            <span className="flex items-center gap-3">
              <span aria-hidden>👥</span> Friends
            </span>
            <span aria-hidden className="text-muted">
              →
            </span>
          </ButtonLink>
          <ButtonLink href="/history" size="lg" className="w-full justify-between">
            <span className="flex items-center gap-3">
              <span aria-hidden>📜</span> History
            </span>
            <span aria-hidden className="text-muted">
              →
            </span>
          </ButtonLink>
        </motion.div>
      </motion.main>
    </>
  );
}
