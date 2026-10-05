import { describe, expect, it } from "vitest";
import { NO_PROFILE_LOGIN, homePathForRole, pathForUnauthorizedProfile, type StaffRole } from "./staffRouting";

const ROLES: StaffRole[] = ["teacher", "reading_specialist", "administrator"];
// Which role each home page accepts (the page-level checks in src/app).
const HOME_ACCEPTS: Record<string, (role: StaffRole) => boolean> = {
  "/admin": (r) => r === "administrator",
  "/specialist": (r) => r === "reading_specialist",
  "/teacher": () => true,
};

describe("staff routing", () => {
  it.each(ROLES)("sends a %s to a home page that accepts them", (role) => {
    expect(HOME_ACCEPTS[homePathForRole(role)](role)).toBe(true);
  });

  it.each(ROLES)("redirects a %s on the wrong page straight to their own home, never back to /", (role) => {
    const target = pathForUnauthorizedProfile({ role });
    expect(target).not.toBe("/");
    expect(HOME_ACCEPTS[target](role)).toBe(true);
  });

  it("sends a missing profile to the login page's terminal no-profile state", () => {
    expect(pathForUnauthorizedProfile(null)).toBe(NO_PROFILE_LOGIN);
    expect(NO_PROFILE_LOGIN.startsWith("/login")).toBe(true);
  });
});
