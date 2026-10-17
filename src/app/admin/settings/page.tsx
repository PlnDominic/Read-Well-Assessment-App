import { redirect } from "next/navigation";
import { Card, PageHeader, mainButton } from "@/components/PageHeader";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, summaryDestination, summaryModel } from "@/lib/aiSummaryServer";
import { updateAiReports, updateDataRetention } from "./actions";

const input = "border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 bg-[var(--color-surface)] text-[var(--color-ink)]";

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

  const destination = summaryDestination();
  const ready = aiConfigured();

  return (
    <div className="w-full max-w-[720px]">
      <PageHeader title="Settings" />

      <Card
        title="AI summaries"
        hint="Teachers can ask for a short written summary of how a child did, and you can ask for one for the school or a class. A person always reads and approves it first."
      >
        <form action={updateAiReports} className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
            <input type="checkbox" name="aiReportsEnabled" defaultChecked={school?.ai_reports_enabled ?? false} className="size-5" />
            Turn on AI summaries
          </label>
          <button type="submit" className={mainButton}>
            Save
          </button>
        </form>

        {!ready ? (
          <p role="status" className="text-[var(--color-orange-dark)] font-bold text-sm mt-4 mb-0">
            Not set up yet. Ask whoever looks after the app to add the AI settings.
          </p>
        ) : (
          <p className="text-[var(--color-muted)] text-sm mt-4 mb-0">
            Written by {summaryModel()} · {destination.local ? "runs on your own network" : destination.host}
          </p>
        )}
        {ready && destination.provider === "openai-compatible" && !destination.local && (
          <p role="status" className="text-[var(--color-orange-dark)] font-bold text-sm mt-2 mb-0">
            This is an outside service. Check its terms before you turn it on.
          </p>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer font-bold text-sm text-[var(--color-orange-dark)]">What is sent?</summary>
          <ul className="text-sm text-[var(--color-body)] leading-relaxed mt-2 mb-0 pl-5">
            <li>For a child: the scores and what the child answered.</li>
            <li>For the school or a class: only totals, never a child&apos;s answers.</li>
            <li>Never a child&apos;s name or ID, or the school, teacher or dates.</li>
            <li>Tell parents before you turn this on.</li>
          </ul>
        </details>
      </Card>

      <Card title="Keep data" hint="Finished assessments are deleted after this many days. Leave it blank to keep them for ever.">
        <form action={updateDataRetention} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
            Days
            <input
              name="dataRetentionDays"
              type="number"
              min={1}
              step={1}
              defaultValue={school?.data_retention_days ?? ""}
              placeholder="Keep for ever"
              className={`${input} w-[180px]`}
            />
          </label>
          <button type="submit" className={mainButton}>
            Save
          </button>
        </form>
      </Card>
    </div>
  );
}
