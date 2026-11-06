"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FriendsIconLink } from "@/components/friends/FriendsIconLink";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/ui/AppHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { CODE_LENGTH, isValidCode, normalizeCode } from "@/lib/code";
import { ERROR_COPY, toErrorCode } from "@/lib/errors";
import { GAME_ORDER, GAMES, roomPath } from "@/lib/games";
import { getSupabase } from "@/lib/supabase/client";
import type { GameType, Room, RoomInvite } from "@/types/db";

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
};

export default function HomePage() {
  const router = useRouter();
  const { player } = useAuth();
  // Tic-Tac-Toe is selected by default, so "Create game" is still one tap away.
  const [game, setGame] = useState<GameType>("tictactoe");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function createGame() {
    setCreating(true);
    setCreateError(null);
    // Tic-Tac-Toe keeps using create_room() exactly as before.
    const { data, error } =
      game === "tictactoe" ? await getSupabase().rpc("create_room") : await getSupabase().rpc("create_room_for", { p_game_type: game });
    if (error || !data) {
      setCreateError(ERROR_COPY[toErrorCode(error)].body);
      setCreating(false);
      return;
    }
    router.push(roomPath((data as Room).code, game));
  }

  /** One box for every game: look up which game the code belongs to, then open it. */
  async function joinGame(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidCode(code)) {
      setJoinError(`Codes are ${CODE_LENGTH} characters, like K7P2Q.`);
      return;
    }
    setJoining(true);
    const { data, error } = await getSupabase().rpc("get_room_invite", { p_code: code });
    if (!error && !data) {
      setJoining(false);
      setJoinError(ERROR_COPY.ROOM_NOT_FOUND.body);
      return;
    }
    // If the lookup itself failed (e.g. offline), fall back to the Tic-Tac-Toe page, which redirects other games.
    router.push(roomPath(code, (data as RoomInvite | null)?.game_type));
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
        <motion.section variants={item} className="py-3">
          <p className="text-muted">
            Hey {player?.name} {player?.avatar}
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold leading-tight tracking-tight">
            What are we{" "}
            <span className="bg-gradient-to-r from-x via-accent to-o bg-clip-text text-transparent">playing?</span>
          </h1>
        </motion.section>

        {/* Game picker */}
        <motion.div variants={item} role="radiogroup" aria-label="Choose a game" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {GAME_ORDER.map((g) => (
            <GameCard key={g} game={g} selected={game === g} onSelect={() => setGame(g)} />
          ))}
        </motion.div>

        <motion.div variants={item}>
          <GlassCard className={clsx("flex flex-col gap-3 p-5 transition-colors", game === "couple" && "theme-couple")}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={game} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                <h2 className="font-display text-lg font-semibold">{PANEL[game].title}</h2>
                <p className="text-sm text-muted">
                  {PANEL[game].body}
                </p>
              </motion.div>
            </AnimatePresence>
            <Button size="lg" onClick={createGame} loading={creating} variant={game === "couple" ? "romance" : "primary"}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {PANEL[game].create}
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
                  Any game: ask your friend for their 5-character code.
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
                <Button type="submit" size="lg" variant="secondary" disabled={code.length === 0} loading={joining} className="shrink-0">
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

/** Text of the create panel for the selected game. */
const PANEL: Record<GameType, { title: string; body: string; create: string }> = {
  tictactoe: { title: "Play with a friend", body: "Create a room and send them the link.", create: "Create game" },
  couple: { title: "Play together 💞", body: "Compatibility tests, memories, questions and challenges for two.", create: "Create Couple Challenge" },
  ludo: { title: "Ludo for 2–4 🎲", body: "Create a table, pick 2, 3 or 4 players, and invite your friends.", create: "Create Ludo table" },
};

function GameCard({ game, selected, onSelect }: { game: GameType; selected: boolean; onSelect: () => void }) {
  const g = GAMES[game];
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      whileTap={{ scale: 0.97 }}
      className={clsx(
        "glass relative flex min-h-28 flex-col items-start justify-between gap-2 overflow-hidden rounded-3xl p-4 text-left transition-shadow",
        // Third card: full width on phones (two per row), one row of three from sm up.
        game === "ludo" && "col-span-2 sm:col-span-1",
        selected && (game === "couple" ? "ring-2 ring-rose-400/80" : "ring-2 ring-accent/80"),
      )}
    >
      {selected && (
        <motion.span
          layoutId="game-pick"
          aria-hidden
          className={clsx("absolute inset-0", game === "couple" ? "bg-gradient-to-br from-rose-500/15 to-pink-500/10" : "bg-gradient-to-br from-x/10 to-o/10")}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative text-2xl" aria-hidden>
        {game === "tictactoe" ? <TicTacToeGlyph /> : g.emoji}
      </span>
      <span className="relative">
        <span className="block font-display font-semibold leading-tight">{g.short}</span>
        <span className="block text-xs text-muted">{g.tagline}</span>
      </span>
    </motion.button>
  );
}

function TicTacToeGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32">
      <path d="M5 5l9 9M14 5l-9 9" stroke="rgb(var(--x))" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="22.5" cy="22.5" r="5.5" fill="none" stroke="rgb(var(--o))" strokeWidth="3.5" />
    </svg>
  );
}
