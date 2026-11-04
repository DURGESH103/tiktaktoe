import type { Metadata } from "next";
import { CoupleRoom } from "@/games/couple/components/CoupleRoom";
import { rpcAsAnon } from "@/lib/supabase/rest";
import type { RoomInvite } from "@/types/db";

type Params = { params: Promise<{ code: string }> };

/** Link preview: "Rahul invited you to Couple Challenge 💞" (image from opengraph-image.tsx). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const code = (await params).code.toUpperCase();
  const invite = await rpcAsAnon<RoomInvite>("get_room_invite", { p_code: code });
  const host = invite?.host?.name;
  const title = host ? `${host} invited you to Couple Challenge 💞` : "Couple Challenge 💞 on Tiktoe";
  const description = `Room ${code} · compatibility tests, memories, questions and challenges for two.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", url: `/couple/${code}`, siteName: "Tiktoe" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CouplePage({ params }: Params) {
  const { code } = await params;
  return <CoupleRoom code={code.toUpperCase()} />;
}
