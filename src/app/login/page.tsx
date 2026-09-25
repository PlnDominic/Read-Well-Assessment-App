import { AppShell } from "@/components/AppShell";
import { LoginScreen } from "./LoginScreen";
import { StaffOnboarding } from "./StaffOnboarding";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deactivated?: string }>;
}) {
  const { deactivated } = await searchParams;

  return (
    <AppShell showTopBar={false}>
      {deactivated && (
        <p className="w-full max-w-[460px] mx-auto -mb-4 mt-[4vh] text-center text-[var(--color-orange-dark)] text-sm">
          That account has been deactivated. Contact your school administrator.
        </p>
      )}
      <LoginScreen />
      <StaffOnboarding />
    </AppShell>
  );
}
