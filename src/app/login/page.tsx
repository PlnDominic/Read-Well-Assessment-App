import { AppShell } from "@/components/AppShell";
import { LoginScreen } from "./LoginScreen";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deactivated?: string }>;
}) {
  const { deactivated } = await searchParams;

  return (
    <AppShell showTopBar={false}>
      {deactivated && (
        <p className="w-full max-w-[460px] mx-auto -mb-4 mt-[4vh] text-center text-[var(--color-terracotta-dark)] text-sm">
          That account has been deactivated. Contact your school administrator.
        </p>
      )}
      <LoginScreen />
    </AppShell>
  );
}
