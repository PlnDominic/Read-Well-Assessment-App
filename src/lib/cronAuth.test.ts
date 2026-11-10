import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cronAuth";

const req = (authorization?: string) => new Request("https://x.test/api/cron/a", { headers: authorization ? { authorization } : {} });

describe("isCronAuthorized", () => {
  it("accepts the right bearer secret", () => {
    expect(isCronAuthorized(req("Bearer s3cret"), "s3cret")).toBe(true);
  });
  it("rejects a wrong, missing or differently sized secret", () => {
    expect(isCronAuthorized(req("Bearer nope!!"), "s3cret")).toBe(false);
    expect(isCronAuthorized(req("Bearer s3cret-and-more"), "s3cret")).toBe(false);
    expect(isCronAuthorized(req(), "s3cret")).toBe(false);
  });
  it("rejects everything when no secret is configured", () => {
    expect(isCronAuthorized(req("Bearer "), "")).toBe(false);
    expect(isCronAuthorized(req("Bearer undefined"), undefined)).toBe(false);
  });
});
