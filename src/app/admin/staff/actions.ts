"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/database.types";

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += alphabet[Math.floor(Math.random() * alphabet.length)];
  return pw;
}

export interface InviteStaffState {
  error: string | null;
  result: { email: string; tempPassword: string } | null;
}

/**
 * Creating a Supabase Auth user requires the service-role client — there is
 * no client-facing way to do it, by design (profiles has no insert policy;
 * see supabase/migrations/0002_rls.sql). requireAdmin() is the gate: it
 * confirms the caller is really an administrator, via their own RLS-scoped
 * session, before this ever reaches for the service-role client.
 */
export async function inviteStaff(
  _prevState: InviteStaffState,
  formData: FormData
): Promise<InviteStaffState> {
  const { profile } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "") as UserRole;
  if (!name || !email || !role) {
    return { error: "Name, email, and role are all required.", result: null };
  }
  if (!["teacher", "reading_specialist", "administrator"].includes(role)) {
    return { error: "Invalid role.", result: null };
  }

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create the account.", result: null };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    school_id: profile.school_id,
    name,
    email,
    role,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message, result: null };
  }

  revalidatePath("/admin/staff");
  return { error: null, result: { email, tempPassword } };
}
