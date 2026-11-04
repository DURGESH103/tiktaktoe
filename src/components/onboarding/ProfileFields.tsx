"use client";

import clsx from "clsx";
import { AVATARS, COLOR_KEYS, COLORS } from "@/lib/avatars";

export interface ProfileDraft {
  name: string;
  avatar: string;
  color: string;
}

/** Name + avatar + colour inputs. Native radios give us arrow-key navigation for free. */
export function ProfileFields({ value, onChange }: { value: ProfileDraft; onChange: (v: ProfileDraft) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="display-name" className="text-sm font-medium text-muted">
          Display name
        </label>
        <input
          id="display-name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          maxLength={24}
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="done"
          placeholder="e.g. Rahul"
          className="glass min-h-14 rounded-2xl px-4 text-lg text-fg placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-muted">Avatar</legend>
        <div className="grid grid-cols-8 gap-1.5 max-[360px]:grid-cols-6">
          {AVATARS.map((a) => (
            <label key={a} className="relative">
              <input
                type="radio"
                name="avatar"
                value={a}
                checked={value.avatar === a}
                onChange={() => onChange({ ...value, avatar: a })}
                className="peer sr-only"
              />
              <span
                className={clsx(
                  "grid aspect-square min-h-12 cursor-pointer place-items-center rounded-2xl text-2xl transition",
                  "bg-fg/[0.05] peer-checked:scale-105 peer-checked:bg-accent/20 peer-checked:ring-2 peer-checked:ring-accent",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                )}
              >
                <span aria-hidden>{a}</span>
                <span className="sr-only">Avatar {a}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-muted">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_KEYS.map((c) => (
            <label key={c}>
              <input
                type="radio"
                name="color"
                value={c}
                checked={value.color === c}
                onChange={() => onChange({ ...value, color: c })}
                className="peer sr-only"
              />
              <span
                className={clsx(
                  "block h-12 w-12 cursor-pointer rounded-full bg-gradient-to-br ring-offset-2 ring-offset-bg transition",
                  "peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                  COLORS[c],
                )}
              >
                <span className="sr-only">{c}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
