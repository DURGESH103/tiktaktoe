import clsx from "clsx";
import type { Result } from "@/lib/history";

const STYLE: Record<Result, { label: string; cls: string }> = {
  win: { label: "Win", cls: "bg-ok/15 text-ok" },
  loss: { label: "Loss", cls: "bg-danger/15 text-danger" },
  draw: { label: "Draw", cls: "bg-fg/10 text-muted" },
};

export function ResultPill({ result, className }: { result: Result; className?: string }) {
  const s = STYLE[result];
  return (
    <span className={clsx("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold", s.cls, className)}>
      {s.label}
    </span>
  );
}
