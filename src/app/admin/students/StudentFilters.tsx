"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LEVEL_OPTIONS, levelLabel } from "@/lib/levels";
import { studentsHref } from "@/lib/studentFilters";

const field = "border-2 border-[var(--color-neutral-border)] bg-[var(--color-surface)] text-[var(--color-ink)] rounded-full px-4 py-2.5 text-sm";

/**
 * Search and filters for the Students page. Typing in the search box, or
 * picking a level or teacher, updates the list a moment later; the form
 * also works as a plain form with Search, with no JavaScript. The page
 * itself (page.tsx) does the filtering, from the URL.
 */
export function StudentFilters({
  teachers,
  initial,
}: {
  teachers: { id: string; name: string }[];
  initial: { q: string; level: number | null; teacher: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q);
  const [level, setLevel] = useState<number | null>(initial.level);
  const [teacher, setTeacher] = useState<string | null>(initial.teacher);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function go(next: { q: string; level: number | null; teacher: string | null }, wait = 0) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => startTransition(() => router.replace(studentsHref(next), { scroll: false })), wait);
  }

  const filtered = q !== "" || level !== null || teacher !== null;

  return (
    <form method="get" role="search" className="flex flex-wrap items-center gap-2.5 mb-5" onSubmit={(e) => { e.preventDefault(); go({ q, level, teacher }); }}>
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => { setQ(e.target.value); go({ q: e.target.value, level, teacher }, 300); }}
        placeholder="Search by name"
        aria-label="Search students by name"
        className={`${field} w-[240px] max-w-full`}
      />
      <select
        name="level"
        value={level ?? ""}
        onChange={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); setLevel(v); go({ q, level: v, teacher }); }}
        aria-label="Filter by level"
        className={field}
      >
        <option value="">All levels</option>
        {LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
      </select>
      <select
        name="teacher"
        value={teacher ?? ""}
        onChange={(e) => { const v = e.target.value === "" ? null : e.target.value; setTeacher(v); go({ q, level, teacher: v }); }}
        aria-label="Filter by teacher"
        className={field}
      >
        <option value="">All teachers</option>
        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button type="submit" className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer">
        Search
      </button>
      {filtered && (
        <a href="/admin/students" className="text-sm font-bold text-[var(--color-orange-dark)]">
          Clear
        </a>
      )}
      <span role="status" aria-live="polite" className="text-xs text-[var(--color-muted)]">{pending ? "Searching…" : ""}</span>
    </form>
  );
}
