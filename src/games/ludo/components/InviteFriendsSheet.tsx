"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { StatusDot } from "@/components/friends/StatusDot";
import { useSocial } from "@/components/providers/SocialProvider";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ERROR_COPY } from "@/lib/errors";
import { statusLabel } from "@/lib/social";

/** Pick several friends and invite them all into this Ludo lobby at once. */
export function InviteFriendsSheet({
  open,
  onClose,
  roomCode,
  seatedHandles,
  openSeats,
}: {
  open: boolean;
  onClose: () => void;
  roomCode: string;
  seatedHandles: Set<string>;
  openSeats: number;
}) {
  const social = useSocial();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setResult(null);
    }
  }, [open]);

  const friends = (social?.data?.friends ?? []).filter((f) => !seatedHandles.has(f.player.handle));
  const pending = new Set(
    (social?.challenges ?? []).filter((c) => c.direction === "out" && c.status === "pending" && c.room_code === roomCode).map((c) => c.other.handle),
  );

  function toggle(h: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(h)) next.delete(h);
      else if (next.size < openSeats) next.add(h);
      return next;
    });
  }

  async function send() {
    if (!social) return;
    setSending(true);
    const errors: string[] = [];
    for (const h of picked) {
      const err = await social.challenge(h, "ludo", roomCode);
      if (err) errors.push(`${friends.find((f) => f.player.handle === h)?.player.name ?? h}: ${ERROR_COPY[err].title}`);
    }
    setSending(false);
    setPicked(new Set());
    setResult(errors.length ? errors.join(" · ") : `Invite${picked.size === 1 ? "" : "s"} sent! They have a minute to accept.`);
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="invite-title">
      <div className="flex flex-col gap-3 pb-1">
        <div>
          <h2 id="invite-title" className="font-display text-xl font-semibold">
            Invite friends 🎲
          </h2>
          <p className="text-sm text-muted">
            {openSeats > 0 ? `Pick up to ${openSeats} — they'll get a pop-up to join this table.` : "The table is full."}
          </p>
        </div>
        {friends.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted">No friends to invite yet. Share the link instead, or add friends first.</p>
            <ButtonLink href="/friends" variant="secondary">
              Go to Friends
            </ButtonLink>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line/10" aria-label="Friends">
            {friends.map((f) => {
              const status = social!.statusOf(f.player.handle);
              const on = picked.has(f.player.handle);
              const invited = pending.has(f.player.handle);
              return (
                <li key={f.player.handle}>
                  <label className={clsx("flex min-h-14 cursor-pointer items-center gap-3 py-2", (invited || (!on && picked.size >= openSeats)) && "opacity-60")}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={invited || (!on && picked.size >= openSeats)}
                      onChange={() => toggle(f.player.handle)}
                      className="h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
                    />
                    <span className="relative shrink-0">
                      <AvatarBadge avatar={f.player.avatar} color={f.player.color} size="sm" />
                      <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{f.player.name}</span>
                      <span className="block text-xs text-muted">{invited ? "Invite sent…" : statusLabel(status, f.last_seen_at)}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {result && (
          <p role="status" className="rounded-2xl bg-fg/[0.06] p-3 text-sm">
            {result}
          </p>
        )}
        <Button size="lg" disabled={picked.size === 0} loading={sending} onClick={send}>
          Send {picked.size > 0 ? `${picked.size} ` : ""}invite{picked.size === 1 ? "" : "s"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}
