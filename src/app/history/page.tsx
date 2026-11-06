"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { GameList } from "@/components/history/GameList";
import { HeadToHeadList } from "@/components/history/HeadToHeadList";
import { StatsGrid } from "@/components/history/StatsGrid";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/ui/AppHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { LudoGameList, LudoStatsGrid } from "@/games/ludo/components/LudoStats";
import { useLudoHistory } from "@/games/ludo/hooks/useLudoHistory";
import { useHistory } from "@/hooks/useHistory";
import { ERROR_COPY } from "@/lib/errors";

type Tab = "tictactoe" | "ludo";

export default function HistoryPage() {
  const { user } = useAuth();
  const { entries, players, myStats, error, retry } = useHistory(user?.id ?? null);
  const [friend, setFriend] = useState<string | null>(null);

  const shown = useMemo(
    () => (entries ?? []).filter((e) => !friend || (e.opponentId && players[e.opponentId]?.handle) === friend),
    [entries, players, friend],
  );
  const friendName = friend ? myStats?.head_to_head.find((h) => h.opponent.handle === friend)?.opponent.name : null;
  // One tab per game with stats (?game=ludo opens the Ludo tab, e.g. from a Ludo results screen).
  const [tab, setTab] = useState<Tab>("tictactoe");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("game") === "ludo") setTab("ludo");
  }, []);

  return (
    <>
      <AppHeader />
      <main className="safe-x mx-auto flex w-full max-w-md flex-col gap-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4 md:max-w-2xl">
        <h1 className="font-display text-3xl font-bold">History</h1>

        <div role="tablist" aria-label="Game" className="glass grid grid-cols-2 gap-1 rounded-2xl p-1">
          {(["tictactoe", "ludo"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              onClick={() => setTab(t)}
              className="relative min-h-12 rounded-xl font-semibold"
            >
              {tab === t && <motion.span layoutId="history-tab" className="absolute inset-0 rounded-xl bg-accent/15" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span className="relative">{t === "tictactoe" ? "Tic-Tac-Toe" : "Ludo 🎲"}</span>
            </button>
          ))}
        </div>

        {tab === "ludo" ? (
          <div id="panel-ludo" role="tabpanel">
            <LudoHistory me={user?.id ?? null} />
          </div>
        ) : error ? (
          <ErrorState
            icon="📡"
            title={ERROR_COPY[error].title}
            body="We couldn't load your games."
            actions={[{ label: "Try again", onClick: retry }]}
            heading="h2"
          />
        ) : !entries || !myStats ? (
          <HistorySkeleton />
        ) : entries.length === 0 ? (
          <ErrorState
            icon="🎲"
            title="No games yet"
            body="Finished rounds show up here, with your stats and head-to-head records."
            actions={[{ label: "Start a game", href: "/" }]}
            tone="info"
            heading="h2"
          />
        ) : (
          <motion.div className="flex flex-col gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <StatsGrid stats={myStats.stats} title="Your stats" />
            <HeadToHeadList records={myStats.head_to_head} selected={friend} onSelect={setFriend} />

            <section aria-labelledby="games-title" className="flex flex-col gap-3">
              <div className="flex min-h-12 items-center justify-between gap-2">
                <h2 id="games-title" className="font-display text-lg font-semibold">
                  {friendName ? `Games vs ${friendName}` : "All games"}
                </h2>
                <AnimatePresence>
                  {friend && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      onClick={() => setFriend(null)}
                      className="min-h-12 rounded-2xl px-3 text-sm font-medium text-accent hover:bg-accent/10"
                    >
                      Show all
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <GameList entries={shown} players={players} />
            </section>
          </motion.div>
        )}
      </main>
    </>
  );
}

function LudoHistory({ me }: { me: string | null }) {
  const { data, error, retry } = useLudoHistory(me);
  if (error)
    return (
      <ErrorState
        icon="📡"
        title={ERROR_COPY[error].title}
        body={error === "NOT_SET_UP" ? "Ludo stats aren't set up on the server yet." : "We couldn't load your Ludo games."}
        actions={[{ label: "Try again", onClick: retry }]}
        heading="h2"
      />
    );
  if (!data) return <HistorySkeleton />;
  if (data.games.length === 0)
    return (
      <ErrorState
        icon="🎲"
        title="No Ludo games yet"
        body="Finished Ludo games show up here, with your placings, captures and streaks."
        actions={[{ label: "Start a game", href: "/" }]}
        tone="info"
        heading="h2"
      />
    );
  return (
    <motion.div className="flex flex-col gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <LudoStatsGrid stats={data.stats} title="Your Ludo stats" />
      <section aria-labelledby="ludo-games-title" className="flex flex-col gap-3">
        <h2 id="ludo-games-title" className="font-display text-lg font-semibold">
          All games
        </h2>
        <LudoGameList games={data.games} />
      </section>
    </motion.div>
  );
}

function HistorySkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <span className="sr-only">Loading history…</span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[6.5rem] rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-[9rem] rounded-3xl" />
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-[13.5rem] rounded-3xl" />
    </div>
  );
}
