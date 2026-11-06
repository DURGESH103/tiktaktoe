"use client";

import { useCallback, useEffect, useState } from "react";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import { MEMORY_BUCKET, pairFolder, photoPath } from "../lib/memories";
import { preparePhoto } from "../lib/photo";
import type { CoupleMemory } from "../types";

const SIGNED_URL_SECS = 60 * 60;

/** Random id that also works on plain-http LAN testing (crypto.randomUUID needs HTTPS). */
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface NewMemory {
  title: string;
  body: string;
  photo?: File | null;
  questionId?: number | null;
}

/**
 * The pair's "Our Memories" timeline (RLS: only the two of them). Photos live in a private
 * bucket and are shown through signed URLs that expire after an hour.
 */
export function useMemories(roomId: string | null, playerX: string | null, playerO: string | null, enabled: boolean) {
  const [memories, setMemories] = useState<CoupleMemory[] | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorCode | null>(null);
  const lo = playerX && playerO ? (playerX < playerO ? playerX : playerO) : null;
  const hi = playerX && playerO ? (playerX < playerO ? playerO : playerX) : null;

  const load = useCallback(async () => {
    if (!lo || !hi) return;
    const sb = getSupabase();
    const { data, error } = await sb.from("couple_memories").select("*").eq("user_a", lo).eq("user_b", hi).order("created_at", { ascending: false });
    if (error) {
      console.warn("[memories] load failed:", error);
      setError(toErrorCode(error));
      return;
    }
    setError(null);
    const list = data as CoupleMemory[];
    setMemories(list);
    const paths = list.map((m) => m.photo_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { data: urls } = await sb.storage.from(MEMORY_BUCKET).createSignedUrls(paths, SIGNED_URL_SECS);
      const entries: [string, string][] = [];
      for (const u of urls ?? []) if (u.path && u.signedUrl) entries.push([u.path, u.signedUrl]);
      setPhotoUrls(Object.fromEntries(entries));
    }
  }, [lo, hi]);

  // Live: a memory saved or deleted on the other phone shows up here too.
  useEffect(() => {
    if (!enabled || !lo || !hi) return;
    void load();
    const sb = getSupabase();
    const ch = sb
      .channel(`memories:${lo}:${hi}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "couple_memories", filter: `user_a=eq.${lo}` }, () => void load())
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [enabled, lo, hi, load]);

  /** Uploads the (shrunk) photo first, then saves the memory; removes the photo again if saving fails. */
  const save = useCallback(
    async (m: NewMemory): Promise<ErrorCode | null> => {
      if (!roomId || !playerX || !playerO) return "ROOM_NOT_FOUND";
      const sb = getSupabase();
      let path: string | null = null;
      if (m.photo) {
        const blob = await preparePhoto(m.photo);
        if (!blob) return "PHOTO_TOO_BIG";
        path = photoPath(pairFolder(playerX, playerO), uuid(), "jpg");
        const up = await sb.storage.from(MEMORY_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) {
          console.warn("[memories] photo upload failed:", up.error);
          return "PHOTO_UPLOAD_FAILED";
        }
      }
      const { error } = await sb.rpc("save_memory", {
        p_room_id: roomId,
        p_title: m.title,
        p_body: m.body,
        p_photo_path: path,
        p_question_id: m.questionId ?? null,
      });
      if (error) {
        console.warn("[memories] save_memory failed:", error);
        if (path) await sb.storage.from(MEMORY_BUCKET).remove([path]);
        return toErrorCode(error);
      }
      await load();
      return null;
    },
    [roomId, playerX, playerO, load],
  );

  /** Deletes one of my memories and its photo. */
  const remove = useCallback(
    async (id: string): Promise<ErrorCode | null> => {
      const sb = getSupabase();
      const { data, error } = await sb.rpc("delete_memory", { p_id: id });
      if (error) return toErrorCode(error);
      if (typeof data === "string" && data) {
        const rm = await sb.storage.from(MEMORY_BUCKET).remove([data]);
        if (rm.error) console.warn("[memories] photo delete failed:", rm.error);
      }
      setMemories((cur) => cur?.filter((m) => m.id !== id) ?? cur);
      return null;
    },
    [],
  );

  return { memories, photoUrls, error, save, remove, reload: load };
}
