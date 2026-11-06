import { questionText } from "./compat";
import type { CoupleMemory, CoupleQuestion, CoupleRound, Lang } from "../types";

export const MEMORY_BUCKET = "couple-memories";
export const MAX_ANSWER_CHARS = 300;
export const MAX_TITLE_CHARS = 120;
export const MAX_BODY_CHARS = 500;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
/** Longest side of an uploaded photo after resizing on the phone. */
export const PHOTO_MAX_SIDE = 1600;

/** The pair's private photo folder, "<smaller id>_<larger id>" (mirrors the server check). */
export function pairFolder(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function photoPath(folder: string, id: string, ext: "jpg" | "png" | "webp" = "jpg"): string {
  return `${folder}/${id}.${ext}`;
}

/** Scales (w, h) down so the longer side is at most `max`, keeping the aspect ratio. Never scales up. */
export function fitWithin(w: number, h: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Same clean-up the server does: control characters → spaces, runs of whitespace collapsed, trimmed. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

/** Length the server counts (characters, so an emoji is one). */
export const charLength = (s: string) => [...s].length;

/** Where a Memories round stands, from my seat: what to show and whether "Next" is allowed. */
export function memoryVoteState(round: Pick<CoupleRound, "x_match" | "o_match" | "outcome">, mySeat: "X" | "O") {
  const mine = mySeat === "X" ? round.x_match : round.o_match;
  const theirs = mySeat === "X" ? round.o_match : round.x_match;
  return {
    myVote: mine,
    partnerVoted: theirs !== null,
    decided: round.outcome === "matched" || round.outcome === "different",
    matched: round.outcome === "matched",
  };
}

/** Timeline heading: the original prompt in my language when it came from a prompt, else its title. */
export function memoryTitle(m: Pick<CoupleMemory, "title" | "question_id">, questions: Record<number, CoupleQuestion>, lang: Lang): string {
  const q = m.question_id != null ? questions[m.question_id] : undefined;
  return q ? questionText(q, lang) : m.title;
}
