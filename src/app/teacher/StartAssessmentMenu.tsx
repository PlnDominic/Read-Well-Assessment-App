"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DELIVERY_OPTIONS, FORM_OPTIONS, formLabel, levelLabel, type AssessmentForm, type Delivery } from "@/lib/levels";
import { startAssessment } from "./actions";

const ITEM_CLASS =
  "w-full text-left text-sm font-bold px-2.5 py-2 rounded-xl border-none cursor-pointer bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-neutral)] disabled:cursor-default disabled:hover:bg-transparent disabled:text-[var(--color-muted-light)]";

/**
 * The teacher's pick of Form A, B, C or the Final assessment, and for a
 * form that comes both ways, whether the child plays it as a game or an
 * adult gives it. Each choice is its own form posting to startAssessment.
 * Forms not yet added for the student's level show but can't be picked.
 * The menu closes on Escape or a click anywhere else, so an open one never
 * sits over the rows below it.
 */
export function StartAssessmentMenu({
  studentId,
  studentName,
  level,
  available,
  label,
  primary,
  hasCycle,
}: {
  studentId: string;
  studentName: string;
  level: number;
  available: { form: AssessmentForm; delivery: Delivery }[];
  label: string;
  primary: boolean;
  hasCycle: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="font-bold text-sm px-4.5 py-2.25 rounded-full cursor-pointer border-none"
        style={{
          background: primary ? "var(--color-orange)" : "var(--color-neutral)",
          color: primary ? "white" : "var(--color-orange-dark)",
        }}
      >
        {label} ▾
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 z-10 mt-2 w-64 bg-[var(--color-surface)] rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.15)] p-2 flex flex-col gap-1"
        >
          <div className="text-xs font-bold text-[var(--color-muted)] px-2.5 pt-1 pb-1.5">
            Which {levelLabel(level)} assessment for {studentName}?
          </div>
          {!hasCycle && (
            <p className="text-xs text-[var(--color-orange-dark)] px-2.5 m-0 pb-1.5">
              An administrator needs to start an assessment cycle first.
            </p>
          )}
          {FORM_OPTIONS.map((form) => {
            const ways = DELIVERY_OPTIONS.filter((d) => available.some((a) => a.form === form && a.delivery === d));
            if (ways.length === 0) {
              return (
                <button key={form} type="button" disabled className={ITEM_CLASS}>
                  {formLabel(form)}
                  <span className="font-normal text-xs"> · not added yet</span>
                </button>
              );
            }
            return ways.map((delivery) => (
              <form key={form + delivery} action={startAssessment.bind(null, studentId, form, delivery)}>
                <button type="submit" disabled={!hasCycle} className={ITEM_CLASS}>
                  {formLabel(form)}
                  <span className="font-normal text-xs">
                    {delivery === "game" ? " · game the child plays" : " · given by an adult"}
                  </span>
                </button>
              </form>
            ));
          })}
        </div>
      )}
    </div>
  );
}
