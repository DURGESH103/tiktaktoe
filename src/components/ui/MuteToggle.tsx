"use client";

import { useSettings } from "@/components/providers/SettingsProvider";

export function MuteToggle() {
  const { sound, setSound } = useSettings();
  return (
    <button
      type="button"
      onClick={() => setSound(!sound)}
      aria-pressed={!sound}
      aria-label={sound ? "Mute sounds" : "Unmute sounds"}
      className="glass grid h-12 w-12 place-items-center rounded-2xl text-fg"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6M16 9l6 6" />}
      </svg>
    </button>
  );
}
