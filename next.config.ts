import type { NextConfig } from "next";

// The browser talks to Supabase directly for auth (sign-in/out, password
// reset -- see src/lib/supabase/client.ts), so connect-src has to allow that
// origin specifically rather than falling back to 'self' alone.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// script-src/style-src need 'unsafe-inline' because the App Router streams
// hydration data via inline <script> tags with no nonce wired through
// proxy.ts -- that's the standard tradeoff of a static header (vs. a
// per-request nonce) and still leaves this as real defense-in-depth against
// loading any *external* script/resource.
const csp = [
  "default-src 'self'",
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  "img-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Belt-and-suspenders with frame-ancestors above, for browsers that only
  // understand the older header.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self) because the student assessment runner uses the Web
  // Speech API for fluency scoring (src/app/student/session/[sessionId]/StudentAssessmentRunner.tsx).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  env: {
    // Versions the service worker (see public/sw.js) so each deploy replaces
    // the previous build's offline cache.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()),
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
