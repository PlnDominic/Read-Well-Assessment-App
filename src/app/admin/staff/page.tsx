import { redirect } from "next/navigation";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./InviteForm";
import { StaffRow } from "./StaffRow";

export default async function AdminStaffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id, role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect(pathForUnauthorizedProfile(profile));

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, name, email, role, is_active")
    .eq("school_id", profile.school_id)
    .order("name");

  return (
    <div className="w-full max-w-[920px]">
      <PageHeader title="Staff" subtitle="Teachers, specialists and administrators." />

      <details className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-6 py-5 sm:px-8 mb-6">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-[var(--color-orange)] px-5 py-2.5 text-sm font-bold text-[var(--color-on-orange)] [&::-webkit-details-marker]:hidden">+ Invite someone</summary>
        <div className="mt-5">
          <InviteForm />
        </div>
      </details>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden">
        {(staff ?? []).map((s) => (
          <StaffRow key={s.id} staffMember={s} isSelf={s.id === profile.id} />
        ))}
      </div>
    </div>
  );
}
