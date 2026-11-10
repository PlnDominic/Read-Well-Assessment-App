import "server-only";

/**
 * Server-side error logging. Writes one JSON line per error (searchable in
 * the host's logs) and, when OPS_ALERT_WEBHOOK_URL is set, posts a short
 * message to it (a Slack or Discord incoming webhook, for example) so
 * someone is told without having to open the logs. Alerts are limited to
 * one per scope per few minutes so a failing loop can't flood a channel.
 *
 * Never put a child's name, an answer, an email or a token in `meta`.
 */
const ALERT_EVERY_MS = 5 * 60 * 1000;
const lastAlert = new Map<string, number>();

function describe(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack?.split("\n").slice(0, 6).join("\n") };
  if (err && typeof err === "object" && "message" in err) return { message: String((err as { message: unknown }).message) };
  return { message: String(err) };
}

export async function logError(scope: string, err: unknown, meta: Record<string, string | number | boolean | null> = {}): Promise<void> {
  const { message, stack } = describe(err);
  console.error(JSON.stringify({ level: "error", scope, message, ...meta, stack, at: new Date().toISOString() }));

  const url = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!url) return;
  const now = Date.now();
  if (now - (lastAlert.get(scope) ?? 0) < ALERT_EVERY_MS) return;
  lastAlert.set(scope, now);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // "text" is Slack's field, "content" is Discord's.
      body: JSON.stringify({ text: `Read Well error in ${scope}: ${message}`.slice(0, 500), content: `Read Well error in ${scope}: ${message}`.slice(0, 500) }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* An alert that can't be sent must never break the request it came from. */
  }
}
