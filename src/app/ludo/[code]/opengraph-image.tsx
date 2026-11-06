import { OG_SIZE, shareCard } from "@/lib/og";
import { rpcAsAnon } from "@/lib/supabase/rest";
import type { RoomInvite } from "@/types/db";

export const alt = "Ludo invite on Tiktoe";
export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { code: string };

export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const code = (await params).code.toUpperCase();
  const invite = await rpcAsAnon<RoomInvite>("get_room_invite", { p_code: code });
  const host = invite?.host;
  const seats = invite?.max_players ? `${invite.players ?? 1}/${invite.max_players} seated` : "2–4 players";
  return shareCard({
    avatar: host?.avatar,
    color: host?.color,
    title: host ? `${host.name} invited you to play Ludo 🎲` : "Ludo 🎲",
    subtitle: `Room ${code} · ${seats}`,
  });
}
