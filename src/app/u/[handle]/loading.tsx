import { ProfileSkeleton } from "@/components/profile/PublicProfileView";

export default function Loading() {
  return (
    <main className="safe-x mx-auto flex w-full max-w-md flex-col pt-[calc(env(safe-area-inset-top)+5rem)] md:max-w-2xl">
      <ProfileSkeleton />
    </main>
  );
}
