import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("rounded-xl bg-fg/[0.07] motion-safe:animate-pulse", className)} />;
}
