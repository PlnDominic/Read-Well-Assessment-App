import { timingSafeEqual } from "crypto";

/** Whether a request carries `Authorization: Bearer $CRON_SECRET`, compared in constant time. */
export function isCronAuthorized(request: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
