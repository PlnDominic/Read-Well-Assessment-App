import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Versions the service worker (see public/sw.js) so each deploy replaces
    // the previous build's offline cache.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()),
  },
};

export default nextConfig;
