"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { ERROR_COPY, type ErrorCode } from "@/lib/errors";
import { dayLabel } from "@/lib/format";
import { maskProfanity } from "@/lib/profanity";
import type { Player } from "@/types/db";
import { memoryTitle } from "../lib/memories";
import type { CoupleMemory, CoupleQuestion, Lang } from "../types";

/** "Our Memories": the pair's shared timeline, newest first. Each player can delete their own entries. */
export function MemoriesTimeline({
  open,
  onClose,
  memories,
  photoUrls,
  questions,
  me,
  players,
  lang,
  onAdd,
  onDelete,
  loadError,
}: {
  open: boolean;
  onClose: () => void;
  memories: CoupleMemory[] | null;
  photoUrls: Record<string, string>;
  questions: Record<number, CoupleQuestion>;
  me: string;
  players: Record<string, Player>;
  lang: Lang;
  onAdd: () => void;
  onDelete: (id: string) => Promise<ErrorCode | null>;
  /** Why the timeline couldn't load (e.g. NOT_SET_UP before the Memories SQL file is run). */
  loadError?: ErrorCode | null;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  async function del(id: string) {
    if (confirm !== id) return setConfirm(id);
    setConfirm(null);
    const err = await onDelete(id);
    setError(err ? ERROR_COPY[err].body : null);
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="timeline-title" className="theme-couple">
      <div className="flex flex-col gap-4 pb-1">
        <div className="flex items-center justify-between gap-2">
          <h2 id="timeline-title" className="font-display text-xl font-semibold">
            Our Memories 📸
          </h2>
          <Button variant="romance" onClick={onAdd} className="!px-3 text-sm">
            + Add
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {!memories && loadError ? (
          <p role="alert" className="rounded-2xl bg-danger/10 p-3 text-sm">
            {ERROR_COPY[loadError].title}. {ERROR_COPY[loadError].body}
          </p>
        ) : !memories ? (
          <div aria-busy className="flex flex-col gap-3">
            <Skeleton className="h-40 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center" role="status">
            <span className="text-5xl" aria-hidden>
              💌
            </span>
            <p className="font-display text-lg font-semibold">No memories yet</p>
            <p className="max-w-xs text-sm text-muted">Play Memories, or tap “+ Add” to save a moment. Only the two of you can see them.</p>
          </div>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l-2 border-accent/30 pl-4" aria-label="Memories, newest first">
            <AnimatePresence initial={false}>
              {memories.map((m) => {
                const author = players[m.created_by];
                const mine = m.created_by === me;
                const url = m.photo_path ? photoUrls[m.photo_path] : undefined;
                return (
                  <motion.li key={m.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="relative">
                    <span aria-hidden className="absolute -left-[1.42rem] top-2 h-3 w-3 rounded-full bg-accent ring-4 ring-bg" />
                    <article className="glass overflow-hidden rounded-3xl">
                      {m.photo_path &&
                        (url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL
                          <img src={url} alt={`Photo: ${memoryTitle(m, questions, lang)}`} loading="lazy" className="max-h-72 w-full object-cover" />
                        ) : (
                          <Skeleton className="h-48 rounded-none" />
                        ))}
                      <div className="flex flex-col gap-1 p-4">
                        <p className="text-xs text-muted">
                          <time dateTime={m.created_at}>{dayLabel(m.created_at)}</time>
                        </p>
                        <h3 className="font-display font-semibold leading-snug">{memoryTitle(m, questions, lang)}</h3>
                        <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{maskProfanity(m.body)}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs text-muted">
                            {author && <AvatarBadge avatar={author.avatar} color={author.color} size="xs" />}
                            {mine ? "Saved by you" : `Saved by ${author?.name ?? "your partner"}`}
                          </span>
                          {mine && (
                            <button
                              type="button"
                              onClick={() => void del(m.id)}
                              className="min-h-12 rounded-xl px-3 text-xs font-semibold text-danger hover:bg-danger/10"
                            >
                              {confirm === m.id ? "Tap again to delete" : "Delete"}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
        <Button variant="ghost" onClick={onClose} data-autofocus>
          Close
        </Button>
      </div>
    </Sheet>
  );
}
