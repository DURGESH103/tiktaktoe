"use client";

import clsx from "clsx";
import { useState } from "react";
import { useSocial } from "@/components/providers/SocialProvider";
import { Button } from "@/components/ui/Button";
import { ERROR_COPY } from "@/lib/errors";

/**
 * Add friend → Requested (tap to cancel) → Friends ✓, or Accept when they asked first.
 * Renders nothing for yourself or when signed out.
 */
export function FriendButton({ handle, name, className }: { handle: string; name: string; className?: string }) {
  const social = useSocial();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!social) return null;
  const relation = social.relationOf(handle);
  if (relation === "self") return null;

  async function act(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(ERROR_COPY[err as keyof typeof ERROR_COPY]?.body ?? "Something went wrong.");
  }

  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      {relation === "none" && (
        <Button size="md" loading={busy} onClick={() => act(() => social.sendRequest(handle))}>
          <span aria-hidden>＋</span> Add friend
        </Button>
      )}
      {relation === "requested" && (
        <Button variant="secondary" loading={busy} onClick={() => act(() => social.cancelRequest(handle))} aria-label={`Friend request sent to ${name}. Tap to cancel.`}>
          Requested · Cancel
        </Button>
      )}
      {relation === "incoming" && (
        <Button loading={busy} onClick={() => act(() => social.respondRequest(handle, true))}>
          Accept friend request
        </Button>
      )}
      {relation === "friends" && (
        <span className="inline-flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-ok/15 px-4 text-[15px] font-semibold text-ok">
          Friends ✓
        </span>
      )}
      {relation === "blocked" && (
        <Button variant="secondary" loading={busy} onClick={() => act(() => social.unblock(handle))}>
          Blocked · Unblock
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
