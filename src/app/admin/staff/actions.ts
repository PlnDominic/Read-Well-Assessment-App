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

export async function updateStaffRole(formData: FormData) {
  const { profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;
  if (!id || !["teacher", "reading_specialist", "administrator"].includes(role)) {
    throw new Error("Invalid role");
  }
  if (id === profile.id) throw new Error("You can't change your own role");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", id)
    .eq("school_id", profile.school_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/staff");
}

/** Flips profiles.is_active (the app's own read model) and bans/unbans the
 * underlying Supabase Auth user (real enforcement at the auth layer) —
 * see supabase/migrations/0005_profiles_is_active.sql. */
export async function deactivateStaff(formData: FormData) {
  const { profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing staff id");
  if (id === profile.id) throw new Error("You can't deactivate your own account");

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(id, { ban_duration: "87600h" });
  if (banError) throw new Error(banError.message);

  const { error } = await admin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", id)
    .eq("school_id", profile.school_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/staff");
}

export async function reactivateStaff(formData: FormData) {
  const { profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing staff id");

  const admin = createAdminClient();
  const { error: unbanError } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (unbanError) throw new Error(unbanError.message);

  const { error } = await admin
    .from("profiles")
    .update({ is_active: true })
    .eq("id", id)
    .eq("school_id", profile.school_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/staff");
}

export interface ResetPasswordState {
  error: string | null;
  result: { email: string; tempPassword: string } | null;
}

export async function resetStaffPassword(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const { profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "");
  if (!id || !email) return { error: "Missing staff id", result: null };

  const admin = createAdminClient();

  // Confirm the target belongs to the caller's school before touching auth.
  const { data: target } = await admin.from("profiles").select("school_id").eq("id", id).single();
  if (!target || target.school_id !== profile.school_id) {
    return { error: "Staff member not found", result: null };
  }

  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(id, { password: tempPassword });
  if (error) return { error: error.message, result: null };

  return { error: null, result: { email, tempPassword } };
}
