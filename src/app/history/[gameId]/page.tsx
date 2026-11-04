import { Replay } from "@/components/history/Replay";
import { AppHeader } from "@/components/ui/AppHeader";

export const metadata = { title: "Replay" };

export default async function ReplayPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return (
    <>
      <AppHeader />
      <main className="safe-x mx-auto flex w-full max-w-md flex-col pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4">
        <Replay gameId={gameId} />
      </main>
    </>
  );
}
