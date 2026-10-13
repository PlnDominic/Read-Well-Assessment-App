"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AssessmentItem } from "@/lib/database.types";
import { formLabel, levelLabel, type AssessmentForm } from "@/lib/levels";
import { groupByPart, nextItemId, validateGameItems, type GameItemType, type PartGroup } from "@/lib/gameItems";
import { MISSION_SIZE, type Part } from "@/lib/gameParts";
import { saveAssessmentItems } from "../../../actions";
import { QuestionEditor, type SkillArea } from "./QuestionEditor";
import { StatusPill, cardClass } from "../../../ContentHeader";

const KIND_LABEL: Record<string, string> = { choice: "👆 Tap", mic: "🎤 Read", text: "✏️ Write" };
/** Above this many questions, missions start folded so the page isn't a wall of rows. */
const FOLD_OVER = 24;
const OTHER = "other";

const snapshot = (items: AssessmentItem[]) => JSON.stringify(items);

/**
 * Builds or edits one form's game: its questions grouped into the missions
 * the child will play, one question open at a time with a preview, and a
 * publish bar that saves the lot as a new version. Nothing is saved until
 * Publish, and leaving with unpublished changes asks first.
 */
export function GameEditor({
  level,
  form,
  parts,
  initialItems,
  publishedAt,
  skillAreas,
  copySources,
}: {
  level: number;
  form: AssessmentForm;
  parts: Part[];
  initialItems: AssessmentItem[];
  publishedAt: string | null;
  skillAreas: SkillArea[];
  copySources: { form: AssessmentForm; items: AssessmentItem[] }[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [baseline, setBaseline] = useState(() => snapshot(initialItems));
  const [openId, setOpenId] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [folded, setFolded] = useState<Set<string>>(() =>
    initialItems.length > FOLD_OVER
      ? new Set(groupByPart(initialItems, parts).filter((g) => g.indexes.length > 0).map(groupKey))
      : new Set()
  );

  const dirty = snapshot(items) !== baseline;
  const groups = useMemo(() => groupByPart(items, parts), [items, parts]);
  const numberOf = useMemo(() => {
    const numbers = new Map<number, number>();
    groups.flatMap((g) => g.indexes).forEach((index, n) => numbers.set(index, n + 1));
    return numbers;
  }, [groups]);
  const problems = useMemo(() => validateGameItems(items), [items]);
  const problemsAt = (index: number) => (attempted ? problems.filter((p) => p.index === index).map((p) => p.message) : []);
  const unplaced = groups.some((g) => g.part === null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Bring the open question into view: after opening it, and after a
  // mission change moves it elsewhere in the list.
  useEffect(() => {
    if (openId) document.getElementById(`q-${openId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openId]);

  function edit(next: (prev: AssessmentItem[]) => AssessmentItem[]) {
    setStatus(null);
    setItems(next);
  }

  function open(index: number) {
    const item = items[index];
    const group = groups.find((g) => g.indexes.includes(index));
    if (group) setFolded((prev) => withoutKey(prev, groupKey(group)));
    setOpenId(item.id);
  }

  function update(index: number, patch: Partial<AssessmentItem>) {
    edit((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  // The id's prefix is what puts a question in a mission, so moving it
  // gives it the next id in its new mission, at the end of that mission.
  function changePart(index: number, code: string) {
    const id = nextItemId(items, code);
    const moved = { ...items[index], id };
    edit((prev) => [...prev.filter((_, i) => i !== index), moved]);
    setOpenId(id);
  }

  function move(index: number, direction: -1 | 1) {
    const group = groups.find((g) => g.indexes.includes(index));
    const other = group?.indexes[group.indexes.indexOf(index) + direction];
    if (other === undefined) return;
    edit((prev) => prev.map((it, i) => (i === index ? prev[other] : i === other ? prev[index] : it)));
  }

  function add(group: PartGroup) {
    const inGroup = group.indexes.map((i) => items[i]);
    const type = mostCommon(inGroup.map((i) => i.type)) ?? "choice";
    const skillAreaKey = mostCommon(inGroup.map((i) => i.skillAreaKey)) ?? mostCommon(items.map((i) => i.skillAreaKey)) ?? skillAreas[0]?.key ?? "";
    const id = nextItemId(items, group.part?.code ?? "Q");
    edit((prev) => [...prev, blankItem(id, type as GameItemType, skillAreaKey)]);
    setFolded((prev) => withoutKey(prev, groupKey(group)));
    setOpenId(id);
  }

  function duplicate(index: number) {
    const source = items[index];
    const code = groups.find((g) => g.indexes.includes(index))?.part?.code ?? "Q";
    const copy = { ...structuredClone(source), id: nextItemId(items, code) };
    edit((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]);
    setOpenId(copy.id);
  }

  function remove(index: number) {
    if (!window.confirm(`Delete question ${numberOf.get(index)}? You can still discard your changes before publishing.`)) return;
    if (items[index].id === openId) setOpenId(null);
    edit((prev) => prev.filter((_, i) => i !== index));
  }

  function discard() {
    if (!window.confirm("Throw away every change since you last published?")) return;
    setItems(JSON.parse(baseline) as AssessmentItem[]);
    setOpenId(null);
    setAttempted(false);
    setStatus(null);
  }

  function publish() {
    setAttempted(true);
    if (problems.length > 0) {
      const count = new Set(problems.map((p) => p.index)).size;
      setStatus({
        ok: false,
        message:
          problems[0].index < 0
            ? problems[0].message
            : `${count} question${count === 1 ? " needs" : "s need"} fixing before you can publish.`,
      });
      if (problems[0].index >= 0) open(problems[0].index);
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveAssessmentItems(level, form, items);
        if (!result.ok) {
          setStatus({ ok: false, message: result.message });
          return;
        }
        setBaseline(snapshot(items));
        setAttempted(false);
        setStatus({ ok: true, message: "Published. Children get these questions from now on." });
        router.refresh();
      } catch {
        setStatus({ ok: false, message: "Couldn't publish. Check your connection and try again." });
      }
    });
  }

  const backHref = `/admin/content?level=${level}`;
  const published = publishedAt
    ? new Date(publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const allFolded = groups.every((g) => g.indexes.length === 0 || folded.has(groupKey(g)));

  return (
    <div>
      <Link
        href={backHref}
        onClick={(e) => {
          if (dirty && !window.confirm("Leave without publishing? Your changes will be lost.")) e.preventDefault();
        }}
        className="inline-block mb-3 text-sm font-bold text-[var(--color-orange-dark)] no-underline"
      >
        ← {levelLabel(level)} assessments
      </Link>
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-[var(--color-ink)] m-0">
          {levelLabel(level)} · {formLabel(form)} game
        </h1>
        <StatusPill ready={!!published}>{published ? "Ready" : "Not published"}</StatusPill>
      </div>
      <p className="text-sm text-[var(--color-body)] m-0 mb-5">
        {published
          ? `Last published ${published}. This is what children get when a teacher starts ${formLabel(form)} as a game.`
          : "Teachers can't start this game until you publish it."}
      </p>
      <p className="text-sm text-[var(--color-muted)] m-0 mb-5 -mt-3">
        Children are never told whether an answer is right or wrong. Every answer earns a star, and the game moves on.
      </p>

      {items.length === 0 && (
        <section className={`${cardClass} px-5 py-5 sm:px-7 mb-5`}>
          <h2 className="font-heading font-bold text-base text-[var(--color-ink)] m-0 mb-1">Start building</h2>
          <p className="text-sm text-[var(--color-body)] m-0 mb-3">
            Add questions to the missions below
            {copySources.length > 0 ? ", or start from a copy of another form's game and change the words." : "."}
          </p>
          {copySources.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {copySources.map((source) => (
                <button
                  key={source.form}
                  type="button"
                  onClick={() => edit(() => structuredClone(source.items))}
                  className="rounded-full border-2 border-[var(--color-orange)] bg-transparent px-4 py-2 text-sm font-bold text-[var(--color-orange-dark)] cursor-pointer"
                >
                  Copy {formLabel(source.form)}&apos;s game ({source.items.length} questions)
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="font-heading font-bold text-lg text-[var(--color-ink)] m-0">Missions and questions</h2>
          <p className="text-sm text-[var(--color-muted)] m-0">
            {items.length} question{items.length === 1 ? "" : "s"}. Children play the missions in this order. Click a
            question to change it.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setFolded(allFolded ? new Set() : new Set(groups.filter((g) => g.indexes.length > 0).map(groupKey)))}
            className="border-0 bg-transparent p-0 text-sm font-bold text-[var(--color-orange-dark)] cursor-pointer"
          >
            {allFolded ? "Show all questions" : "Fold all missions"}
          </button>
        )}
      </div>

      {unplaced && (
        <p className="rounded-xl border border-[var(--color-orange-tint-border)] bg-[var(--color-orange-tint)] px-4 py-3 text-sm text-[var(--color-orange-dark)] m-0 mb-3">
          Some questions aren&apos;t in a mission yet (see the end of the list). Open each and pick its mission. Until
          every question has one, the game splits the questions into groups of {MISSION_SIZE} instead.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {groups.map((group) => {
          const key = groupKey(group);
          const isFolded = folded.has(key);
          const groupProblems = attempted && problems.some((p) => group.indexes.includes(p.index));
          return (
            <section key={key} className={`${cardClass} overflow-hidden`}>
              <button
                type="button"
                aria-expanded={!isFolded}
                onClick={() => setFolded((prev) => (prev.has(key) ? withoutKey(prev, key) : new Set(prev).add(key)))}
                className="w-full flex items-center gap-3 border-0 bg-transparent px-5 py-3.5 text-left cursor-pointer"
              >
                <span
                  aria-hidden="true"
                  className="grid size-8 flex-none place-items-center rounded-full text-xs font-black text-white"
                  style={{ background: group.part?.color ?? "var(--color-muted)" }}
                >
                  {group.part?.number ?? "?"}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[var(--color-ink)]">
                    {group.part ? group.part.title : "Not in a mission"}
                  </span>
                  <span className="block text-xs text-[var(--color-muted)] truncate">
                    {group.part ? `“${group.part.subtitle}”` : "Pick a mission for each of these"}
                  </span>
                </span>
                {groupProblems && <span className="text-xs font-bold text-[var(--color-orange-dark)]">Needs fixing</span>}
                <span className="text-xs font-bold text-[var(--color-muted)] whitespace-nowrap">
                  {group.indexes.length === 0 ? "Empty" : `${group.indexes.length} question${group.indexes.length === 1 ? "" : "s"}`}
                </span>
                <span aria-hidden="true" className="text-[var(--color-muted)] transition-transform" style={{ transform: isFolded ? "none" : "rotate(90deg)" }}>
                  ›
                </span>
              </button>
              {!isFolded && (
                <div className="border-t border-[var(--color-neutral-divider)] px-3 py-3 sm:px-4">
                  <ol className="m-0 p-0 list-none flex flex-col gap-1">
                    {group.indexes.map((index, position) => {
                      const item = items[index];
                      const itemProblems = problemsAt(index);
                      return (
                        <li key={item.id} id={`q-${item.id}`} className="scroll-mt-4">
                          {openId === item.id ? (
                            <QuestionEditor
                              key={item.id}
                              item={item}
                              number={numberOf.get(index) ?? 0}
                              part={group.part}
                              parts={parts}
                              skillAreas={skillAreas}
                              problems={itemProblems}
                              canMoveUp={position > 0}
                              canMoveDown={position < group.indexes.length - 1}
                              onChange={(patch) => update(index, patch)}
                              onChangePart={(code) => changePart(index, code)}
                              onMove={(direction) => move(index, direction)}
                              onDuplicate={() => duplicate(index)}
                              onDelete={() => remove(index)}
                              onClose={() => setOpenId(null)}
                            />
                          ) : (
                            <QuestionRow item={item} number={numberOf.get(index) ?? 0} needsFixing={itemProblems.length > 0} onOpen={() => open(index)} />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {group.part && (
                    <button
                      type="button"
                      onClick={() => add(group)}
                      className="mt-1.5 ml-1 border-0 bg-transparent px-2 py-1.5 text-sm font-bold text-[var(--color-orange-dark)] cursor-pointer"
                    >
                      + Add a question to {group.part.title}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div
        role="region"
        aria-label="Publish"
        // It follows the page down only while there's something to publish.
        className={`${dirty || status ? "sticky bottom-3 z-10" : ""} mt-6 flex items-center gap-3 flex-wrap rounded-2xl border-2 bg-[var(--color-surface)] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.12)]`}
        style={{ borderColor: dirty ? "var(--color-orange)" : "var(--color-neutral-divider)" }}
      >
        <div className="flex-1 min-w-[220px]" aria-live="polite">
          <div
            className="text-sm font-bold"
            style={{ color: status && !status.ok ? "var(--color-orange-dark)" : "var(--color-ink)" }}
          >
            {status
              ? `${status.ok ? "✓ " : ""}${status.message}`
              : dirty
                ? "You have changes that aren't published yet."
                : published
                  ? "Everything is published."
                  : "Add questions, then publish."}
          </div>
          <div className="text-xs text-[var(--color-muted)]">
            Publishing saves a new version. Assessments already started keep the questions they began with.
          </div>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={discard}
            disabled={isPending}
            className="rounded-full border-2 border-[var(--color-neutral-border)] bg-transparent px-4 py-2 text-sm font-bold text-[var(--color-body)] cursor-pointer"
          >
            Discard changes
          </button>
        )}
        <button
          type="button"
          onClick={publish}
          disabled={!dirty || isPending}
          className="rounded-full border-0 bg-[var(--color-orange)] px-5 py-2.5 text-sm font-bold text-[var(--color-on-orange)] shadow-[0_6px_16px_rgba(234,88,12,0.25)] cursor-pointer disabled:opacity-50 disabled:cursor-default disabled:shadow-none"
        >
          {isPending ? "Publishing…" : "Publish"}
        </button>
      </div>
    </div>
  );
}

function QuestionRow({
  item,
  number,
  needsFixing,
  onOpen,
}: {
  item: AssessmentItem;
  number: number;
  needsFixing: boolean;
  onOpen: () => void;
}) {
  const main = item.type === "mic" && item.passage ? `“${item.passage}”` : item.prompt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 py-2 text-left cursor-pointer hover:bg-[var(--color-neutral)]"
    >
      <span className="w-7 flex-none text-right text-xs font-bold text-[var(--color-muted)]">{number}</span>
      <span className="w-[74px] flex-none rounded-full bg-[var(--color-neutral)] px-2 py-0.5 text-center text-[11px] font-bold text-[var(--color-body)]">
        {KIND_LABEL[item.type] ?? item.type}
      </span>
      <span className="flex-1 min-w-0 truncate text-sm text-[var(--color-ink)]">
        {main || <span className="text-[var(--color-muted)]">No question yet</span>}
      </span>
      <span className="hidden sm:block max-w-[34%] truncate text-xs text-[var(--color-muted)]">{answerSummary(item)}</span>
      {needsFixing && (
        <span className="flex-none rounded-full bg-[var(--color-orange-tint)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-orange-dark)]">
          Fix
        </span>
      )}
    </button>
  );
}

function answerSummary(item: AssessmentItem): string {
  if (item.type === "choice") {
    const options = item.options ?? [];
    const right = options.filter((o) => o.isCorrect);
    if (right.length === 0) return "No right answer marked";
    if (right.length === options.length) return "Any answer";
    return `✓ ${right.map((o) => o.text).join(" / ")}`;
  }
  if (!item.expectedText) return item.type === "mic" ? "Any try counts" : "Any answer counts";
  return `✓ ${item.expectedText}`;
}

function blankItem(id: string, type: GameItemType, skillAreaKey: string): AssessmentItem {
  if (type === "mic") return { id, skillAreaKey, type, prompt: "Read this word out loud." };
  if (type === "text") return { id, skillAreaKey, type, prompt: "Write the word you hear." };
  return {
    id,
    skillAreaKey,
    type: "choice",
    prompt: "",
    options: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

function groupKey(group: PartGroup): string {
  return group.part?.code ?? OTHER;
}

function withoutKey(set: Set<string>, key: string): Set<string> {
  if (!set.has(key)) return set;
  const next = new Set(set);
  next.delete(key);
  return next;
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, n] of counts) if (n > bestCount) [best, bestCount] = [v, n];
  return best;
}
