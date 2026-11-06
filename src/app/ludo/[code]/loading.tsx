import { Skeleton } from "@/components/ui/Skeleton";

/** Shown instantly while the server prepares the room page (it fetches the invite for link previews). */
export default function Loading() {
  return (
    <main className="safe-x mx-auto flex w-full max-w-md flex-col gap-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]" aria-busy>
      <span className="sr-only">Loading the Ludo table…</span>
      <div className="flex justify-between">
        <Skeleton className="h-12 w-40 rounded-2xl" />
        <Skeleton className="h-12 w-28 rounded-2xl" />
      </div>
      <Skeleton className="h-[4.5rem] w-full rounded-3xl" />
      <Skeleton className="mx-auto h-10 w-40 rounded-full" />
      <Skeleton className="mx-auto aspect-square w-full max-w-[min(92vw,26rem)] rounded-4xl" />
    </main>
  );
}
