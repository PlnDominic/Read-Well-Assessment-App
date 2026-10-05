-- Brings a database that stopped at migration 0009 up to 0013 in one run.
-- Paste the whole file into Supabase -> SQL Editor -> Run. It's idempotent
-- (safe to run more than once). The individual files in migrations/ remain
-- the source of truth; this just bundles 0010-0013 for a project that
-- missed them.

begin;

-- 0010: soft delete for students
alter table public.students add column if not exists deleted_at timestamptz;

drop policy if exists students_select_scoped on public.students;
create policy students_select_scoped on public.students
  for select to authenticated
  using (deleted_at is null and public.can_access_student(id));

-- 0011: per-school skill-area weighting
create table if not exists public.school_skill_weights (
  school_id uuid not null references public.schools (id) on delete cascade,
  skill_area_id uuid not null references public.skill_areas (id) on delete cascade,
  weight numeric(4,2) not null default 1.0 check (weight > 0),
  flagged_threshold smallint check (flagged_threshold between 0 and 100),
  primary key (school_id, skill_area_id)
);

alter table public.school_skill_weights enable row level security;

drop policy if exists school_skill_weights_select_own_school on public.school_skill_weights;
create policy school_skill_weights_select_own_school on public.school_skill_weights
  for select to authenticated
  using (school_id = public.current_profile_school_id());

-- 0012: teacher review of read-aloud answers
alter table public.responses
  add column if not exists auto_is_correct boolean,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- 0013: automatic report retry tracking
alter table public.student_reports
  add column if not exists attempted_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists alerted_at timestamptz;

alter table public.school_reports
  add column if not exists attempted_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists alerted_at timestamptz;

commit;

-- Ask the API to pick up the new columns right away.
notify pgrst, 'reload schema';
