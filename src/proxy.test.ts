import { describe, expect, it } from "vitest";
import { config } from "./proxy";

/**
 * The proxy signs people in or sends them to /login, on every path its
 * matcher covers. Students aren't signed in, so the static files their
 * device needs must be outside it, or they get the login page instead of
 * the file (a redirect, which silently broke Sunny's voice and the sounds).
 */
const matches = (pathname: string) => {
  // Next reads the matcher as "/(<regex>)": rebuild the regex to try paths against it.
  const group = config.matcher[0].slice(2, -1);
  return new RegExp(`^/${group}$`).test(pathname);
};

describe("proxy matcher", () => {
  it("lets a signed-out student's device load Sunny's voice and sounds, pictures and moods", () => {
    for (const path of [
      "/voice/197f42bba72ffe.mp3",
      "/sounds/tap.mp3",
      "/sunny/sunny-wave.webp",
      "/sunny.png",
      "/pictures/1f410.svg",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("still guards the app's pages and API", () => {
    for (const path of ["/", "/teacher", "/admin/content", "/api/reports/class", "/student/session/abc"]) {
      expect(matches(path), path).toBe(true);
    }
  });
});
