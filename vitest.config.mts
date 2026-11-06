import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Each database test file boots its own Postgres (PGlite) and applies every migration, which can
  // take longer than the default 10s when all files start at once.
  test: { include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts"], environment: "node", hookTimeout: 60_000 },
});
