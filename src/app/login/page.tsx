import { AppShell } from "@/components/AppShell";
import { LoginScreen } from "./LoginScreen";

export default function LoginPage() {
  return (
    <AppShell showTopBar={false}>
      <LoginScreen />
    </AppShell>
  );
}
