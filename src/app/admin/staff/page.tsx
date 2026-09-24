import { redirect } from "next/navigation";
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
  if (!profile || profile.role !== "administrator") redirect("/");

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, name, email, role, is_active")
    .eq("school_id", profile.school_id)
    .order("name");

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-sage-deep)] m-0 mb-6">Staff</h1>

      <div className="bg-white rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-6">
        <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4">
          Invite a staff member
        </div>
        <InviteForm />
      </div>

      <div className="bg-white rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden">
        {(staff ?? []).map((s) => (
          <StaffRow key={s.id} staffMember={s} isSelf={s.id === profile.id} />
        ))}
      </div>
    </div>
  );
}
