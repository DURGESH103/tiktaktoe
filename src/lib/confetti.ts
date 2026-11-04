/** Fires a short two-sided confetti burst. Skipped for prefers-reduced-motion. Loaded lazily. */
export async function celebrate() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#38bdf8", "#f472b6", "#a78bfa", "#facc15", "#4ade80"];
  const common = { colors, disableForReducedMotion: true, zIndex: 60, ticks: 220 };

  confetti({ ...common, particleCount: 90, spread: 80, startVelocity: 45, origin: { x: 0.5, y: 0.6 } });
  const end = Date.now() + 900;
  (function frame() {
    confetti({ ...common, particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.75 } });
    confetti({ ...common, particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.75 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
