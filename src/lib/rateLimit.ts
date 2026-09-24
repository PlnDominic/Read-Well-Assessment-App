import "server-only";
import { headers } from "next/headers";

// In-memory, per-serverless-instance rate limiting -- not distributed, so a
// determined attacker spread across many cold-started instances could get
// more attempts than these numbers suggest. Good enough to stop casual
// password guessing without standing up an external store (Redis/Vercel
// KV); move to one of those if this ever needs to hold up against real
// attack traffic.
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Returns true if `key` has made `max` or more attempts within the last
 * 15 minutes (and doesn't count this call as an attempt); otherwise
 * records this attempt and returns false. */
export function isRateLimited(key: string, max: number): boolean {
  const now = Date.now();
  // Opportunistic cleanup so `buckets` doesn't grow unbounded across a
  // warm instance's lifetime.
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (bucket.count >= max) return true;
  bucket.count += 1;
  return false;
}

/** Best-effort caller IP from the headers Vercel (or any reverse proxy)
 * sets; "unknown" if absent, which still rate-limits fine (it just means
 * every unknown-IP caller shares one bucket). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
