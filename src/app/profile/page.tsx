"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ProfileFields, type ProfileDraft } from "@/components/onboarding/ProfileFields";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { AppHeader } from "@/components/ui/AppHeader";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { ShareActions } from "@/components/ui/ShareActions";
import { profileUrl } from "@/lib/code";
import { getSupabase } from "@/lib/supabase/client";

export default function ProfilePage() {
  const { player, user, saveProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { sound, setSound, haptics, setHaptics } = useSettings();
  const [draft, setDraft] = useState<ProfileDraft>({
    name: player?.name ?? "",
    avatar: player?.avatar ?? "😎",
    color: player?.color ?? "violet",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  // OAuth errors come back in the URL (e.g. this Google account is already linked to another player).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
    const desc = params.get("error_description");
    if (desc) setLinkError(desc.replace(/\+/g, " "));
  }, []);

  const dirty =
    !!player && (draft.name.trim() !== player.name || draft.avatar !== player.avatar || draft.color !== player.color);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await saveProfile(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function linkGoogle() {
    setLinking(true);
    setLinkError(null);
    const { error } = await getSupabase().auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/profile` },
    });
    if (error) {
      setLinkError(error.message);
      setLinking(false);
    }
  }

  const isGuest = user?.is_anonymous ?? true;
  const googleEmail = user?.identities?.find((i) => i.provider === "google")?.identity_data?.email as string | undefined;

  return (
    <>
      <AppHeader />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="safe-x mx-auto flex w-full max-w-md flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4"
      >
        <h1 className="font-display text-3xl font-bold">Profile</h1>

        <form onSubmit={save}>
          <GlassCard className="flex flex-col gap-6 p-5">
            <div className="flex items-center gap-4">
              <AvatarBadge avatar={draft.avatar} color={draft.color} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-semibold">{draft.name || "Your name"}</p>
                <p className="text-sm text-muted">{isGuest ? "Guest account" : `Linked to Google${googleEmail ? ` · ${googleEmail}` : ""}`}</p>
              </div>
            </div>
            <ProfileFields value={draft} onChange={setDraft} />
            <Button type="submit" disabled={!dirty || !draft.name.trim()} loading={saving}>
              {saved ? "Saved ✓" : "Save changes"}
            </Button>
          </GlassCard>
        </form>

        {player?.handle && (
          <GlassCard className="flex flex-col gap-3 p-5">
            <div>
              <h2 className="font-display text-lg font-semibold">Public profile</h2>
              <p className="text-sm text-muted">Your name, avatar, stats and recent results. Anyone with the link can see it.</p>
            </div>
            <ButtonLink href={`/u/${player.handle}`} className="w-full justify-between">
              <span className="truncate">tiktoe/u/{player.handle}</span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </ButtonLink>
            <ShareActions url={profileUrl(player.handle)} text="Check out my Tic-Tac-Toe stats on Tiktoe!" label="Share profile" />
          </GlassCard>
        )}

        <GlassCard className="flex flex-col gap-3 p-5">
          <h2 className="font-display text-lg font-semibold">Appearance</h2>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2 rounded-2xl bg-fg/[0.05] p-1">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                onClick={() => setTheme(t)}
                className="relative min-h-12 rounded-xl font-medium capitalize"
              >
                {theme === t && (
                  <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-xl bg-surface/80 shadow dark:bg-white/10" />
                )}
                <span className="relative">{t === "dark" ? "🌙 Dark" : "☀️ Light"}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col gap-1 p-5">
          <h2 className="mb-2 font-display text-lg font-semibold">Sound &amp; vibration</h2>
          <Switch label="Sound effects" hint="Moves, wins and reactions" checked={sound} onChange={setSound} />
          <Switch label="Vibration" hint="On supported phones" checked={haptics} onChange={setHaptics} />
        </GlassCard>

        <GlassCard className="flex flex-col gap-3 p-5">
          <h2 className="font-display text-lg font-semibold">Account</h2>
          {isGuest ? (
            <>
              <p className="text-sm text-muted">
                You&apos;re playing as a guest. Your history lives on this device, and clearing your browser data removes it.
                Link Google to keep it everywhere.
              </p>
              <Button variant="secondary" onClick={linkGoogle} loading={linking}>
                <GoogleIcon /> Link Google account
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted">Your games are saved to your Google account and sync across devices.</p>
          )}
          {linkError && (
            <p role="alert" className="text-sm text-danger">
              {linkError}
            </p>
          )}
        </GlassCard>
      </motion.main>
    </>
  );
}

/** Accessible on/off switch (role="switch"), full row is the 48px+ touch target. */
function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl px-1 text-left"
    >
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-fg/20"}`}
        aria-hidden
      >
        <motion.span
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
          animate={{ left: checked ? 24 : 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
