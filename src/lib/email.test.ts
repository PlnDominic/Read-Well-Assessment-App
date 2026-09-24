import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl, escapeHtml, sendEmail } from "./email";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;"
    );
  });
});

describe("appUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is unset", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    try {
      expect(appUrl("/admin")).toBe("http://localhost:3000/admin");
    } finally {
      if (original !== undefined) process.env.NEXT_PUBLIC_APP_URL = original;
    }
  });

  it("uses the configured base URL, trimming a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.org/");
    expect(appUrl("/admin")).toBe("https://app.example.org/admin");
  });
});

describe("sendEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("no-ops without throwing when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await sendEmail({ to: "a@example.org", subject: "Hi", html: "<p>hi</p>" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to Resend when a key is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    await sendEmail({ to: "a@example.org", subject: "Hi", html: "<p>hi</p>" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("swallows a network failure instead of throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    await expect(
      sendEmail({ to: "a@example.org", subject: "Hi", html: "<p>hi</p>" })
    ).resolves.toBeUndefined();
  });
});
