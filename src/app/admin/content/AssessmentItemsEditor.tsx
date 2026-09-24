"use client";

import { useState, useTransition } from "react";
import type { AssessmentItem, AssessmentItemOption } from "@/lib/database.types";
import { saveAssessmentItems } from "./actions";

interface SkillArea {
  key: string;
  name: string;
}

function newItem(skillAreaKey: string): AssessmentItem {
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    skillAreaKey,
    type: "choice",
    prompt: "",
    options: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
  };
}

export function AssessmentItemsEditor({
  gradeLevel,
  initialItems,
  skillAreas,
}: {
  gradeLevel: number;
  initialItems: AssessmentItem[];
  skillAreas: SkillArea[];
}) {
  const [items, setItems] = useState<AssessmentItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateItem(index: number, patch: Partial<AssessmentItem>) {
    setSaved(false);
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function updateOption(itemIndex: number, optionIndex: number, patch: Partial<AssessmentItemOption>) {
    setSaved(false);
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== itemIndex || !it.options) return it;
        return { ...it, options: it.options.map((o, j) => (j === optionIndex ? { ...o, ...patch } : o)) };
      })
    );
  }

  function setCorrectOption(itemIndex: number, optionIndex: number) {
    setSaved(false);
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== itemIndex || !it.options) return it;
        return { ...it, options: it.options.map((o, j) => ({ ...o, isCorrect: j === optionIndex })) };
      })
    );
  }

  function addOption(itemIndex: number) {
    setSaved(false);
    setItems((prev) =>
      prev.map((it, i) =>
        i === itemIndex ? { ...it, options: [...(it.options ?? []), { text: "", isCorrect: false }] } : it
      )
    );
  }

  function removeOption(itemIndex: number, optionIndex: number) {
    setSaved(false);
    setItems((prev) =>
      prev.map((it, i) => (i === itemIndex ? { ...it, options: it.options?.filter((_, j) => j !== optionIndex) } : it))
    );
  }

  function addItem() {
    setSaved(false);
    setItems((prev) => [...prev, newItem(skillAreas[0]?.key ?? "")]);
  }

  function removeItem(index: number) {
    setSaved(false);
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveAssessmentItems(gradeLevel, items);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-5">
        {items.map((item, i) => (
          <div key={item.id} className="bg-[var(--color-neutral)] rounded-[20px] p-5">
            <div className="flex flex-wrap items-center gap-3 mb-3.5">
              <select
                aria-label="Skill area"
                value={item.skillAreaKey}
                onChange={(e) => updateItem(i, { skillAreaKey: e.target.value })}
                className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3 py-2 text-sm"
              >
                {skillAreas.map((sa) => (
                  <option key={sa.key} value={sa.key}>
                    {sa.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Item type"
                value={item.type}
                onChange={(e) => {
                  const type = e.target.value as AssessmentItem["type"];
                  updateItem(i, {
                    type,
                    options: type === "choice" ? item.options ?? [{ text: "", isCorrect: true }] : undefined,
                  });
                }}
                className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3 py-2 text-sm"
              >
                <option value="choice">Multiple choice</option>
                <option value="mic">Read aloud (mic)</option>
              </select>
              <button
                onClick={() => removeItem(i)}
                className="ml-auto text-[var(--color-terracotta-dark)] text-sm font-bold bg-none border-none cursor-pointer"
              >
                Remove item
              </button>
            </div>

            <label className="flex flex-col gap-1.5 text-sm mb-3">
              <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Passage (optional)</span>
              <textarea
                value={item.passage ?? ""}
                onChange={(e) => updateItem(i, { passage: e.target.value || undefined })}
                rows={2}
                className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm mb-3">
              <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Prompt</span>
              <input
                value={item.prompt}
                onChange={(e) => updateItem(i, { prompt: e.target.value })}
                className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5"
              />
            </label>

            {item.type === "mic" && (
              <label className="flex flex-col gap-1.5 text-sm mb-3">
                <span className="font-bold text-[var(--color-muted)] text-xs uppercase">
                  Expected word/phrase (for scoring)
                </span>
                <input
                  value={item.expectedText ?? ""}
                  onChange={(e) => updateItem(i, { expectedText: e.target.value || undefined })}
                  placeholder="e.g. jump"
                  className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5"
                />
                <span className="text-[var(--color-muted)] text-xs">
                  Scored against the student&apos;s spoken transcript (Chrome/Edge Web Speech API). Leave blank to
                  count any attempt as correct.
                </span>
              </label>
            )}

            {item.type === "choice" && (
              <div className="flex flex-col gap-2">
                <span className="font-bold text-[var(--color-muted)] text-xs uppercase">
                  Options (select the correct one)
                </span>
                {(item.options ?? []).map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name={`correct-${item.id}`}
                      checked={opt.isCorrect}
                      onChange={() => setCorrectOption(i, oi)}
                    />
                    <input
                      value={opt.text}
                      onChange={(e) => updateOption(i, oi, { text: e.target.value })}
                      className="flex-1 border-2 border-[var(--color-neutral-border)] rounded-xl px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => removeOption(i, oi)}
                      className="text-[var(--color-terracotta-dark)] text-xs font-bold bg-none border-none cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addOption(i)}
                  className="self-start text-[var(--color-sage)] text-sm font-bold bg-none border-none cursor-pointer"
                >
                  + Add option
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={addItem}
          className="bg-[var(--color-neutral)] border-none text-[var(--color-sage-dark)] transition-colors hover:bg-[var(--color-neutral-divider)] font-bold text-sm px-4.5 py-2.25 rounded-full cursor-pointer"
        >
          + Add item
        </button>
        <button
          onClick={save}
          disabled={isPending}
          className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-5 py-2.5 cursor-pointer disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save as new version"}
        </button>
        {saved && <span className="text-[var(--color-sage-dark)] text-sm font-bold">Saved ✓</span>}
        {error && <span className="text-[var(--color-terracotta-dark)] text-sm">{error}</span>}
      </div>
    </div>
  );
}
