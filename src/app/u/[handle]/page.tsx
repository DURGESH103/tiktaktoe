import type { Metadata } from "next";
import { PublicProfileScreen } from "@/components/profile/PublicProfileScreen";
import { AppHeader } from "@/components/ui/AppHeader";
import { rpcAsAnon } from "@/lib/supabase/rest";
import type { PublicProfile } from "@/types/db";

type Params = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const p = await rpcAsAnon<PublicProfile>("get_public_profile", { p_handle: handle, p_recent: 1 });
  if (!p) return { title: "Player not found" };
  const { name } = p.player;
  const { wins, total, win_rate } = p.stats;
  const title = `${name} on Tiktoe`;
  const description = total
    ? `${wins} ${wins === 1 ? "win" : "wins"} in ${total} ${total === 1 ? "game" : "games"} · ${Math.round((win_rate ?? 0) * 100)}% win rate. Play Tic-Tac-Toe with friends.`
    : `${name} plays Tic-Tac-Toe on Tiktoe. Challenge them!`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "profile", url: `/u/${handle}`, siteName: "Tiktoe" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicProfilePage({ params }: Params) {
  const { handle } = await params;
  return (
    <>
      <AppHeader />
      <main className="safe-x mx-auto flex w-full max-w-md flex-col pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4 md:max-w-2xl">
        <PublicProfileScreen handle={handle.toLowerCase()} />
      </main>
    </>
  );
}
