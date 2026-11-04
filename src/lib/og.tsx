import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

// Avatar gradients as hex (Tailwind classes aren't available inside next/og).
const GRADIENTS: Record<string, [string, string]> = {
  violet: ["#8b5cf6", "#d946ef"],
  sky: ["#38bdf8", "#2563eb"],
  emerald: ["#34d399", "#0d9488"],
  amber: ["#fbbf24", "#ea580c"],
  rose: ["#fb7185", "#db2777"],
  slate: ["#94a3b8", "#334155"],
};

/** 1200×630 share card: logo, avatar, headline, sub-line. Shared by room invites and profiles. */
export function shareCard({
  avatar,
  color,
  title,
  subtitle,
  theme = "default",
}: {
  avatar?: string;
  color?: string;
  title: string;
  subtitle: string;
  /** "couple": rose glow and a row of hearts instead of X/O marks. */
  theme?: "default" | "couple";
}) {
  const [c1, c2] = GRADIENTS[color ?? ""] ?? GRADIENTS.violet;
  const couple = theme === "couple";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          color: "#eef0ff",
          // Satori rejects a colour inside the `background` shorthand, so colour and gradients are split.
          backgroundColor: "#080914",
          backgroundImage: couple
            ? "radial-gradient(circle at 10% 0%, rgba(251,113,133,.5), transparent 55%), radial-gradient(circle at 100% 20%, rgba(236,72,153,.35), transparent 50%), radial-gradient(circle at 50% 120%, rgba(244,63,94,.4), transparent 55%)"
            : "radial-gradient(circle at 10% 0%, rgba(167,139,250,.45), transparent 55%), radial-gradient(circle at 100% 20%, rgba(56,189,248,.3), transparent 50%), radial-gradient(circle at 50% 120%, rgba(244,114,182,.35), transparent 55%)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 40, fontWeight: 700 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <path d="M5 5l9 9M14 5l-9 9" stroke="#38bdf8" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="22.5" cy="22.5" r="5.5" fill="none" stroke="#f472b6" strokeWidth="3.5" />
          </svg>
          Tiktoe
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          {avatar && (
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 112,
                background: `linear-gradient(135deg, ${c1}, ${c2})`,
                border: "6px solid rgba(255,255,255,.25)",
              }}
            >
              {avatar}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
            <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1 }}>{title}</div>
            <div style={{ fontSize: 34, color: "#a0a6c4" }}>{subtitle}</div>
          </div>
        </div>

        {couple && (
          <div style={{ display: "flex", gap: 18, fontSize: 40 }}>
            {["💖", "💞", "💕", "💗", "💓"].map((h, i) => (
              <span key={i}>{h}</span>
            ))}
          </div>
        )}
        {/* Decorative X / O strip */}
        <div style={{ display: couple ? "none" : "flex", gap: 20, opacity: 0.9 }}>
          {["X", "O", "X", "O", "X"].map((m, i) => (
            <svg key={i} width="44" height="44" viewBox="0 0 100 100">
              {m === "X" ? (
                <path d="M26 26 L74 74 M74 26 L26 74" stroke="#38bdf8" strokeWidth="14" strokeLinecap="round" />
              ) : (
                <circle cx="50" cy="50" r="26" fill="none" stroke="#f472b6" strokeWidth="14" />
              )}
            </svg>
          ))}
        </div>
      </div>
    ),
    { ...OG_SIZE, emoji: "twemoji" },
  );
}
