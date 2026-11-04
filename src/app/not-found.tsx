import { ErrorState } from "@/components/ui/ErrorState";

export default function NotFound() {
  return (
    <main className="safe-x mx-auto flex min-h-dvh max-w-md items-center">
      <ErrorState icon="🧭" title="Page not found" body="That page doesn't exist." actions={[{ label: "Back home", href: "/" }]} />
    </main>
  );
}
