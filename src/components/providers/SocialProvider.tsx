"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChallengeCards } from "@/components/friends/ChallengeCards";
import { Toaster, type Toast } from "@/components/ui/Toaster";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { roomPath } from "@/lib/games";
import { canChallenge, relationFor, secondsLeft, type Challenge, type FriendsData, type FriendStatus, type PresenceState, type Relation } from "@/lib/social";
import { getSupabase } from "@/lib/supabase/client";
import type { GameType } from "@/types/db";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";

const HEARTBEAT_MS = 60_000;
const PRESENCE_CHANNEL = "presence:lobby";

interface Social {
  data: FriendsData | null;
  /** Why the friend list couldn't load (e.g. NOT_SET_UP before the friends migration is run). */
  error: ErrorCode | null;
  refresh: () => void;
  /** Live status of a friend (anyone else always reads as offline). */
  statusOf: (handle: string) => FriendStatus;
  relationOf: (handle: string) => Relation;
  incomingCount: number;
  challenges: Challenge[];
  clockOffset: number;
  /** "Notify me when online" watch list. */
  watching: Set<string>;
  toggleWatch: (handle: string) => void;
  sendRequest: (handle: string) => Promise<ErrorCode | null>;
  respondRequest: (handle: string, accept: boolean) => Promise<ErrorCode | null>;
  cancelRequest: (handle: string) => Promise<ErrorCode | null>;
  removeFriend: (handle: string) => Promise<ErrorCode | null>;
  block: (handle: string) => Promise<ErrorCode | null>;
  unblock: (handle: string) => Promise<ErrorCode | null>;
  challenge: (handle: string, gameType?: GameType) => Promise<ErrorCode | null>;
  respondChallenge: (id: string, accept: boolean) => Promise<ErrorCode | null>;
  cancelChallenge: (id: string) => Promise<ErrorCode | null>;
  toast: (t: Omit<Toast, "id">) => void;
}

const SocialContext = createContext<Social | null>(null);

/** Null when signed out or before a profile exists (e.g. a visitor on a public profile link). */
export const useSocial = () => useContext(SocialContext);

/**
 * App-wide friends layer: friend list + requests, live presence on one shared channel,
 * challenges (with the pop-up cards) and toasts. Mounted once, after sign-in.
 */
export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user, player } = useAuth();
  const me = user?.id ?? null;
  const myHandle = player?.handle ?? null;
  const router = useRouter();
  const pathname = usePathname();
  const { feedback } = useSettings();

  const [data, setData] = useState<FriendsData | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [presence, setPresence] = useState<Record<string, PresenceState>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [watching, setWatching] = useState<Set<string>>(new Set());
  const prevData = useRef<FriendsData | null>(null);
  const prevChallenges = useRef<Map<string, Challenge>>(new Map());
  const lobbyRef = useRef<ReturnType<ReturnType<typeof getSupabase>["channel"]> | null>(null);
  const tokenRef = useRef<string | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((cur) => [...cur.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((cur) => cur.filter((x) => x.id !== id)), []);

  // ---------------------------------------------------------------- data
  const refreshFriends = useCallback(async () => {
    const { data: d, error } = await getSupabase().rpc("get_friends");
    if (error) {
      console.warn("[friends] get_friends failed:", error);
      setError(toErrorCode(error));
      return;
    }
    setError(null);
    setData(d as FriendsData);
  }, []);

  const refreshChallenges = useCallback(async () => {
    const { data: d, error } = await getSupabase().rpc("get_challenges");
    if (error) return console.warn("[friends] get_challenges failed:", error);
    const list = d as Challenge[];
    if (list[0]) setClockOffset(Date.parse(list[0].server_now) - Date.now());
    setChallenges(list);
  }, []);

  // Live updates for my friendships and challenges (RLS limits rows to my own).
  useEffect(() => {
    if (!me) return;
    const sb = getSupabase();
    void refreshFriends();
    void refreshChallenges();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = (fn: () => void) => {
      clearTimeout(timer);
      timer = setTimeout(fn, 150); // coalesce bursts (e.g. both columns of a pair changing)
    };
    const ch = sb
      .channel(`social:${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `user_a=eq.${me}` }, () => soon(refreshFriends))
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `user_b=eq.${me}` }, () => soon(refreshFriends))
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges", filter: `to_user=eq.${me}` }, () => void refreshChallenges())
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges", filter: `from_user=eq.${me}` }, () => void refreshChallenges())
      .on("system", {}, (m: { extension?: string; status?: string }) => {
        if (m.extension === "postgres_changes" && m.status === "ok") {
          void refreshFriends();
          void refreshChallenges();
        }
      })
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshFriends();
      void refreshChallenges();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(ch);
    };
  }, [me, refreshFriends, refreshChallenges]);

  // ------------------------------------------------------------ presence
  // One shared channel, keyed by public handle (never the auth id). Offline = not present.
  const myState: PresenceState =
    pathname?.startsWith("/game/") || pathname?.startsWith("/couple/") ? "in_game" : typeof document !== "undefined" && document.visibilityState === "hidden" ? "away" : "online";
  const [, forceVisibility] = useState(0);
  const myStateRef = useRef(myState);
  myStateRef.current = myState;

  useEffect(() => {
    if (!myHandle) return;
    const sb = getSupabase();
    const ch = sb.channel(PRESENCE_CHANNEL, { config: { presence: { key: myHandle } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ status: PresenceState }>();
      const next: Record<string, PresenceState> = {};
      for (const [handle, metas] of Object.entries(state)) {
        // Several tabs/devices: the "most available" one wins.
        const statuses = metas.map((m) => m.status);
        next[handle] = statuses.includes("online") ? "online" : statuses.includes("away") ? "away" : "in_game";
      }
      setPresence(next);
    }).subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      lobbyRef.current = ch;
      void ch.track({ status: myStateRef.current });
    });
    const onVisibility = () => forceVisibility((n) => n + 1);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      lobbyRef.current = null;
      sb.removeChannel(ch);
    };
  }, [myHandle]);

  // Re-announce whenever my state changes (entering a game, switching tabs…). Before the channel has
  // joined there's nothing to do: the subscribe callback above announces the current state.
  useEffect(() => {
    void lobbyRef.current?.track({ status: myState });
  }, [myState]);

  // ------------------------------------------------------------ last seen
  useEffect(() => {
    if (!me) return;
    const sb = getSupabase();
    const touch = () => void sb.rpc("touch_last_seen");
    void sb.auth.getSession().then(({ data: s }) => (tokenRef.current = s.session?.access_token ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => (tokenRef.current = s?.access_token ?? null));
    touch();
    const interval = setInterval(() => document.visibilityState === "visible" && touch(), HEARTBEAT_MS);
    // Leaving / backgrounding: a keepalive request still goes out while the page is closing.
    const onHide = () => {
      if (document.visibilityState === "visible" || !tokenRef.current) return;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      void fetch(`${url}/rest/v1/rpc/touch_last_seen`, {
        method: "POST",
        keepalive: true,
        headers: { apikey: key!, Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(interval);
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [me]);

  // ------------------------------------------------------------ derived
  const friendHandles = useMemo(() => new Set(data?.friends.map((f) => f.player.handle) ?? []), [data]);
  // Status is only ever shown for friends.
  const statusOf = useCallback(
    (handle: string): FriendStatus => (friendHandles.has(handle) ? (presence[handle] ?? "offline") : "offline"),
    [friendHandles, presence],
  );
  const relationOf = useCallback((handle: string) => relationFor(handle, data, myHandle ?? undefined), [data, myHandle]);

  // ------------------------------------------------------------ notifications from changes
  useEffect(() => {
    const prev = prevData.current;
    prevData.current = data;
    if (!prev || !data) return; // first load: nothing is "new"
    const had = (list: { player: { handle: string } }[], h: string) => list.some((x) => x.player.handle === h);
    for (const r of data.incoming) {
      if (!had(prev.incoming, r.player.handle)) {
        feedback("message", "message");
        toast({ title: `${r.player.name} sent you a friend request`, avatar: r.player, action: { label: "View", href: "/friends?tab=requests" } });
      }
    }
    for (const fr of data.friends) {
      if (had(prev.outgoing, fr.player.handle)) toast({ title: `${fr.player.name} accepted your friend request`, avatar: fr.player });
    }
  }, [data, feedback, toast]);

  useEffect(() => {
    const prev = prevChallenges.current;
    prevChallenges.current = new Map(challenges.map((c) => [c.id, c]));
    for (const c of challenges) {
      const before = prev.get(c.id);
      if (c.direction === "in" && c.status === "pending" && !before && secondsLeft(c, clockOffset) > 0) feedback("join", "join");
      if (c.direction !== "out" || before?.status !== "pending" || c.status === "pending") continue;
      if (c.status === "accepted" && c.room_code) router.push(roomPath(c.room_code, c.game_type));
      else if (c.status === "declined") toast({ title: `${c.other.name} declined`, avatar: c.other });
      else if (c.status === "expired") toast({ title: `No response from ${c.other.name}`, avatar: c.other });
      else if (c.status === "cancelled") toast({ title: "Challenge cancelled", avatar: c.other });
    }
  }, [challenges, clockOffset, feedback, router, toast]);

  // "Notify me when online"
  useEffect(() => {
    for (const handle of watching) {
      const s = statusOf(handle);
      if (!canChallenge(s)) continue;
      const fr = data?.friends.find((f) => f.player.handle === handle);
      setWatching((cur) => {
        const next = new Set(cur);
        next.delete(handle);
        return next;
      });
      if (fr) {
        feedback("join", "join");
        toast({ title: `${fr.player.name} is online`, avatar: fr.player, action: { label: "Challenge", href: "/friends" } });
      }
    }
  }, [presence, watching, statusOf, data, feedback, toast]);

  // ------------------------------------------------------------ actions
  const run = useCallback(
    async (fn: string, args: Record<string, unknown>, after: () => Promise<void>): Promise<ErrorCode | null> => {
      const { error } = await getSupabase().rpc(fn, args);
      if (error) {
        console.warn(`[friends] ${fn} failed:`, error);
        return toErrorCode(error);
      }
      await after();
      return null;
    },
    [],
  );

  const sendRequest = useCallback((h: string) => run("send_friend_request", { p_handle: h }, refreshFriends), [run, refreshFriends]);
  const respondRequest = useCallback(
    (h: string, accept: boolean) => run("respond_friend_request", { p_handle: h, p_accept: accept }, refreshFriends),
    [run, refreshFriends],
  );
  const cancelRequest = useCallback((h: string) => run("cancel_friend_request", { p_handle: h }, refreshFriends), [run, refreshFriends]);
  const removeFriend = useCallback((h: string) => run("remove_friend", { p_handle: h }, refreshFriends), [run, refreshFriends]);
  const block = useCallback((h: string) => run("block_user", { p_handle: h }, refreshFriends), [run, refreshFriends]);
  const unblock = useCallback((h: string) => run("unblock_user", { p_handle: h }, refreshFriends), [run, refreshFriends]);

  const applyChallenge = useCallback((c: Challenge) => {
    setClockOffset(Date.parse(c.server_now) - Date.now());
    setChallenges((cur) => [c, ...cur.filter((x) => x.id !== c.id)]);
  }, []);

  const challenge = useCallback(
    async (h: string, gameType: GameType = "tictactoe"): Promise<ErrorCode | null> => {
      const { data: d, error } = await getSupabase().rpc("send_challenge", { p_handle: h, p_game_type: gameType });
      if (error) {
        console.warn("[friends] send_challenge failed:", error);
        return toErrorCode(error);
      }
      const c = d as Challenge;
      applyChallenge(c);
      if (c.status === "accepted" && c.room_code) router.push(roomPath(c.room_code, c.game_type)); // they'd challenged me too
      return null;
    },
    [applyChallenge, router],
  );

  const respondChallenge = useCallback(
    async (id: string, accept: boolean): Promise<ErrorCode | null> => {
      const { data: d, error } = await getSupabase().rpc("respond_challenge", { p_id: id, p_accept: accept });
      if (error) return toErrorCode(error);
      const c = d as Challenge;
      applyChallenge(c);
      if (c.status === "accepted" && c.room_code) router.push(roomPath(c.room_code, c.game_type));
      else if (accept && c.status === "expired") toast({ title: "That challenge expired", avatar: c.other });
      return null;
    },
    [applyChallenge, router, toast],
  );

  const cancelChallenge = useCallback(
    async (id: string): Promise<ErrorCode | null> => {
      const { data: d, error } = await getSupabase().rpc("cancel_challenge", { p_id: id });
      if (error) return toErrorCode(error);
      applyChallenge(d as Challenge);
      return null;
    },
    [applyChallenge],
  );

  const toggleWatch = useCallback((h: string) => {
    setWatching((cur) => {
      const next = new Set(cur);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  }, []);

  const value = useMemo<Social>(
    () => ({
      data,
      error,
      refresh: () => void refreshFriends(),
      statusOf,
      relationOf,
      incomingCount: data?.incoming.length ?? 0,
      challenges,
      clockOffset,
      watching,
      toggleWatch,
      sendRequest,
      respondRequest,
      cancelRequest,
      removeFriend,
      block,
      unblock,
      challenge,
      respondChallenge,
      cancelChallenge,
      toast,
    }),
    [data, error, refreshFriends, statusOf, relationOf, challenges, clockOffset, watching, toggleWatch, sendRequest, respondRequest, cancelRequest, removeFriend, block, unblock, challenge, respondChallenge, cancelChallenge, toast],
  );

  return (
    <SocialContext.Provider value={value}>
      {children}
      <ChallengeCards />
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </SocialContext.Provider>
  );
}
