"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { vibrate, type HapticName } from "@/lib/haptics";
import { playSound, unlockAudio, type SoundName } from "@/lib/sound";

interface Settings {
  sound: boolean;
  haptics: boolean;
  setSound: (on: boolean) => void;
  setHaptics: (on: boolean) => void;
  /** Plays a sound and/or vibration, each only if enabled. */
  feedback: (sound: SoundName | null, haptic?: HapticName | null) => void;
}

const SettingsContext = createContext<Settings | null>(null);

function load(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function save(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {}
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [sound, setSoundState] = useState(true);
  const [haptics, setHapticsState] = useState(true);

  useEffect(() => {
    setSoundState(load("sound", true));
    setHapticsState(load("haptics", true));
    // Audio may only start after a gesture: unlock on the first tap/keypress anywhere.
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const setSound = useCallback((on: boolean) => {
    setSoundState(on);
    save("sound", on);
    if (on) unlockAudio();
  }, []);
  const setHaptics = useCallback((on: boolean) => {
    setHapticsState(on);
    save("haptics", on);
  }, []);

  const feedback = useCallback(
    (s: SoundName | null, h?: HapticName | null) => {
      if (sound && s) playSound(s);
      if (haptics && h) vibrate(h);
    },
    [sound, haptics],
  );

  const value = useMemo(() => ({ sound, haptics, setSound, setHaptics, feedback }), [sound, haptics, setSound, setHaptics, feedback]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
