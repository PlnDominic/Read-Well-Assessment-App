-- AI-written report summaries, always reviewed by a teacher.
--
-- 1. schools.ai_reports_enabled: off by default. An administrator switches it
--    on (Admin -> Settings) once the school is happy for scores, and what a
--    child answered in the assessment, to be sent to Anthropic to draft a
--    short summary. No names or other identifying details are sent.
-- 2. student_report_summaries: one draft or approved summary per assessment.
--    The scores, bands and flags are never written by the AI; this is only the
--    plain-language write-up beside them. A summary is a draft until a teacher
--    or administrator approves it, and only an approved one reaches the PDF.
--    Written by the service role after the caller's own access is checked
--    (like responses), so there is a select policy only.

alter table public.schools add column if not exists ai_reports_enabled boolean not null default false;

create table if not exists public.student_report_summaries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  session_id uuid not null unique references public.assessment_sessions (id) on delete cascade,
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
create index if not exists student_report_summaries_student_idx on public.student_report_summaries (student_id);

alter table public.student_report_summaries enable row level security;

drop policy if exists student_report_summaries_select_scoped on public.student_report_summaries;
create policy student_report_summaries_select_scoped on public.student_report_summaries
  for select to authenticated
  using (public.can_access_student(student_id));

notify pgrst, 'reload schema';
