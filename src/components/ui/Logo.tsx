export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <path d="M5 5l9 9M14 5l-9 9" stroke="rgb(var(--x))" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="22.5" cy="22.5" r="5.5" fill="none" stroke="rgb(var(--o))" strokeWidth="3.5" />
      </svg>
      Tiktoe
    </span>
  );
}
