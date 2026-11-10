import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "../reset/ResetPasswordForm";

// Where someone lands after signing in with a temporary password an
// administrator gave them (set by the invite and reset actions; enforced in
// src/proxy.ts). It needs the session they just signed in with.
export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell showTopBar={false}>
      <ResetPasswordForm forced />
    </AppShell>
  );
}
