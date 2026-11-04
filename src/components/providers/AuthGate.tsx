"use client";

import { usePathname } from "next/navigation";
import { OnboardingSheet } from "@/components/onboarding/OnboardingSheet";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "./AuthProvider";
import { SocialProvider } from "./SocialProvider";

/** Signs the visitor in anonymously and asks for a name/avatar before showing the app. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, error, player, retry } = useAuth();
  // Shared profile links are viewable before picking a name; everything else needs a profile.
  const isPublicPage = usePathname()?.startsWith("/u/") ?? false;

  if (status === "loading") {
    return (
      <main className="safe-x mx-auto flex min-h-dvh max-w-md flex-col gap-4 pt-[calc(env(safe-area-inset-top)+5rem)]" aria-busy>
        <span className="sr-only">Loading…</span>
        <Skeleton className="mx-auto h-12 w-40" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="safe-x mx-auto flex min-h-dvh max-w-md items-center">
        <ErrorState
          icon="🔌"
          title="Couldn't connect"
          body={error ?? "Please check your connection and try again."}
          actions={[{ label: "Try again", onClick: retry }]}
        />
      </main>
    );
  }

  if (!player && !isPublicPage) return <OnboardingSheet />;

  // Signed-in players get the friends layer (presence, requests, challenges); visitors on a public profile don't.
  return player ? <SocialProvider>{children}</SocialProvider> : <>{children}</>;
}
