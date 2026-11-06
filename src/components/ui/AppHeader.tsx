"use client";

import clsx from "clsx";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { AvatarBadge } from "./AvatarBadge";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

/** `extra` renders before the theme toggle (e.g. the mute button in a game). */
export function AppHeader({
  left,
  extra,
  slim = false,
}: {
  left?: React.ReactNode;
  extra?: React.ReactNode;
  /** Less padding (e.g. during a Ludo game, so the board gets the space). */
  slim?: boolean;
}) {
  const { player } = useAuth();
  return (
    <header
      className={clsx(
        "safe-x mx-auto flex w-full max-w-md items-center justify-between gap-3 md:max-w-2xl",
        slim ? "pb-1 pt-[calc(env(safe-area-inset-top)+0.375rem)]" : "pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]",
      )}
    >
      {left ?? (
        <Link href="/" aria-label="Tiktoe home" className="flex min-h-12 items-center rounded-2xl">
          <Logo />
        </Link>
      )}
      <div className="flex items-center gap-2">
        {extra}
        <ThemeToggle />
        {player && (
          <Link
            href="/profile"
            aria-label={`Your profile, ${player.name}`}
            className="glass grid h-12 w-12 place-items-center rounded-2xl"
          >
            <AvatarBadge avatar={player.avatar} color={player.color} size="sm" />
          </Link>
        )}
      </div>
    </header>
  );
}
