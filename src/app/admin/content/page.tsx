import { redirect } from "next/navigation";
import Link from "next/link";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { createClient } from "@/lib/supabase/server";
import type { AssessmentItem } from "@/lib/database.types";
import { FORM_OPTIONS, formLabel, levelLabel, type AssessmentForm, type Delivery } from "@/lib/levels";
import { formForItems } from "@/lib/readwell/forms";
import { groupByPart } from "@/lib/gameItems";
import { MISSION_SIZE, partsFor } from "@/lib/gameParts";
import { ContentHeader, LevelPicker, StatusPill, cardClass, levelFromParam } from "./ContentHeader";

/**
 * Content → Assessments: for one level, which of its four forms are ready
 * to give, each way (with an adult, or as a game), with a way into the
 * game editor. Teachers can only start what's ready here.
 */
export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const LEVEL = levelFromParam((await searchParams).level);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect(pathForUnauthorizedProfile(profile));

  const { data: allActive } = await supabase
    .from("assessments")
    .select("level")
    .eq("is_active", true)
    .not("form", "is", null);
  const readyByLevel: Record<number, number> = {};
  for (const a of allActive ?? []) readyByLevel[a.level] = (readyByLevel[a.level] ?? 0) + 1;
  const levelNotes = Object.fromEntries(
    Object.entries(readyByLevel).map(([level, n]) => [level, `${n} ready`])
  ) as Record<number, string>;

  const { data: levelAssessments } = await supabase
    .from("assessments")
    .select("form, delivery, items, created_at")
    .eq("level", LEVEL)
    .eq("is_active", true)
    .not("form", "is", null);
  const find = (form: AssessmentForm, delivery: Delivery) =>
    (levelAssessments ?? []).find((a) => a.form === form && a.delivery === delivery);

  return (
    <div className="w-full max-w-[920px]">
      <ContentHeader
        tab="assessments"
        intro="Each level has four forms: A, B, C and the Final assessment. When teachers start an assessment, they pick the form and how it's given. They can only start what's ready below."
      />
      <LevelPicker level={LEVEL} basePath="/admin/content" notes={levelNotes} />

      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        <WayExplainer icon="🧑🏾‍🏫" title="With an adult">
          An adult sits with the child and marks each answer on the assessor screen, following the ReadWell guide.
          These come from the guide, so they can&apos;t be changed here.
        </WayExplainer>
        <WayExplainer icon="🎮" title="Game on a tablet">
          The child plays on their own with Sunny, who reads everything aloud. You build and edit these here.
        </WayExplainer>
      </div>

      <h2 className="font-heading font-bold text-lg text-[var(--color-ink)] m-0 mb-3">{levelLabel(LEVEL)} forms</h2>
      <div className="flex flex-col gap-4">
        {FORM_OPTIONS.map((form) => (
          <section key={form} className={`${cardClass} px-5 py-5 sm:px-7`} aria-labelledby={`form-${form}`}>
            <h3 id={`form-${form}`} className="font-heading font-bold text-base text-[var(--color-ink)] m-0 mb-3.5">
              {formLabel(form)}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <AdultCell items={find(form, "assessor")?.items ?? null} />
              <GameCell level={LEVEL} form={form} game={find(form, "game") ?? null} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function WayExplainer({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border-2 border-[var(--color-neutral-divider)] px-4 py-3.5">
      <span aria-hidden="true" className="text-2xl leading-none mt-0.5">
        {icon}
      </span>
      <div>
        <div className="font-bold text-sm text-[var(--color-ink)] mb-0.5">{title}</div>
        <p className="text-[13px] leading-relaxed text-[var(--color-body)] m-0">{children}</p>
      </div>
    </div>
  );
}

function CellShell({ title, ready, children }: { title: string; ready: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-[var(--color-neutral)] px-4 py-3.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">{title}</span>
        <StatusPill ready={ready}>{ready ? "Ready" : "Not yet"}</StatusPill>
      </div>
      {children}
    </div>
  );
}

function AdultCell({ items }: { items: AssessmentItem[] | null }) {
  if (!items) {
    return (
      <CellShell title="With an adult" ready={false}>
        <p className="text-sm text-[var(--color-body)] m-0">
          Not added yet. It&apos;s added by the ReadWell team once its guide is ready.
        </p>
      </CellShell>
    );
  }
  const form = formForItems(items);
  return (
    <CellShell title="With an adult" ready>
      <p className="text-sm text-[var(--color-ink)] font-bold m-0">
        {form ? `${items.length} items in ${form.parts.length} parts` : `${items.length} items`}
      </p>
      {form && (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-[var(--color-orange-dark)]">What&apos;s in it</summary>
          <ol className="m-0 mt-2 pl-5 text-[13px] text-[var(--color-body)] columns-1 sm:columns-2 gap-6">
            {form.parts.map((part) => (
              <li key={part.number}>{part.title}</li>
            ))}
          </ol>
        </details>
      )}
    </CellShell>
  );
}

function GameCell({
  level,
  form,
  game,
}: {
  level: number;
  form: AssessmentForm;
  game: { items: AssessmentItem[]; created_at: string } | null;
}) {
  const href = `/admin/content/game/${level}/${form}`;
  if (!game) {
    return (
      <CellShell title="Game on a tablet" ready={false}>
        <p className="text-sm text-[var(--color-body)] m-0">Not built yet.</p>
        <EditLink href={href}>Build the game</EditLink>
      </CellShell>
    );
  }
  const groups = groupByPart(game.items, partsFor(level));
  const byPart = !groups.some((g) => g.part === null);
  const missions = byPart
    ? groups.filter((g) => g.indexes.length > 0).length
    : Math.ceil(game.items.length / MISSION_SIZE);
  const count = (type: AssessmentItem["type"]) => game.items.filter((i) => i.type === type).length;
  const kinds = [
    [count("choice"), "tap"],
    [count("mic"), "read aloud"],
    [count("text"), "writing"],
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
  const updated = new Date(game.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <CellShell title="Game on a tablet" ready>
      <p className="text-sm text-[var(--color-ink)] font-bold m-0">
        {game.items.length} question{game.items.length === 1 ? "" : "s"} in {missions} mission{missions === 1 ? "" : "s"}
      </p>
      <ul className="m-0 p-0 list-none text-[13px] text-[var(--color-body)] flex flex-col gap-0.5">
        <li>{kinds}</li>
        <li>Last published {updated}</li>
      </ul>
      <EditLink href={href}>Edit the game</EditLink>
    </CellShell>
  );
}

function EditLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="self-start mt-1 inline-flex items-center gap-1.5 bg-[var(--color-orange)] text-[var(--color-on-orange)] no-underline rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-4 py-2"
    >
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}
