/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a production build go to a separate folder (NEXT_DIST_DIR=.next-build) without disturbing a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The floating "N" dev badge sat on top of the chat's emoji button on phones.
  devIndicators: false,
  env: {
    // Identifies this deployment; the app compares it with /api/version to offer an update.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`,
  },
  async headers() {
    // The service worker must always be re-checked, never served from a cache.
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
};

export default nextConfig;
