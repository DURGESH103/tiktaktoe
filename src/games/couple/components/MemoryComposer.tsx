"use client";

import clsx from "clsx";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ERROR_COPY, type ErrorCode } from "@/lib/errors";
import type { NewMemory } from "../hooks/useMemories";
import { charLength, cleanText, MAX_BODY_CHARS, MAX_TITLE_CHARS } from "../lib/memories";

export interface ComposerDraft {
  title: string;
  body: string;
  questionId: number | null;
}

/** Save a memory to "Our Memories": title, a few words, and an optional photo (private to the two of you). */
export function MemoryComposer({
  draft,
  onClose,
  onSave,
}: {
  draft: ComposerDraft | null;
  onClose: () => void;
  onSave: (m: NewMemory) => Promise<ErrorCode | null>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileId = useId();

  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title);
    setBody(draft.body);
    setPhoto(null);
    setError(null);
  }, [draft]);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const t = cleanText(title);
  const b = body.trim();
  const valid = !!t && !!b && charLength(t) <= MAX_TITLE_CHARS && charLength(b) <= MAX_BODY_CHARS;

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    const err = await onSave({ title: t, body: b, photo, questionId: draft?.questionId ?? null });
    setSaving(false);
    if (err) setError(ERROR_COPY[err].body);
    else onClose();
  }

  return (
    <Sheet open={!!draft} onClose={onClose} labelledBy="composer-title" className="theme-couple">
      <form
        className="flex flex-col gap-3 pb-1"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="composer-title" className="font-display text-xl font-semibold">
          Save to Our Memories 📸
        </h2>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE_CHARS + 20}
            className="glass min-h-12 rounded-2xl px-4 text-base text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          The memory
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            data-autofocus
            className="glass min-h-28 resize-none rounded-2xl p-4 text-base leading-relaxed text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <span className={clsx("self-end text-xs", charLength(b) > MAX_BODY_CHARS ? "text-danger" : "text-muted")}>
            {charLength(b)}/{MAX_BODY_CHARS}
          </span>
        </label>

        {preview ? (
          <div className="relative overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob: URL) */}
            <img src={preview} alt="Selected photo" className="max-h-56 w-full object-cover" />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="absolute right-2 top-2 min-h-12 rounded-xl bg-black/60 px-3 text-sm font-semibold text-white"
            >
              Remove photo
            </button>
          </div>
        ) : (
          <label
            htmlFor={fileId}
            className="glass flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl text-sm font-semibold focus-within:ring-2 focus-within:ring-accent"
          >
            <span aria-hidden>🖼️</span> Add a photo (optional)
            <input
              id={fileId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="sr-only"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        <p className="text-xs text-muted">Photos are resized on your phone (under 2 MB) and only the two of you can see them.</p>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="romance" size="lg" disabled={!valid} loading={saving}>
          Save memory 💞
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </form>
    </Sheet>
  );
}
