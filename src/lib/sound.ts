/**
 * Tiny Web Audio synth for game sounds: no audio files to download.
 * Browsers only allow audio after a user gesture; unlockAudio() is called on the first tap.
 */

export type SoundName = "place" | "opponent" | "win" | "lose" | "draw" | "join" | "reaction" | "message" | "error";

type Tone = {
  freq: number;
  to?: number; // glide target
  dur: number;
  type?: OscillatorType;
  gain?: number;
  at?: number; // start offset (s)
};

const SOUNDS: Record<SoundName, Tone[]> = {
  place: [{ freq: 620, to: 880, dur: 0.09, type: "sine", gain: 0.18 }],
  opponent: [{ freq: 420, to: 520, dur: 0.1, type: "triangle", gain: 0.16 }],
  win: [523, 659, 784, 1047].map((f, i) => ({ freq: f, dur: 0.16, type: "triangle", gain: 0.16, at: i * 0.09 })),
  lose: [392, 330, 262].map((f, i) => ({ freq: f, dur: 0.2, type: "sine", gain: 0.15, at: i * 0.12 })),
  draw: [
    { freq: 440, dur: 0.14, type: "sine", gain: 0.14 },
    { freq: 440, dur: 0.18, type: "sine", gain: 0.12, at: 0.16 },
  ],
  join: [
    { freq: 523, dur: 0.12, type: "triangle", gain: 0.15 },
    { freq: 784, dur: 0.18, type: "triangle", gain: 0.15, at: 0.1 },
  ],
  reaction: [{ freq: 900, to: 1400, dur: 0.06, type: "sine", gain: 0.12 }],
  message: [
    { freq: 740, dur: 0.07, type: "sine", gain: 0.12 },
    { freq: 988, dur: 0.09, type: "sine", gain: 0.1, at: 0.07 },
  ],
  error: [{ freq: 200, to: 150, dur: 0.14, type: "square", gain: 0.06 }],
};

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call from a user gesture so later sounds (e.g. the opponent's move) are allowed to play. */
export function unlockAudio() {
  const c = context();
  if (c?.state === "suspended") void c.resume();
}

export function playSound(name: SoundName) {
  const c = context();
  if (!c || c.state !== "running") return;
  const now = c.currentTime;
  for (const t of SOUNDS[name]) {
    const start = now + (t.at ?? 0);
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
    // Quick attack, exponential decay: soft clicks, no pops.
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(t.gain ?? 0.15, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(amp).connect(c.destination);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }
}
