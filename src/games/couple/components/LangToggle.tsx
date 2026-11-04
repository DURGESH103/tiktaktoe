"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import type { Lang } from "../types";

/** EN / हिं toggle for questions. Each player picks their own. */
export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div role="radiogroup" aria-label="Question language" className="glass inline-flex rounded-full p-1">
      {(
        [
          ["en", "English"],
          ["hi", "Hinglish"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={lang === id}
          onClick={() => onChange(id)}
          className={clsx("relative min-h-12 rounded-full px-4 text-sm font-semibold", lang === id ? "text-white" : "text-muted")}
        >
          {lang === id && (
            <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-full bg-gradient-to-br from-rose-600 to-pink-600" transition={{ type: "spring", stiffness: 420, damping: 32 }} />
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}
