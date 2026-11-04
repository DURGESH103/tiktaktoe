import clsx from "clsx";

/** Tiny static board thumbnail. Decorative: callers describe the game in text. */
export function MiniBoard({ board, winningLine, className }: { board: string; winningLine?: number[] | null; className?: string }) {
  return (
    <svg viewBox="0 0 30 30" className={clsx("shrink-0", className)} aria-hidden>
      <rect x="0.5" y="0.5" width="29" height="29" rx="5" className="fill-fg/[0.05]" />
      {[10, 20].map((p) => (
        <g key={p} className="stroke-fg/15" strokeWidth="0.6">
          <line x1={p} y1="3" x2={p} y2="27" />
          <line x1="3" y1={p} x2="27" y2={p} />
        </g>
      ))}
      {[...board].map((c, i) => {
        const cx = 5 + (i % 3) * 10;
        const cy = 5 + Math.floor(i / 3) * 10;
        const dim = winningLine && !winningLine.includes(i) ? 0.45 : 1;
        if (c === "X")
          return (
            <path
              key={i}
              d={`M${cx - 2.6} ${cy - 2.6}L${cx + 2.6} ${cy + 2.6}M${cx + 2.6} ${cy - 2.6}L${cx - 2.6} ${cy + 2.6}`}
              stroke="rgb(var(--x))"
              strokeWidth="1.7"
              strokeLinecap="round"
              opacity={dim}
            />
          );
        if (c === "O")
          return <circle key={i} cx={cx} cy={cy} r="2.8" fill="none" stroke="rgb(var(--o))" strokeWidth="1.7" opacity={dim} />;
        return null;
      })}
    </svg>
  );
}
