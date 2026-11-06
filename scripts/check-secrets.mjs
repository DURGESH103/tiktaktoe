// Fails the build (npm run build → prebuild) and `npm test` if app code could ever touch the
// test-only service role key. Only the e2e scripts in scripts/ may read .env.test.local.
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src", "public"];
const FORBIDDEN = [
  { re: /SUPABASE_SERVICE_ROLE_KEY/, why: "the service role key variable" },
  { re: /service[_-]?role/i, why: "a service role reference" },
  { re: /sb_secret_/, why: "a Supabase secret key" },
  { re: /\.env\.test/, why: "the test-only env file" },
  { re: /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/, why: "a secret exposed through NEXT_PUBLIC_" },
];

const hits = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(m?[jt]sx?|json|css|html)$/.test(entry.name)) {
      const lines = fs.readFileSync(p, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const f of FORBIDDEN) if (f.re.test(line)) hits.push(`${p}:${i + 1}  ${f.why}`);
      });
    }
  }
}
for (const root of ROOTS) if (fs.existsSync(root)) walk(root);

if (hits.length) {
  console.error("✗ Secret guard: app code must never use the test-only service role key.\n" + hits.map((h) => "  " + h).join("\n"));
  process.exit(1);
}
console.log("✓ Secret guard: no service role key references in src/ or public/");
