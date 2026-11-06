// Loads Supabase settings for the test scripts in scripts/ ONLY. The app (src/) never imports this
// (scripts/check-secrets.mjs fails the build if it tries).
//   .env.local       → NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (public)
//   .env.test.local  → SUPABASE_SERVICE_ROLE_KEY (secret, git-ignored, never on Vercel)
import fs from "node:fs";

function parse(file) {
  const url = new URL(`../../${file}`, import.meta.url);
  if (!fs.existsSync(url)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(url, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const [k, ...v] = l.split("=");
        return [k.trim(), v.join("=").trim()];
      }),
  );
}

export function loadTestEnv({ requireServiceKey = false } = {}) {
  const pub = parse(".env.local");
  const secret = parse(".env.test.local");
  const env = {
    url: pub.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: pub.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? pub.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceKey: secret.SUPABASE_SERVICE_ROLE_KEY || null,
  };
  if (!env.url || !env.anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / publishable key in .env.local");
  if (requireServiceKey && !env.serviceKey) {
    throw new Error(
      "This test needs SUPABASE_SERVICE_ROLE_KEY in .env.test.local (Supabase → Project Settings → API Keys → service_role / secret key).",
    );
  }
  return env;
}
