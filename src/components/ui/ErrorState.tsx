"use client";

import { motion } from "framer-motion";
import { Button, ButtonLink } from "./Button";
import { GlassCard } from "./GlassCard";

type Action =
  | { label: string; href: string; primary?: boolean }
  | { label: string; onClick: () => void; primary?: boolean };

/**
 * Friendly full-card message for errors and empty states.
 * `tone="info"` (empty states) is announced politely; errors interrupt.
 * `heading="h2"` avoids a second h1 on pages that already have one.
 */
export function ErrorState({
  icon = "😕",
  title,
  body,
  actions = [],
  tone = "error",
  heading: Heading = "h1",
}: {
  icon?: string;
  title: string;
  body: string;
  actions?: Action[];
  tone?: "error" | "info";
  heading?: "h1" | "h2";
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full" role={tone === "error" ? "alert" : "status"}>
      <GlassCard className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div className="text-5xl" aria-hidden>
          {icon}
        </div>
        <Heading className="font-display text-2xl font-semibold">{title}</Heading>
        <p className="max-w-xs text-muted">{body}</p>
        {actions.length > 0 && (
          <div className="mt-4 flex w-full flex-col gap-2">
            {actions.map((a, i) => {
              const variant = (a.primary ?? i === 0) ? "primary" : "secondary";
              return "href" in a ? (
                <ButtonLink key={a.label} href={a.href} variant={variant}>
                  {a.label}
                </ButtonLink>
              ) : (
                <Button key={a.label} onClick={a.onClick} variant={variant}>
                  {a.label}
                </Button>
              );
            })}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
