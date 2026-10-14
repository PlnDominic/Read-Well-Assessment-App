import { redirect } from "next/navigation";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, summaryModel } from "@/lib/aiSummaryServer";
import { updateAiReports, updateDataRetention } from "./actions";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect(pathForUnauthorizedProfile(profile));

  const { data: school } = await supabase
    .from("schools")
    .select("data_retention_days, ai_reports_enabled")
    .eq("id", profile.school_id)
    .single();

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-ink)] m-0 mb-6">Settings</h1>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5">
        <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-4">Data retention</div>
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
            className="bg-[var(--color-orange)] text-[var(--color-on-orange)] border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-5 py-2.75 cursor-pointer"
          >
            Save
          </button>
        </form>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mt-5">
        <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-4">Summaries written with AI</div>
        <p className="text-[var(--color-muted)] text-sm mb-3 mt-0">
          When this is on, a teacher can ask for a short, plain-language summary of how a child did, with ideas for
          what to try next. It is only a draft: the teacher reads it, changes it and approves it before it appears on
          the PDF. The scores, bands and flags are never written by the AI.
        </p>
        <p className="text-[var(--color-muted)] text-sm mb-4 mt-0">
          To write a summary, the assessment&apos;s scores and what the child answered (letters chosen, words read,
          words spelled) are sent to Anthropic. <strong>No name, student ID, school or date is sent</strong>, and what
          the child typed for &ldquo;Write your name&rdquo; is left out. Make sure parents and guardians have been told
          before you turn this on.
        </p>
        {!aiConfigured() && (
          <p role="status" className="text-[var(--color-orange-dark)] font-bold text-sm mb-4 mt-0">
            This deployment has no AI key yet (ANTHROPIC_API_KEY), so summaries can&apos;t be written even when this is on.
          </p>
        )}
        <form action={updateAiReports} className="flex flex-wrap items-center gap-3.5">
          <label className="flex items-center gap-2.5 text-sm font-bold text-[var(--color-ink-soft)]">
            <input type="checkbox" name="aiReportsEnabled" defaultChecked={school?.ai_reports_enabled ?? false} className="size-5" />
            Let teachers draft summaries with AI
          </label>
          <button
            type="submit"
            className="bg-[var(--color-orange)] text-[var(--color-on-orange)] border-none rounded-full font-bold text-sm px-5 py-2.75 cursor-pointer"
          >
            Save
          </button>
        </form>
        <p className="text-xs text-[var(--color-muted)] mt-3 mb-0">Model: {summaryModel()}</p>
      </div>
    </div>
  );
}
