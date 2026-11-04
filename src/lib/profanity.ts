/**
 * Basic bad-word filter for English and Hindi/Hinglish (Latin and Devanagari).
 * Masks whole words with "***". Applied when a message is displayed, so it also
 * covers anything sent by a modified client.
 *
 * Entries ending in "*" also match suffixed forms ("fuck*" → fucking, fucker).
 * Matching ignores case, common look-alike characters (@→a, 0→o, $→s…) and
 * stretched letters ("fuuuck").
 */
const WORDS = [
  // English
  "fuck*", "motherfuck*", "shit*", "bitch*", "bastard*", "asshole*", "ass", "dick", "dickhead*", "cunt*",
  "slut*", "whore*", "wanker*", "prick", "twat*", "bollocks", "pussy", "cock", "cocksucker*", "retard*",
  "wtf", "stfu",
  // Hinglish (romanised Hindi)
  "chutiya*", "chutiye*", "chut", "madarchod*", "maderchod*", "mc", "behenchod*", "bhenchod*", "benchod*", "bc",
  "bhosdi*", "bhosda*", "bhosadi*", "gaand*", "gand", "gandu*", "lauda*", "lavda*", "lund*", "randi*",
  "harami*", "haramzada*", "kamina*", "kutti*", "saala", "saali", "jhaant*", "tatte*", "chodu*", "chod",
  // Devanagari
  "चूतिया*", "चुतिया*", "चूत", "मादरचोद*", "बहनचोद*", "भेनचोद*", "भोसड़ी*", "भोसडी*", "गांड*", "गांडू*",
  "लौड़ा*", "लौडा*", "लंड*", "रंडी*", "हरामी*", "हरामज़ादा*", "कमीना*", "कुत्ती*",
];

// Same-length (1:1) substitutions so match positions map back onto the original text.
// ("!" is deliberately not mapped to "i": it's far more often real punctuation, as in "shit!!".)
const LOOKALIKE: Record<string, string> = { "@": "a", "4": "a", "3": "e", "1": "i", "0": "o", "$": "s", "5": "s", "7": "t" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function wordPattern(entry: string): string {
  const prefix = entry.endsWith("*");
  const word = prefix ? entry.slice(0, -1) : entry;
  // Each character may be repeated ("fuuuck"); Devanagari marks are kept as written.
  const body = [...word].map((ch) => `${escape(ch)}+`).join("");
  return prefix ? `${body}[\\p{L}\\p{M}]*` : body;
}

// Whole words only: not preceded or followed by a letter, mark or digit (so "class", "bass", "mcdonald" are safe).
const PATTERN = new RegExp(
  `(?<![\\p{L}\\p{M}\\p{N}])(?:${WORDS.map(wordPattern).join("|")})(?![\\p{L}\\p{M}\\p{N}])`,
  "giu",
);

function normalise(text: string): string {
  return [...text].map((ch) => LOOKALIKE[ch] ?? ch).join("").toLowerCase();
}

/** Replaces bad words with "***". Returns the original string when nothing matched. */
export function maskProfanity(text: string): string {
  const norm = normalise(text);
  // Lower-casing can change length for a few exotic characters; if so, fall back to matching the raw text.
  const haystack = norm.length === text.length ? norm : text;
  let out = "";
  let last = 0;
  for (const m of haystack.matchAll(PATTERN)) {
    out += text.slice(last, m.index) + "***";
    last = m.index! + m[0].length;
  }
  return last === 0 ? text : out + text.slice(last);
}
