import { AppShell } from "@/components/AppShell";
import { ForgotForm } from "./ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <AppShell showTopBar={false}>
      <ForgotForm />
    </AppShell>
  );
}
