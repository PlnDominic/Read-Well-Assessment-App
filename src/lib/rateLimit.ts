import "server-only";
import { headers } from "next/headers";
import { Redis } from "@upstash/redis";

// Backed by Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are configured
// (works out of the box with Vercel's Upstash integration), so every
// serverless instance shares the same counters -- the in-memory fallback
// below only rate-limits per instance, so a determined attacker spread
// across many cold starts could get more attempts than the numbers
// suggest. Without those env vars set (local dev, or before a school's
// deployment has one), this silently falls back to the in-memory version;
// nothing else about the calling code needs to know which one is active.
const WINDOW_MS = 15 * 60 * 1000;
const WINDOW_SECONDS = WINDOW_MS / 1000;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();

function isRateLimitedInMemory(key: string, max: number): boolean {
  const now = Date.now();
  // Opportunistic cleanup so `memoryBuckets` doesn't grow unbounded across
  // a warm instance's lifetime.
  for (const [k, b] of memoryBuckets) if (now > b.resetAt) memoryBuckets.delete(k);

  const bucket = memoryBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    memoryBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (bucket.count >= max) return true;
  bucket.count += 1;
  return false;
}

/**
 * Fixed-window counter against Redis: INCR the key, and set its TTL only
 * on the first hit in a window so the count and expiry stay in sync. This
 * is the same fixed-window semantics as isRateLimitedInMemory (not a
 * sliding window), kept deliberately simple since `max` varies per call
 * site -- a library like @upstash/ratelimit expects one fixed limit per
 * instance, which doesn't fit callers that pass different `max` values
 * for the same key prefix (e.g. per-IP vs per-email).
 */
async function isRateLimitedInRedis(key: string, max: number): Promise<boolean> {
  const count = await redis!.incr(`ratelimit:${key}`);
  if (count === 1) await redis!.expire(`ratelimit:${key}`, WINDOW_SECONDS);
  return count > max;
}

/** Returns true if `key` has made `max` or more attempts within the last
 * 15 minutes (and doesn't count this call as an attempt); otherwise
 * records this attempt and returns false. */
export async function isRateLimited(key: string, max: number): Promise<boolean> {
  if (!redis) return isRateLimitedInMemory(key, max);

  try {
    return await isRateLimitedInRedis(key, max);
  } catch (err) {
    // Upstash hiccup: fail open to the in-memory limiter rather than
    // blocking every sign-in/join attempt because a third-party store had
    // a bad moment.
    console.error("[rateLimit] Redis request failed, falling back to in-memory", err);
    return isRateLimitedInMemory(key, max);
  }
}

/** Best-effort caller IP from the headers Vercel (or any reverse proxy)
 * sets; "unknown" if absent, which still rate-limits fine (it just means
 * every unknown-IP caller shares one bucket). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
