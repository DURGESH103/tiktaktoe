"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Logo } from "@/components/ui/Logo";
import { AVATARS } from "@/lib/avatars";
import { ProfileFields, type ProfileDraft } from "./ProfileFields";

/** First-visit screen: pick a name and avatar. Shown instead of the app until a profile exists. */
export function OnboardingSheet() {
  const { saveProfile } = useAuth();
  const [draft, setDraft] = useState<ProfileDraft>(() => ({
    name: "",
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    color: "violet",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = draft.name.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile(draft);
    } catch {
      setError("Couldn't save your profile. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <main className="safe-x mx-auto flex min-h-dvh max-w-md flex-col pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>

      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        aria-labelledby="onboarding-title"
      >
        <GlassCard className="flex flex-col gap-6 p-5">
          <div className="flex items-center gap-4">
            <motion.div key={draft.avatar + draft.color} initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
              <AvatarBadge avatar={draft.avatar} color={draft.color} size="lg" />
            </motion.div>
            <div>
              <h1 id="onboarding-title" className="font-display text-2xl font-semibold">
                Welcome!
              </h1>
              <p className="text-muted">Pick a name your friends will see.</p>
            </div>
          </div>

          <ProfileFields value={draft} onChange={setDraft} />

          <p className="flex gap-2 rounded-2xl bg-accent/10 p-3 text-sm text-fg/90">
            <span aria-hidden>💾</span>
            <span>
              Your history is saved on this device. Link Google in your profile to keep it everywhere. Clearing your
              browser data removes a guest account.
            </span>
          </p>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={!valid} loading={saving}>
            Let&apos;s play
          </Button>
        </GlassCard>
      </motion.form>
    </main>
  );
}
