"use client";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CATEGORIES } from "../lib/compat";
import type { Lang } from "../types";

/** Category choice for a Compatibility Test (10 questions from one category). */
export function CategoryPicker({
  open,
  onClose,
  onPick,
  lang,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (category: string) => void;
  lang: Lang;
  busy: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="cat-title" className="theme-couple">
      <div className="flex flex-col gap-4 pb-1">
        <div>
          <h2 id="cat-title" className="font-display text-xl font-semibold">
            Compatibility Test 💘
          </h2>
          <p className="text-sm text-muted">10 questions. Answer for yourself, then guess your partner&apos;s answer.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c, i) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(c.id)}
              data-autofocus={i === 0 || undefined}
              className="glass flex min-h-16 items-center gap-3 rounded-2xl px-4 text-left font-semibold transition hover:bg-accent/10 disabled:opacity-50"
            >
              <span className="text-2xl" aria-hidden>
                {c.emoji}
              </span>
              {c.label[lang]}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}
