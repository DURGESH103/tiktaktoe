"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Player } from "@/types/db";

type Status = "loading" | "ready" | "error";

interface AuthContextValue {
  status: Status;
  error: string | null;
  user: User | null;
  player: Player | null;
  saveProfile: (p: Pick<Player, "name" | "avatar" | "color">) => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Shared across StrictMode double-mounts so we never create two anonymous users.
let bootPromise: Promise<User> | null = null;

async function ensureUser(): Promise<User> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (data.session?.user) return data.session.user;
  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error || !anon.user) throw error ?? new Error("Anonymous sign-in failed");
  return anon.user;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    bootPromise ??= ensureUser();
    bootPromise
      .then(async (u) => {
        const { data, error } = await getSupabase().from("players").select("*").eq("id", u.id).maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setUser(u);
        setPlayer(data as Player | null);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        bootPromise = null;
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Keep the user object fresh (e.g. after linking Google, is_anonymous flips to false).
  useEffect(() => {
    if (status !== "ready") return;
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      if (session?.user) setUser(session.user);
    });
    return () => data.subscription.unsubscribe();
  }, [status]);

  const saveProfile = useCallback(
    async (p: Pick<Player, "name" | "avatar" | "color">) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await getSupabase()
        .from("players")
        .upsert({ id: user.id, name: p.name.trim(), avatar: p.avatar, color: p.color })
        .select()
        .single();
      if (error) throw error;
      setPlayer(data as Player);
    },
    [user],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <AuthContext.Provider value={{ status, error, user, player, saveProfile, retry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
