import "server-only";

const RESEND_API_URL = "https://api.resend.com/emails";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/** Minimal HTML-entity escaping for values (student/teacher names) that
 * come from user-entered data before they're interpolated into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Best-effort transactional email via Resend's HTTP API -- a single POST,
 * so this doesn't need the SDK as a dependency. No-ops (logging a warning)
 * when RESEND_API_KEY isn't configured, so report generation still
 * completes and the in-app notification still lands even where email
 * hasn't been set up (e.g. local dev, or before the school configures it).
 * Failures are swallowed rather than thrown for the same reason: an email
 * provider hiccup shouldn't fail the report/notification it's attached to.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set; skipping email to ${to}: "${subject}"`);
    return;
  }
  const from = process.env.RESEND_FROM_EMAIL ?? "Read Well <notifications@resend.dev>";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`[email] Resend rejected email to ${to}: ${res.status} ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.error(`[email] Failed to send to ${to}`, err);
  }
}

/** Absolute app URL for links inside emails (headers()-based host detection,
 * used elsewhere for the password-reset link, isn't available here since
 * report generation runs from after() callbacks / background contexts). */
export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}
