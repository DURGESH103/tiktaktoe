"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { ShareActions } from "@/components/ui/ShareActions";
import { copyText } from "@/lib/clipboard";
import { roomUrl } from "@/lib/code";
import type { Player } from "@/types/db";

export function WaitingScreen({ code, me, onCancel }: { code: string; me?: Player; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <GlassCard className="flex flex-col items-center gap-5 px-5 py-8 text-center">
        <div className="relative grid h-24 w-24 place-items-center">
          {/* Expanding radar rings */}
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-accent/50"
              initial={{ scale: 0.7, opacity: 0.7 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
            />
          ))}
          {me && <AvatarBadge avatar={me.avatar} color={me.color} size="lg" />}
        </div>

        <div>
          <h1 className="font-display text-2xl font-semibold" aria-live="polite">
            Waiting for your friend
            <motion.span aria-hidden animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.4, repeat: Infinity }}>
              …
            </motion.span>
          </h1>
          <p className="mt-1 text-muted">Share the link or the code below. The game starts as soon as they join.</p>
        </div>

        <button
          type="button"
          onClick={async () => setCopied(await copyText(code))}
          className="group flex gap-1.5 rounded-2xl p-1"
          aria-label={`Room code ${code.split("").join(" ")}. Tap to copy.`}
        >
          {code.split("").map((ch, i) => (
            <motion.span
              key={i}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.06, type: "spring", stiffness: 400, damping: 22 }}
              className="grid h-14 w-11 place-items-center rounded-xl bg-fg/[0.06] font-display text-3xl font-bold group-hover:bg-fg/[0.1]"
            >
              {ch}
            </motion.span>
          ))}
        </button>
        <p className="-mt-3 h-5 text-sm text-muted" aria-live="polite">
          {copied ? "Code copied!" : "Tap the code to copy"}
        </p>

        <ShareActions
          url={roomUrl(code)}
          text={`${me?.name ?? "Your friend"} invited you to play Tic-Tac-Toe! Room code ${code}`}
          label="Invite a friend"
        />
      </GlassCard>

      <Button variant="ghost" onClick={onCancel}>
        Cancel game
      </Button>
    </motion.div>
  );
}
