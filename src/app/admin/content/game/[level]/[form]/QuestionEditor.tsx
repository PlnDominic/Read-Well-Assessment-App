"use client";

import { cloneElement, useId, useState } from "react";
import type { AssessmentItem, AssessmentItemOption } from "@/lib/database.types";
import type { GameItemType } from "@/lib/gameItems";
import type { Part } from "@/lib/gameParts";
import { optionPicture } from "@/lib/optionPicture";
import { QuestionPreview } from "./QuestionPreview";

export interface SkillArea {
  key: string;
  name: string;
}

const KINDS: { type: GameItemType; icon: string; label: string }[] = [
  { type: "choice", icon: "👆", label: "Tap an answer" },
  { type: "mic", icon: "🎤", label: "Read aloud" },
  { type: "text", icon: "✏️", label: "Type an answer" },
];

const inputClass =
  "w-full border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm bg-[var(--color-surface)] text-[var(--color-ink)] focus:border-[var(--color-orange)] focus:outline-none";
const smallButton =
  "rounded-full border-2 border-[var(--color-neutral-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-ink)] cursor-pointer hover:border-[var(--color-orange)] disabled:opacity-40 disabled:cursor-default disabled:hover:border-[var(--color-neutral-border)]";

/** One question, open for editing: its fields on the left, the child's view of it on the right. */
export function QuestionEditor({
  item,
  number,
  part,
  parts,
  skillAreas,
  problems,
  canMoveUp,
  canMoveDown,
  onChange,
  onChangePart,
  onMove,
  onDuplicate,
  onDelete,
  onClose,
}: {
  item: AssessmentItem;
  number: number;
  part: Part | null;
  parts: readonly Part[];
  skillAreas: SkillArea[];
  problems: string[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<AssessmentItem>) => void;
  onChangePart: (code: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [showPassage, setShowPassage] = useState(!!item.passage);
  const options = item.options ?? [];
  const setOptions = (next: AssessmentItemOption[]) => onChange({ options: next });

  function changeType(type: GameItemType) {
    if (type === item.type) return;
    const prompt = item.prompt.trim()
      ? item.prompt
      : type === "mic"
        ? "Read this word out loud."
        : type === "text"
          ? "Write the word you hear."
          : "";
    onChange({
      type,
      prompt,
      options: type === "choice" ? (options.length ? options : [{ text: "", isCorrect: true }, { text: "", isCorrect: false }]) : undefined,
      expectedText: type === "choice" ? undefined : item.expectedText,
    });
  }

  // A read-aloud answer usually is the words shown, so the two move together
  // until someone makes the answer different on purpose.
  function changePassage(passage: string) {
    const linked = item.type === "mic" && (item.expectedText ?? "") === (item.passage ?? "");
    onChange({ passage: passage || undefined, ...(linked ? { expectedText: passage || undefined } : {}) });
  }

  const knownSkill = skillAreas.some((sa) => sa.key === item.skillAreaKey);

  return (
    <div className="rounded-[20px] border-2 border-[var(--color-orange)] bg-[var(--color-surface)] px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="font-heading font-bold text-base text-[var(--color-ink)]">Question {number}</span>
        <span className="text-xs text-[var(--color-muted)]">{item.id}</span>
        <div className="ml-auto flex gap-1.5 flex-wrap">
          <button type="button" className={smallButton} onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Move up">
            ↑
          </button>
          <button type="button" className={smallButton} onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Move down">
            ↓
          </button>
          <button type="button" className={smallButton} onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" className={`${smallButton} text-[var(--color-orange-dark)]`} onClick={onDelete}>
            Delete
          </button>
          <button
            type="button"
            className="rounded-full border-0 bg-[var(--color-orange)] px-3.5 py-1 text-xs font-bold text-[var(--color-on-orange)] cursor-pointer"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="m-0 mb-4 list-none rounded-xl border border-[var(--color-orange-tint-border)] bg-[var(--color-orange-tint)] px-3.5 py-2.5 text-sm font-bold text-[var(--color-orange-dark)]">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 min-w-0">
          <fieldset className="m-0 p-0 border-0">
            <legend className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1.5">
              Kind of question
            </legend>
            <div className="flex gap-1.5 flex-wrap">
              {KINDS.map((k) => {
                const active = item.type === k.type;
                return (
                  <button
                    key={k.type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => changeType(k.type)}
                    className="rounded-xl border-2 px-3 py-2 text-sm font-bold cursor-pointer"
                    style={{
                      borderColor: active ? "var(--color-orange)" : "var(--color-neutral-border)",
                      background: active ? "var(--color-orange-tint)" : "var(--color-surface)",
                      color: active ? "var(--color-orange-dark)" : "var(--color-body)",
                    }}
                  >
                    <span aria-hidden="true">{k.icon}</span> {k.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {item.type === "mic" && (
            <Field label="Words the child reads" hint="Shown big on screen. Sunny never says these.">
              <textarea
                value={item.passage ?? ""}
                onChange={(e) => changePassage(e.target.value)}
                rows={2}
                placeholder="e.g. sat"
                className={inputClass}
              />
            </Field>
          )}

          <Field label={item.type === "choice" ? "Question on screen" : "Instruction on screen"}>
            <input
              value={item.prompt}
              onChange={(e) => onChange({ prompt: e.target.value })}
              placeholder={item.type === "choice" ? "e.g. Tap the goat." : undefined}
              className={inputClass}
            />
          </Field>

          {item.type === "choice" && (
            <fieldset className="m-0 p-0 border-0">
              <legend className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)] mb-0.5">Answers</legend>
              <p className="text-xs text-[var(--color-muted)] m-0 mb-2">
                Mark the right answer. If every answer counts, like how a child feels, mark them all.
              </p>
              <div className="flex flex-col gap-2">
                {options.map((option, i) => {
                  const picture = optionPicture(option.text);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-pressed={option.isCorrect}
                        aria-label={`Answer ${i + 1} is right`}
                        onClick={() => setOptions(options.map((o, j) => (j === i ? { ...o, isCorrect: !o.isCorrect } : o)))}
                        className="w-[74px] flex-none rounded-lg border-2 px-1 py-2 text-xs font-bold cursor-pointer"
                        style={{
                          borderColor: option.isCorrect ? "#1f9d55" : "var(--color-neutral-border)",
                          background: option.isCorrect ? "color-mix(in srgb, #1f9d55 14%, var(--color-surface))" : "var(--color-surface)",
                          color: option.isCorrect ? "#1a7f46" : "var(--color-muted)",
                        }}
                      >
                        {option.isCorrect ? "✓ Right" : "Wrong"}
                      </button>
                      {picture.src && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={picture.src} alt="" className="size-8 flex-none" />
                      )}
                      <input
                        value={option.text}
                        aria-label={`Answer ${i + 1}`}
                        onChange={(e) => setOptions(options.map((o, j) => (j === i ? { ...o, text: e.target.value } : o)))}
                        className={inputClass}
                      />
                      <button
                        type="button"
                        aria-label={`Remove answer ${i + 1}`}
                        onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        className="flex-none size-8 rounded-full border-0 bg-transparent text-lg text-[var(--color-muted)] cursor-pointer hover:bg-[var(--color-neutral)]"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setOptions([...options, { text: "", isCorrect: false }])}
                className="mt-2 border-0 bg-transparent p-0 text-sm font-bold text-[var(--color-orange-dark)] cursor-pointer"
              >
                + Add an answer
              </button>
              <p className="text-xs text-[var(--color-muted)] m-0 mt-2">
                Pictures: start an answer with an emoji, like <span className="whitespace-nowrap">“🐐 A goat”</span>, or use
                just the emoji for a picture on its own.
              </p>
            </fieldset>
          )}

          {item.type !== "choice" && (
            <Field
              label={item.type === "mic" ? "Right when the child says" : "Right when the child writes"}
              hint={
                item.type === "mic"
                  ? "Usually the same as the words to read. Leave blank to count any try as right."
                  : "Checked for spelling. Leave blank to count any answer as right."
              }
            >
              <input
                value={item.expectedText ?? ""}
                onChange={(e) => onChange({ expectedText: e.target.value || undefined })}
                className={inputClass}
              />
            </Field>
          )}

          <Field
            label="Sunny says (optional)"
            hint={`Leave blank and Sunny reads what's on screen${item.type === "mic" ? ", but never the words the child reads" : ""}. Use it to read the answers to a child who can't read yet, or to say a word to spell.`}
          >
            <textarea
              value={item.say ?? ""}
              onChange={(e) => onChange({ say: e.target.value || undefined })}
              rows={2}
              className={inputClass}
            />
          </Field>

          {item.type !== "mic" &&
            (item.passage || showPassage ? (
              <Field label="Text above the question (optional)" hint="A story page or sentence shown above the question.">
                <textarea
                  value={item.passage ?? ""}
                  onChange={(e) => onChange({ passage: e.target.value || undefined })}
                  rows={3}
                  className={inputClass}
                />
              </Field>
            ) : (
              <button
                type="button"
                onClick={() => setShowPassage(true)}
                className="self-start border-0 bg-transparent p-0 text-sm font-bold text-[var(--color-orange-dark)] cursor-pointer"
              >
                + Add text above the question
              </button>
            ))}

          <div className="grid gap-3 sm:grid-cols-2">
            {parts.length > 0 && (
              <Field label="Mission">
                <select value={part?.code ?? ""} onChange={(e) => onChangePart(e.target.value)} className={inputClass}>
                  {!part && <option value="">Not in a mission</option>}
                  {parts.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.number}. {p.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Skill area" hint="Which score on the report this question counts toward.">
              <select value={item.skillAreaKey} onChange={(e) => onChange({ skillAreaKey: e.target.value })} className={inputClass}>
                {!item.skillAreaKey && <option value="">Pick one…</option>}
                {!knownSkill && item.skillAreaKey && <option value={item.skillAreaKey}>{item.skillAreaKey} (not found)</option>}
                {skillAreas.map((sa) => (
                  <option key={sa.key} value={sa.key}>
                    {sa.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1.5">What the child sees</div>
          <QuestionPreview item={item} part={part} />
        </div>
      </div>
    </div>
  );
}

// The hint sits outside the <label>, so it describes the field instead of
// becoming part of its name.
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactElement<{ "aria-describedby"?: string }> }) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label className="flex flex-col gap-1.5 min-w-0">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">{label}</span>
        {hint ? cloneElement(children, { "aria-describedby": hintId }) : children}
      </label>
      {hint && (
        <span id={hintId} className="text-xs text-[var(--color-muted)]">
          {hint}
        </span>
      )}
    </div>
  );
}
