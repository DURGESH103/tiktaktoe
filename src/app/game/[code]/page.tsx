import type { Metadata } from "next";
import { GameRoom } from "@/components/game/GameRoom";
import { rpcAsAnon } from "@/lib/supabase/rest";
import type { RoomInvite } from "@/types/db";

type Params = { params: Promise<{ code: string }> };

/** Link preview: "Rahul invited you to play Tic-Tac-Toe" (image comes from opengraph-image.tsx). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const code = (await params).code.toUpperCase();
  const invite = await rpcAsAnon<RoomInvite>("get_room_invite", { p_code: code });
  const host = invite?.host?.name;
  const title = host ? `${host} invited you to play Tic-Tac-Toe` : "Play Tic-Tac-Toe on Tiktoe";
  const description = `Room ${code} · tap to join. No sign-up needed.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", url: `/game/${code}`, siteName: "Tiktoe" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GamePage({ params }: Params) {
  const { code } = await params;
  return <GameRoom code={code.toUpperCase()} />;
}
