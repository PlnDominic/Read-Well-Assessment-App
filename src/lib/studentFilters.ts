import { LEVEL_OPTIONS } from "@/lib/levels";

/** How many students the Students page shows at once. */
export const STUDENTS_PER_PAGE = 25;

export interface StudentFilters {
  /** Name search; empty for none. */
  q: string;
  /** A level, or null for all. */
  level: number | null;
  /** A teacher's profile id, or null for all. */
  teacher: string | null;
  /** 1-based page. */
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The filters in a page's URL, checked: a made-up level, a teacher who isn't
 * one of `teacherIds`, or a bad page number is ignored rather than trusted.
 */
export function parseStudentFilters(raw: Raw, teacherIds: readonly string[]): StudentFilters {
  const level = Number(first(raw.level));
  const page = Math.floor(Number(first(raw.page)));
  const teacher = first(raw.teacher);
  return {
    q: first(raw.q).trim().slice(0, 80),
    level: LEVEL_OPTIONS.includes(level) ? level : null,
    teacher: teacherIds.includes(teacher) ? teacher : null,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/** A LIKE pattern that finds `q` anywhere in a name; % and _ the person typed are matched literally. */
export function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The first and last row (0-based, inclusive) of a page, for a range query. */
export function pageRange(page: number): [from: number, to: number] {
  return [(page - 1) * STUDENTS_PER_PAGE, page * STUDENTS_PER_PAGE - 1];
}

/** The last page that has anyone on it (1 when there is nobody). */
export function lastPage(total: number): number {
  return Math.max(1, Math.ceil(total / STUDENTS_PER_PAGE));
}

/** A link to the Students page with these filters; the page number is left out when it is 1. */
export function studentsHref(filters: Omit<StudentFilters, "page"> & { page?: number }): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.level !== null) params.set("level", String(filters.level));
  if (filters.teacher) params.set("teacher", filters.teacher);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/admin/students?${query}` : "/admin/students";
}
