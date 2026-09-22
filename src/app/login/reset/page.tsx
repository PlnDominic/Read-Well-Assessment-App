import { AppShell } from "@/components/AppShell";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AppShell showTopBar={false}>
      <ResetPasswordForm />
    </AppShell>
  );
}
