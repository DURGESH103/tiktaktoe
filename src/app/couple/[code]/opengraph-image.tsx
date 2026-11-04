import { OG_SIZE, shareCard } from "@/lib/og";
import { rpcAsAnon } from "@/lib/supabase/rest";
import type { RoomInvite } from "@/types/db";

export const alt = "Couple Challenge invite on Tiktoe";
export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { code: string };

export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const code = (await params).code.toUpperCase();
  const invite = await rpcAsAnon<RoomInvite>("get_room_invite", { p_code: code });
  const host = invite?.host;
  return shareCard({
    avatar: host?.avatar,
    color: host?.color,
    title: host ? `${host.name} invited you to Couple Challenge 💞` : "Couple Challenge 💞",
    subtitle: invite?.is_full ? `Room ${code}` : `Room ${code} · tap to join`,
    theme: "couple",
  });
}
