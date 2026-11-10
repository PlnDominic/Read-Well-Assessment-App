import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "./logger";

describe("logError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("writes one JSON line with the scope and message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await logError("test:one", new Error("boom"), { path: "/x" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", scope: "test:one", message: "boom", path: "/x" });
  });

  it("posts to the alert webhook once per scope, not on every error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "https://hooks.example/abc");
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await logError("test:throttle", new Error("first"));
    await logError("test:throttle", new Error("second"));
    await logError("test:other", new Error("third"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("never throws if the webhook is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "https://hooks.example/down");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    await expect(logError("test:down", new Error("x"))).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
