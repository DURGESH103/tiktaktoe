import type { Metadata } from "next";
import { LudoRoom } from "@/games/ludo/components/LudoRoom";
import { rpcAsAnon } from "@/lib/supabase/rest";
import type { RoomInvite } from "@/types/db";

type Params = { params: Promise<{ code: string }> };

/** Link preview: "Rahul invited you to play Ludo 🎲" (image from opengraph-image.tsx). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const code = (await params).code.toUpperCase();
  const invite = await rpcAsAnon<RoomInvite>("get_room_invite", { p_code: code });
  const host = invite?.host?.name;
  const title = host ? `${host} invited you to play Ludo 🎲` : "Ludo 🎲 on Tiktoe";
  const seats = invite?.max_players ? ` · ${invite.players ?? 1}/${invite.max_players} seated` : "";
  const description = `Room ${code}${seats} · real-time Ludo for 2–4 friends.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", url: `/ludo/${code}`, siteName: "Tiktoe" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LudoPage({ params }: Params) {
  const { code } = await params;
  return <LudoRoom code={code.toUpperCase()} />;
}
