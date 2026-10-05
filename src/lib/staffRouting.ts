/**
 * The one place that decides where a signed-in staff member belongs.
 *
 * Every auth redirect in the app goes through these, and they are built so
 * no sequence of redirects can cycle:
 *
 * - /login is terminal. It only redirects away when the user is signed in
 *   AND has an active profile, and then straight to that profile's home.
 *   Anything it can't resolve (no profile, unreadable profile, deactivated)
 *   renders the login page with a message instead of redirecting.
 * - A role-gated page that gets the wrong role redirects straight to the
 *   right home for that role (never to "/", which would have to re-derive
 *   it), and each home accepts exactly the role that routes to it.
 * - A page that can't read the profile at all sends the user to
 *   NO_PROFILE_LOGIN, which (per the first rule) stops there.
 * - The middleware (src/proxy.ts) never redirects a signed-in user.
 *
 * The infinite redirect loop this replaced came from those decisions being
 * made separately in the middleware, "/", /login and each page, with
 * different queries and fallbacks that pointed at each other.
 */

export type StaffRole = "teacher" | "reading_specialist" | "administrator";

export const NO_PROFILE_LOGIN = "/login?error=no_profile";

export function homePathForRole(role: StaffRole): "/admin" | "/specialist" | "/teacher" {
  if (role === "administrator") return "/admin";
  if (role === "reading_specialist") return "/specialist";
  return "/teacher";
}

/** Where a page should send someone who isn't allowed on it. */
export function pathForUnauthorizedProfile(profile: { role: StaffRole } | null | undefined): string {
  return profile ? homePathForRole(profile.role) : NO_PROFILE_LOGIN;
}
