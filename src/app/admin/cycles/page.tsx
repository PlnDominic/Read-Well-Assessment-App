import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startNewCycle } from "./actions";

export default async function AdminCyclesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect("/");

  const { data: cycles } = await supabase
    .from("assessment_cycles")
    .select("id, name, starts_at, is_current")
    .eq("school_id", profile.school_id)
    .order("starts_at", { ascending: false });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-sage-deep)] m-0 mb-6">
        Assessment Cycles
      </h1>

      <div className="bg-white rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-6">
        <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4">
          Start a new cycle
        </div>
        <p className="text-[var(--color-muted)] text-sm mb-4 mt-0">
          Closes the current cycle and starts a fresh one. New teacher-initiated assessments will be recorded
          against the new cycle; the school-wide report continues to reflect whichever cycle is current.
        </p>
        <form action={startNewCycle} className="flex flex-wrap items-end gap-3.5">
          <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[200px]">
            <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Name</span>
            <input
              name="name"
              placeholder="e.g. Winter Reading Assessment Cycle"
              required
              className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Starts</span>
            <input
              name="startsAt"
              type="date"
              defaultValue={today}
              required
              className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5"
            />
          </label>
          <button
            type="submit"
            className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-5 py-2.75 cursor-pointer"
          >
            Start cycle
          </button>
        </form>
      </div>

      <div className="bg-white rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden">
        {(cycles ?? []).length === 0 && (
          <div className="px-6 py-8 text-[var(--color-muted)] text-center">No cycles yet.</div>
        )}
        {(cycles ?? []).map((c) => (
          <div
            key={c.id}
            className="px-6 py-4 border-b border-[var(--color-neutral-divider)] last:border-b-0 flex items-center justify-between gap-3"
          >
            <div>
              <div className="font-extrabold text-[var(--color-sage-deep)] text-base">{c.name}</div>
              <div className="text-[13px] text-[var(--color-muted-light)]">Starts {c.starts_at}</div>
            </div>
            {c.is_current && (
              <span className="bg-[var(--color-sage-tint)] text-[var(--color-sage-dark)] text-xs font-bold px-3 py-1.5 rounded-full">
                Current
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
