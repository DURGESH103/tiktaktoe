import type { Metadata } from "next";
import { Suspense } from "react";
import { FriendsScreen } from "@/components/friends/FriendsScreen";
import { AppHeader } from "@/components/ui/AppHeader";

export const metadata: Metadata = { title: "Friends" };

export default function FriendsPage() {
  return (
    <>
      <AppHeader />
      <main className="safe-x mx-auto flex w-full max-w-md flex-col pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4 md:max-w-2xl">
        {/* useSearchParams (the ?tab= switch) needs a Suspense boundary. */}
        <Suspense>
          <FriendsScreen />
        </Suspense>
      </main>
    </>
  );
}
