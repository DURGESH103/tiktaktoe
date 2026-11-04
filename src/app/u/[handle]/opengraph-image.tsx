import { OG_SIZE, shareCard } from "@/lib/og";
import { rpcAsAnon } from "@/lib/supabase/rest";
import type { PublicProfile } from "@/types/db";

export const alt = "Player profile on Tiktoe";
export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { handle: string };

export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const { handle } = await params;
  const p = await rpcAsAnon<PublicProfile>("get_public_profile", { p_handle: handle, p_recent: 1 });
  if (!p) return shareCard({ title: "Play Tic-Tac-Toe with friends", subtitle: "tiktoe" });
  const { wins, losses, draws, win_rate, total } = p.stats;
  return shareCard({
    avatar: p.player.avatar,
    color: p.player.color,
    title: `${p.player.name} on Tiktoe`,
    subtitle: total
      ? `${wins}W · ${losses}L · ${draws}D · ${Math.round((win_rate ?? 0) * 100)}% win rate`
      : "Challenge them to a game of Tic-Tac-Toe",
  });
}
