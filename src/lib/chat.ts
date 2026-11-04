/** Client-side mirror of send_message's rules, for instant feedback. The server is the authority. */
export const MAX_MESSAGE_CHARS = 200;

export type MessageCheck = { ok: true; body: string } | { ok: false; reason: "empty" | "too_long"; length: number };

/** Same cleaning as the server: control chars → space, collapse whitespace, trim. Length in characters (emoji = 1). */
export function cleanMessage(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

export const charCount = (s: string) => [...s].length;

export function validateMessage(input: string): MessageCheck {
  const body = cleanMessage(input);
  const length = charCount(body);
  if (length === 0) return { ok: false, reason: "empty", length };
  if (length > MAX_MESSAGE_CHARS) return { ok: false, reason: "too_long", length };
  return { ok: true, body };
}

/** RFC 4122 v4 id. crypto.randomUUID needs HTTPS; getRandomValues also works over plain http (LAN testing). */
export function uuid4(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const QUICK_REPLIES = ["Good game!", "Rematch?", "Nice move", "Your turn 😄"] as const;

export const PICKER_EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "😎", "🤔", "😏", "😅", "😭", "😡", "🥳",
  "👍", "👎", "👏", "🙏", "🤝", "💪", "🔥", "💯", "🎉", "❤️", "😴", "🫡",
];
