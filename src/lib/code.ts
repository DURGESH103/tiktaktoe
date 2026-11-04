/** Room-code alphabet: no I, O, 0 or 1 so codes are easy to read aloud. Mirrors the DB check. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;

/** Uppercases and drops anything outside the alphabet (spaces, dashes, look-alikes). */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((c) => CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, CODE_LENGTH);
}

export const isValidCode = (code: string) =>
  code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));

export const roomUrl = (code: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/game/${code}`;

export const profileUrl = (handle: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/u/${handle}`;
