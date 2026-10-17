-- More AI-written summaries, each still approved by a person before it
-- reaches a PDF.
--
-- 1. student_report_summaries.family_note: an optional short note for the
--    child's family in Twi, Ga or Ewe, written from the English summary and
--    approved together with it. {"language": "tw" | "gaa" | "ee", "text":
--    "...", "atHome": [{"title": "...", "text": "..."}]}, or null.
-- 2. cycle_report_summaries: a summary of an assessment cycle for the whole
--    school (teacher_id null) or for one class (teacher_id set), drafted by
--    an administrator from the cycle's totals alone, never a child's answers.
--    An approved school summary goes in the school PDF; an approved class
--    summary is also shown to that class's teacher. Written by the service
--    role after the caller's own access is checked (like
--    student_report_summaries), so there is a select policy only.

alter table public.student_report_summaries add column if not exists family_note jsonb;
alter table public.student_report_summaries drop constraint if exists student_report_summaries_family_language_check;
alter table public.student_report_summaries add constraint student_report_summaries_family_language_check
  check (family_note is null or family_note->>'language' in ('tw', 'gaa', 'ee'));

create table if not exists public.cycle_report_summaries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  cycle_id uuid not null references public.assessment_cycles (id) on delete cascade,
  teacher_id uuid references public.profiles (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  content jsonb not null,
  model text not null,
  edited boolean not null default false,
  generated_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One for the school and one for each class, per cycle.
create unique index if not exists cycle_report_summaries_scope_idx
  on public.cycle_report_summaries (cycle_id, coalesce(teacher_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.cycle_report_summaries enable row level security;

drop policy if exists cycle_report_summaries_select_scoped on public.cycle_report_summaries;
create policy cycle_report_summaries_select_scoped on public.cycle_report_summaries
  for select to authenticated
  using (
    school_id = public.current_profile_school_id()
    and (public.is_administrator() or (teacher_id = auth.uid() and status = 'approved'))
  );

notify pgrst, 'reload schema';
