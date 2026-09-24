import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateDataRetention } from "./actions";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect("/");

  const { data: school } = await supabase
    .from("schools")
    .select("data_retention_days")
    .eq("id", profile.school_id)
    .single();

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-sage-deep)] m-0 mb-6">Settings</h1>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5">
        <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4">Data retention</div>
        <p className="text-[var(--color-muted)] text-sm mb-4 mt-0">
          Automatically deletes completed assessment sessions (and their responses, results, and reports) older
          than this many days. A daily job checks this setting; leave it blank to keep data indefinitely.
        </p>
        <form action={updateDataRetention} className="flex flex-wrap items-end gap-3.5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold text-[var(--color-muted)] text-xs uppercase">
              Days to keep completed assessments
            </span>
            <input
              name="dataRetentionDays"
              type="number"
              min={1}
              step={1}
              defaultValue={school?.data_retention_days ?? ""}
              placeholder="Indefinite"
              className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 w-[220px]"
            />
          </label>
          <button
            type="submit"
            className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-5 py-2.75 cursor-pointer"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
