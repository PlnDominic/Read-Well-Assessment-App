import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LogoutButton } from "@/components/LogoutButton";
import { createClient } from "@/lib/supabase/server";
import { homePathForRole } from "@/lib/staffRouting";
import { LoginScreen } from "./LoginScreen";
import { StaffOnboarding } from "./StaffOnboarding";

/**
 * Terminal page for auth routing (see src/lib/staffRouting.ts): it leaves
 * only for a signed-in user with an active profile, straight to that
 * profile's home. Every other state renders here, so nothing that redirects
 * to /login can be bounced back out.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deactivated?: string; error?: string }>;
}) {
  const { deactivated, error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let signedInWithoutProfile = false;
  let signedInButDeactivated = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
    if (profile?.is_active) redirect(homePathForRole(profile.role));
    if (profile) signedInButDeactivated = true;
    else signedInWithoutProfile = true;
  }

  const message =
    deactivated || signedInButDeactivated
      ? "That account has been deactivated. Contact your school administrator."
      : signedInWithoutProfile || error === "no_profile"
        ? "You're signed in, but no staff profile is linked to this account. Ask your school administrator to finish setting it up, or sign in with a different account."
        : null;

  return (
    <AppShell showTopBar={false}>
      {message && (
        <div className="w-full max-w-[460px] mx-auto -mb-4 mt-[4vh] text-center">
          <p role="alert" className="text-[var(--color-orange-dark)] text-sm m-0">
            {message}
          </p>
          {user && (
            <div className="mt-3">
              <LogoutButton />
            </div>
          )}
        </div>
      )}
      <LoginScreen />
      <StaffOnboarding />
    </AppShell>
  );
}
