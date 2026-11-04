import type { Metadata } from "next";
import { AddFriendScreen } from "@/components/friends/AddFriendScreen";
import { AppHeader } from "@/components/ui/AppHeader";
import { rpcAsAnon } from "@/lib/supabase/rest";
import type { PublicProfile } from "@/types/db";

type Params = { params: Promise<{ code: string }> };

/** Link preview: "Add Rahul on Tiktoe". */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const p = await rpcAsAnon<PublicProfile>("get_public_profile", { p_handle: code, p_recent: 1 });
  const title = p ? `Add ${p.player.name} on Tiktoe` : "Add a friend on Tiktoe";
  const description = "Become friends to see when they're online and challenge them to Tic-Tac-Toe.";
  return { title: { absolute: title }, description, openGraph: { title, description, url: `/add/${code}`, siteName: "Tiktoe" } };
}

export default async function AddFriendPage({ params }: Params) {
  const { code } = await params;
  return (
    <>
      <AppHeader />
      <main className="safe-x mx-auto flex w-full max-w-md flex-col pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-8">
        <AddFriendScreen code={code.toLowerCase()} />
      </main>
    </>
  );
}
