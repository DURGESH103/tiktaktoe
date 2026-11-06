"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSocial } from "@/components/providers/SocialProvider";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { ShareActions } from "@/components/ui/ShareActions";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { ERROR_COPY, type ErrorCode } from "@/lib/errors";
import { GAME_ORDER, GAMES } from "@/lib/games";
import { canChallenge, secondsLeft, sortFriends, statusLabel, type FriendEntry, type Relation } from "@/lib/social";
import { getSupabase } from "@/lib/supabase/client";
import type { GameType, PublicPlayer } from "@/types/db";
import { FriendButton } from "./FriendButton";
import { StatusDot } from "./StatusDot";

type Tab = "friends" | "requests";

export function FriendsScreen() {
  const social = useSocial();
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "requests" ? "requests" : "friends";
  const setTab = (t: Tab) => router.replace(t === "requests" ? "/friends?tab=requests" : "/friends", { scroll: false });

  if (!social) return null;
  const { data, incomingCount } = social;
  const requestTotal = (data?.incoming.length ?? 0) + (data?.outgoing.length ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-3xl font-bold">Friends</h1>

      <div role="tablist" aria-label="Friends sections" className="glass grid grid-cols-2 gap-1 rounded-2xl p-1">
        {(["friends", "requests"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className="relative min-h-12 rounded-xl font-semibold"
          >
            {tab === t && <motion.span layoutId="friends-tab" className="absolute inset-0 rounded-xl bg-accent/15" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <span className="relative inline-flex items-center gap-2">
              {t === "friends" ? `Friends${data ? ` (${data.friends.length})` : ""}` : `Requests${requestTotal ? ` (${requestTotal})` : ""}`}
              {t === "requests" && incomingCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white" aria-label={`${incomingCount} new`}>
                  {incomingCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} className="flex flex-col gap-5">
        {!data && social.error ? (
          <ErrorState
            icon="📡"
            title={ERROR_COPY[social.error].title}
            body={ERROR_COPY[social.error].body}
            actions={[{ label: "Try again", onClick: social.refresh }]}
            heading="h2"
          />
        ) : !data ? (
          <ListSkeleton />
        ) : tab === "friends" ? (
          <FriendsTab />
        ) : (
          <RequestsTab />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Friends tab

function FriendsTab() {
  const social = useSocial()!;
  const data = social.data!;
  const sorted = sortFriends(data.friends, social.statusOf);
  const [menuFor, setMenuFor] = useState<PublicPlayer | null>(null);

  return (
    <>
      {sorted.length === 0 ? (
        <ErrorState icon="👋" title="No friends yet" body="Share your link and challenge friends whenever they're online." tone="info" heading="h2" />
      ) : (
        <GlassCard className="divide-y divide-line/10 overflow-hidden">
          <AnimatePresence initial={false}>
            {sorted.map((f) => (
              <FriendRow key={f.player.handle} f={f} onMenu={() => setMenuFor(f.player)} />
            ))}
          </AnimatePresence>
        </GlassCard>
      )}
      <AddFriends />
      <FriendMenu player={menuFor} onClose={() => setMenuFor(null)} />
    </>
  );
}

function FriendRow({ f, onMenu }: { f: FriendEntry; onMenu: () => void }) {
  const social = useSocial()!;
  const status = social.statusOf(f.player.handle);
  const { wins, losses, draws, total } = f.head_to_head;
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 py-3 pl-4 pr-2">
      <Link href={`/u/${f.player.handle}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl">
        <span className="relative shrink-0">
          <AvatarBadge avatar={f.player.avatar} color={f.player.color} />
          <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{f.player.name}</span>
          <span className="block truncate text-xs text-muted">
            <span className={clsx(status !== "offline" && "font-medium text-fg")}>{statusLabel(status, f.last_seen_at)}</span>
            {total > 0 && (
              <span aria-label={`, you ${wins} wins, ${losses} losses, ${draws} draws`}>
                {" · "}
                <span className="text-ok">{wins}</span>–<span className="text-danger">{losses}</span>–{draws}
              </span>
            )}
          </span>
        </span>
      </Link>
      <ChallengeButton player={f.player} />
      <button type="button" onClick={onMenu} aria-label={`More options for ${f.player.name}`} className="grid h-12 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-fg/[0.06]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
    </motion.div>
  );
}

/** Challenge (online/away) · disabled "In a game" · disabled + 🔔 "notify me" when offline · countdown while waiting. */
function ChallengeButton({ player }: { player: PublicPlayer }) {
  const social = useSocial()!;
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const status = social.statusOf(player.handle);
  const waiting = social.challenges.find(
    (c) => c.direction === "out" && c.status === "pending" && c.other.handle === player.handle && secondsLeft(c, social.clockOffset, now) > 0,
  );
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waiting]);

  if (waiting) {
    return (
      <span className="grid min-h-12 shrink-0 place-items-center rounded-2xl bg-fg/[0.06] px-3 text-sm font-semibold tabular-nums text-muted">
        {secondsLeft(waiting, social.clockOffset, now)}s…
      </span>
    );
  }
  if (status === "offline") {
    const on = social.watching.has(player.handle);
    return (
      <button
        type="button"
        onClick={() => social.toggleWatch(player.handle)}
        aria-pressed={on}
        aria-label={on ? `Stop notifying me when ${player.name} is online` : `Notify me when ${player.name} is online`}
        className={clsx("grid min-h-12 shrink-0 place-items-center rounded-2xl px-3 text-sm font-semibold", on ? "bg-accent/15 text-accent" : "bg-fg/[0.06] text-muted")}
      >
        {on ? "🔔 On" : "🔔 Notify"}
      </button>
    );
  }
  async function send(game: GameType) {
    setPicking(false);
    setBusy(true);
    const err = await social.challenge(player.handle, game);
    setBusy(false);
    if (err) social.toast({ title: ERROR_COPY[err].title, body: ERROR_COPY[err].body });
  }

  return (
    <>
      <Button
        variant={canChallenge(status) ? "primary" : "secondary"}
        disabled={!canChallenge(status)}
        loading={busy}
        onClick={() => setPicking(true)}
        className="shrink-0 !px-3 text-sm"
        aria-label={canChallenge(status) ? `Challenge ${player.name}` : `${player.name} is in a game`}
      >
        {canChallenge(status) ? "Challenge" : "In a game"}
      </Button>
      {/* Which game? */}
      <Sheet open={picking} onClose={() => setPicking(false)} labelledBy="pick-game-title">
        <div className="flex flex-col gap-3 pb-1">
          <h2 id="pick-game-title" className="font-display text-xl font-semibold">
            Challenge {player.name} to…
          </h2>
          {GAME_ORDER.map((g, i) => (
            <button
              key={g}
              type="button"
              onClick={() => send(g)}
              data-autofocus={i === 0 || undefined}
              className={clsx(
                "glass flex min-h-16 items-center gap-3 rounded-2xl px-4 text-left transition-colors hover:bg-fg/[0.06]",
                g === "couple" && "theme-couple",
              )}
            >
              <span className="text-2xl" aria-hidden>
                {g === "tictactoe" ? "❌" : GAMES[g].emoji}
              </span>
              <span>
                <span className="block font-semibold">{GAMES[g].name}</span>
                <span className="block text-xs text-muted">{GAMES[g].tagline}</span>
              </span>
            </button>
          ))}
          <Button variant="ghost" onClick={() => setPicking(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function FriendMenu({ player, onClose }: { player: PublicPlayer | null; onClose: () => void }) {
  const social = useSocial()!;
  const [confirm, setConfirm] = useState<"unfriend" | "block" | null>(null);
  useEffect(() => setConfirm(null), [player]);
  async function act(kind: "unfriend" | "block") {
    if (!player) return;
    if (confirm !== kind) return setConfirm(kind);
    const err = kind === "unfriend" ? await social.removeFriend(player.handle) : await social.block(player.handle);
    if (err) social.toast({ title: ERROR_COPY[err].title, body: ERROR_COPY[err].body });
    else social.toast({ title: kind === "unfriend" ? `Removed ${player.name}` : `Blocked ${player.name}`, avatar: player });
    onClose();
  }
  return (
    <Sheet open={!!player} onClose={onClose} labelledBy="friend-menu-title">
      {player && (
        <div className="flex flex-col gap-2 pb-1">
          <div className="mb-2 flex items-center gap-3">
            <AvatarBadge avatar={player.avatar} color={player.color} />
            <h2 id="friend-menu-title" className="font-display text-xl font-semibold">
              {player.name}
            </h2>
          </div>
          <Link href={`/u/${player.handle}`} className="flex min-h-12 items-center rounded-2xl px-3 font-medium hover:bg-fg/[0.06]">
            View profile
          </Link>
          <button type="button" onClick={() => act("unfriend")} className="flex min-h-12 items-center rounded-2xl px-3 text-left font-medium hover:bg-fg/[0.06]">
            {confirm === "unfriend" ? `Tap again to remove ${player.name}` : "Unfriend"}
          </button>
          <button type="button" onClick={() => act("block")} className="flex min-h-12 flex-col justify-center rounded-2xl px-3 text-left font-medium text-danger hover:bg-danger/10">
            {confirm === "block" ? `Tap again to block ${player.name}` : "Block"}
            <span className="text-xs font-normal text-muted">They won&apos;t be able to send you requests, challenges or messages.</span>
          </button>
          <Button variant="secondary" onClick={onClose} className="mt-2" data-autofocus>
            Close
          </Button>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Requests tab

function RequestsTab() {
  const social = useSocial()!;
  const { incoming, outgoing, blocked } = social.data!;
  if (!incoming.length && !outgoing.length && !blocked.length) {
    return (
      <>
        <ErrorState icon="📭" title="No requests" body="Friend requests you send or receive show up here." tone="info" heading="h2" />
        <AddFriends />
      </>
    );
  }
  return (
    <>
      <RequestSection title="Incoming" list={incoming} kind="incoming" />
      <RequestSection title="Sent" list={outgoing} kind="sent" />
      <RequestSection title="Blocked" list={blocked} kind="blocked" />
    </>
  );
}

function RequestSection({ title, list, kind }: { title: string; list: { player: PublicPlayer }[]; kind: "incoming" | "sent" | "blocked" }) {
  const social = useSocial()!;
  const [busy, setBusy] = useState<string | null>(null);
  if (!list.length) return null;
  const run = async (key: string, fn: () => Promise<ErrorCode | null>) => {
    setBusy(key);
    const err = await fn();
    setBusy(null);
    if (err) social.toast({ title: ERROR_COPY[err].title, body: ERROR_COPY[err].body });
  };
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <GlassCard className="divide-y divide-line/10 overflow-hidden">
        <AnimatePresence initial={false}>
          {list.map(({ player }) => (
            <motion.div key={player.handle} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/u/${player.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                <AvatarBadge avatar={player.avatar} color={player.color} size="sm" />
                <span className="truncate font-semibold">{player.name}</span>
              </Link>
              {kind === "incoming" && (
                <>
                  <Button variant="secondary" className="!px-3 text-sm" loading={busy === `d${player.handle}`} onClick={() => run(`d${player.handle}`, () => social.respondRequest(player.handle, false))}>
                    Decline
                  </Button>
                  <Button className="!px-3 text-sm" loading={busy === `a${player.handle}`} onClick={() => run(`a${player.handle}`, () => social.respondRequest(player.handle, true))}>
                    Accept
                  </Button>
                </>
              )}
              {kind === "sent" && (
                <Button variant="ghost" className="!px-3 text-sm" loading={busy === player.handle} onClick={() => run(player.handle, () => social.cancelRequest(player.handle))}>
                  Cancel
                </Button>
              )}
              {kind === "blocked" && (
                <Button variant="ghost" className="!px-3 text-sm" loading={busy === player.handle} onClick={() => run(player.handle, () => social.unblock(player.handle))}>
                  Unblock
                </Button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </GlassCard>
    </section>
  );
}

// ---------------------------------------------------------------- Add friends

function AddFriends() {
  const { player } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ player: PublicPlayer; relation: Relation }[] | null>(null);

  // Debounced search by name or friend code.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await getSupabase().rpc("search_players", { p_query: query });
      setResults((data as { player: PublicPlayer; relation: Relation }[]) ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  if (!player) return null;
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/add/${player.handle}`;

  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-lg font-semibold">Add friends</h2>
      <div className="flex flex-col gap-2">
        <label htmlFor="friend-search" className="text-sm text-muted">
          Search by name or friend code
        </label>
        <input
          id="friend-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Rahul"
          autoComplete="off"
          enterKeyHint="search"
          className="glass min-h-12 rounded-2xl px-4 text-base text-fg placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {results && (
          <ul aria-label="Search results" className="flex flex-col divide-y divide-line/10">
            {results.length === 0 && <li className="py-3 text-center text-sm text-muted">No players found.</li>}
            {results.map((r) => (
              <li key={r.player.handle} className="flex items-center gap-3 py-2">
                <Link href={`/u/${r.player.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <AvatarBadge avatar={r.player.avatar} color={r.player.color} size="sm" />
                  <span className="truncate font-semibold">{r.player.name}</span>
                </Link>
                <FriendButton handle={r.player.handle} name={r.player.name} className="shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-fg/[0.04] p-4">
        <p className="text-sm text-muted">Your friend code</p>
        <p className="font-display text-2xl font-bold tracking-[0.2em]">{player.handle}</p>
        <ShareActions url={link} text={`Add me on Tiktoe and let's play Tic-Tac-Toe! My friend code: ${player.handle}`} label="Share my friend link" />
      </div>
    </GlassCard>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      <span className="sr-only">Loading friends…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-12 w-24 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}
