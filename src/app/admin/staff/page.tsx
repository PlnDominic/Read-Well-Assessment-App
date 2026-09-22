import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./InviteForm";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  reading_specialist: "Reading Specialist",
  administrator: "Administrator",
};

export default async function AdminStaffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect("/");

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, name, email, role")
    .eq("school_id", profile.school_id)
    .order("name");

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[26px] text-[var(--color-sage-deep)] m-0 mb-6">Staff</h1>

      <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] px-8 py-7.5 mb-6">
        <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4">
          Invite a staff member
        </div>
        <InviteForm />
      </div>

      <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] overflow-hidden">
        {(staff ?? []).map((s) => (
          <div
            key={s.id}
            className="px-6 py-4 border-b border-[var(--color-cream-divider)] last:border-b-0 flex items-center justify-between gap-3"
          >
            <div>
              <div className="font-extrabold text-[var(--color-sage-deep)] text-base">{s.name}</div>
              <div className="text-[13px] text-[var(--color-muted-light)]">{s.email}</div>
            </div>
            <span className="bg-[var(--color-sage-tint)] text-[var(--color-sage-dark)] text-xs font-bold px-3 py-1.5 rounded-full">
              {ROLE_LABELS[s.role] ?? s.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
