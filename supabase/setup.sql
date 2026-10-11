-- Read Well Assessment App: complete database setup in one file.
--
-- Paste the whole file into Supabase -> SQL Editor -> Run, in the project
-- your app uses (Project Settings -> API -> Project URL must match the
-- app's NEXT_PUBLIC_SUPABASE_URL).
--
-- Safe to run on a brand-new project, on a project that ran only some of
-- the migrations, and again on one that already ran all of this: every
-- statement checks before it creates or changes anything. It is the
-- migrations in supabase/migrations/ (0001-0017) folded together, plus the
-- reports storage bucket and the ReadWell Level 1 Form A content. It creates no login
-- accounts; run supabase/bootstrap.sql afterwards for your first admin.

begin;

create extension if not exists "pgcrypto";

-- ===========================================================================
-- Types
-- ===========================================================================

do $$ begin
  create type public.user_role as enum ('teacher', 'reading_specialist', 'administrator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_status as enum ('not_started', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- Tables (0001, plus columns from 0005, 0008, 0010, 0012, 0013, 0014)
-- ===========================================================================

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_at timestamptz not null default now()
);
alter table public.schools add column if not exists data_retention_days integer;
do $$ begin
  alter table public.schools add constraint schools_data_retention_days_positive
    check (data_retention_days is null or data_retention_days > 0);
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete restrict,
  name text not null,
  email text not null,
  role public.user_role not null,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists is_active boolean not null default true;
create index if not exists profiles_school_id_idx on public.profiles (school_id);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  level smallint not null,
  created_at timestamptz not null default now()
);
alter table public.students add column if not exists deleted_at timestamptz;
create index if not exists students_school_id_idx on public.students (school_id);
create index if not exists students_teacher_id_idx on public.students (teacher_id);

create table if not exists public.specialist_assignments (
  specialist_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (specialist_id, student_id)
);

create table if not exists public.skill_areas (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  level smallint not null,
  form text constraint assessments_form_check check (form in ('A', 'B', 'C', 'Final')),
  version integer not null default 1,
  items jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint assessments_level_form_version_key unique (level, form, version)
);

create table if not exists public.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  skill_area_id uuid not null references public.skill_areas (id) on delete cascade,
  level smallint not null,
  recommendation_text text not null,
  program_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_cycles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  starts_at date not null,
  ends_at date,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists assessment_cycles_school_idx on public.assessment_cycles (school_id);

create table if not exists public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  cycle_id uuid not null references public.assessment_cycles (id) on delete restrict,
  status public.session_status not null default 'not_started',
  session_code text unique,
  current_item_index integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.assessment_sessions add column if not exists grade_override boolean not null default false;
create index if not exists assessment_sessions_student_idx on public.assessment_sessions (student_id);
create index if not exists assessment_sessions_cycle_idx on public.assessment_sessions (cycle_id);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  item_id text not null,
  answer jsonb not null,
  is_correct boolean,
  answered_at timestamptz not null default now(),
  unique (session_id, item_id)
);
alter table public.responses
  add column if not exists auto_is_correct boolean,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  skill_area_id uuid not null references public.skill_areas (id) on delete restrict,
  score smallint not null check (score between 0 and 100),
  flagged_as_difficulty boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, skill_area_id)
);

create table if not exists public.student_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  session_id uuid not null unique references public.assessment_sessions (id) on delete cascade,
  overall_label text not null,
  generated_at timestamptz not null default now(),
  pdf_path text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed'))
);
alter table public.student_reports
  add column if not exists attempted_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists alerted_at timestamptz;

create table if not exists public.school_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  cycle_id uuid not null references public.assessment_cycles (id) on delete cascade,
  generated_at timestamptz not null default now(),
  pdf_path text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  unique (school_id, cycle_id)
);
alter table public.school_reports
  add column if not exists attempted_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists alerted_at timestamptz;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_resource_idx on public.audit_log (resource_type, resource_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  message text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_id_created_at_idx
  on public.notifications (recipient_id, created_at desc);

create table if not exists public.school_skill_weights (
  school_id uuid not null references public.schools (id) on delete cascade,
  skill_area_id uuid not null references public.skill_areas (id) on delete cascade,
  weight numeric(4,2) not null default 1.0 check (weight > 0),
  flagged_threshold smallint check (flagged_threshold between 0 and 100),
  primary key (school_id, skill_area_id)
);

-- ===========================================================================
-- Helper functions for the security rules (0002)
-- ===========================================================================

create or replace function public.current_profile_role()
returns public.user_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid(); $$;

create or replace function public.current_profile_school_id()
returns uuid language sql stable security definer set search_path = public
as $$ select school_id from public.profiles where id = auth.uid(); $$;

create or replace function public.is_administrator()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_profile_role() = 'administrator'; $$;

create or replace function public.can_access_student(target_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where s.id = target_student_id
      and (
        (public.current_profile_role() = 'administrator' and s.school_id = public.current_profile_school_id())
        or (public.current_profile_role() = 'teacher' and s.teacher_id = auth.uid())
        or (
          public.current_profile_role() = 'reading_specialist'
          and exists (
            select 1 from public.specialist_assignments sa
            where sa.student_id = s.id and sa.specialist_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.can_access_session(target_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.assessment_sessions sess
    where sess.id = target_session_id and public.can_access_student(sess.student_id)
  );
$$;

revoke execute on function public.current_profile_role() from public, anon;
revoke execute on function public.current_profile_school_id() from public, anon;
revoke execute on function public.is_administrator() from public, anon;
revoke execute on function public.can_access_student(uuid) from public, anon;
revoke execute on function public.can_access_session(uuid) from public, anon;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_school_id() to authenticated;
grant execute on function public.is_administrator() to authenticated;
grant execute on function public.can_access_student(uuid) to authenticated;
grant execute on function public.can_access_session(uuid) to authenticated;

-- ===========================================================================
-- Levels and forms (0017). ReadWell levels replace grades, and each level
-- has Form A, B, C and the Final assessment. On a project set up before
-- this, the grade columns are renamed, the KG 1 content (0016) becomes
-- Level 1 Form A, KG students move to Level 1, and the kiosk sample is
-- switched off (its sessions keep their reports).
-- ===========================================================================

do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'students' and column_name = 'grade') then
    alter table public.students rename column grade to level;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'assessments' and column_name = 'grade_level') then
    alter table public.assessments rename column grade_level to level;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'recommendation_rules' and column_name = 'grade_level') then
    alter table public.recommendation_rules rename column grade_level to level;
  end if;
end $$;

-- After the renames: Postgres checks an index's columns even when it
-- already exists, so this can't sit with the table above on older projects.
create index if not exists recommendation_rules_lookup_idx
  on public.recommendation_rules (skill_area_id, level);

alter table public.assessments add column if not exists form text;
do $$ begin
  alter table public.assessments add constraint assessments_form_check
    check (form in ('A', 'B', 'C', 'Final'));
exception when duplicate_object then null; end $$;
alter table public.assessments drop constraint if exists assessments_grade_level_version_key;

update public.assessments
set level = 1, form = 'A'
where form is null and items -> 0 ->> 'id' like 'L1A.%';
update public.assessments set is_active = false where form is null and is_active;

do $$ begin
  alter table public.assessments add constraint assessments_level_form_version_key
    unique (level, form, version);
exception when duplicate_object or duplicate_table then null; end $$;
create unique index if not exists assessments_one_active_per_form
  on public.assessments (level, form)
  where is_active and form is not null;

update public.students set level = 1 where level < 1;
do $$ begin
  alter table public.students add constraint students_level_positive check (level >= 1);
exception when duplicate_object then null; end $$;

alter table public.assessment_sessions alter column session_code drop not null;

-- ===========================================================================
-- Level-match guard (0006, 0014, 0017): a session's assessment must be for
-- the student's own level. grade_override is still honoured for sessions
-- created with an override before levels; nothing sets it any more.
-- ===========================================================================

drop trigger if exists assessment_sessions_grade_match on public.assessment_sessions;
drop function if exists public.check_session_grade_match();

create or replace function public.check_session_level_match()
returns trigger language plpgsql
as $$
declare
  student_level smallint;
  assessment_level smallint;
begin
  if new.grade_override then
    return new;
  end if;
  select level into student_level from public.students where id = new.student_id;
  select level into assessment_level from public.assessments where id = new.assessment_id;
  if student_level is distinct from assessment_level then
    raise exception 'Level mismatch: student is Level %, assessment is Level %', student_level, assessment_level;
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_sessions_level_match on public.assessment_sessions;
create trigger assessment_sessions_level_match
  before insert or update of student_id, assessment_id, grade_override on public.assessment_sessions
  for each row execute function public.check_session_level_match();

-- ===========================================================================
-- Row Level Security (0002, 0004, 0007, 0009, 0010, 0011, 0015)
-- ===========================================================================

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.specialist_assignments enable row level security;
alter table public.skill_areas enable row level security;
alter table public.assessments enable row level security;
alter table public.recommendation_rules enable row level security;
alter table public.assessment_cycles enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.responses enable row level security;
alter table public.results enable row level security;
alter table public.student_reports enable row level security;
alter table public.school_reports enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;
alter table public.school_skill_weights enable row level security;

drop policy if exists schools_select_own on public.schools;
create policy schools_select_own on public.schools
  for select to authenticated
  using (id = public.current_profile_school_id());

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (public.is_administrator() and school_id = public.current_profile_school_id())
  );

drop policy if exists students_select_scoped on public.students;
create policy students_select_scoped on public.students
  for select to authenticated
  using (deleted_at is null and public.can_access_student(id));

drop policy if exists students_insert_teacher_or_admin on public.students;
create policy students_insert_teacher_or_admin on public.students
  for insert to authenticated
  with check (
    school_id = public.current_profile_school_id()
    and (
      (public.current_profile_role() = 'teacher' and teacher_id = auth.uid())
      or public.is_administrator()
    )
  );

drop policy if exists students_update_teacher_or_admin on public.students;
create policy students_update_teacher_or_admin on public.students
  for update to authenticated
  using (
    school_id = public.current_profile_school_id()
    and ((public.current_profile_role() = 'teacher' and teacher_id = auth.uid()) or public.is_administrator())
  )
  with check (
    school_id = public.current_profile_school_id()
    and ((public.current_profile_role() = 'teacher' and teacher_id = auth.uid()) or public.is_administrator())
  );

drop policy if exists students_delete_admin_only on public.students;
create policy students_delete_admin_only on public.students
  for delete to authenticated
  using (public.is_administrator() and school_id = public.current_profile_school_id());

drop policy if exists specialist_assignments_select on public.specialist_assignments;
create policy specialist_assignments_select on public.specialist_assignments
  for select to authenticated
  using (
    specialist_id = auth.uid()
    or (public.is_administrator() and public.can_access_student(student_id))
  );

drop policy if exists specialist_assignments_write_admin_only on public.specialist_assignments;
create policy specialist_assignments_write_admin_only on public.specialist_assignments
  for all to authenticated
  using (public.is_administrator() and public.can_access_student(student_id))
  with check (public.is_administrator() and public.can_access_student(student_id));

drop policy if exists skill_areas_select_staff on public.skill_areas;
create policy skill_areas_select_staff on public.skill_areas
  for select to authenticated using (true);

drop policy if exists assessments_select_staff on public.assessments;
create policy assessments_select_staff on public.assessments
  for select to authenticated using (true);

drop policy if exists recommendation_rules_select_staff on public.recommendation_rules;
create policy recommendation_rules_select_staff on public.recommendation_rules
  for select to authenticated using (true);

drop policy if exists assessment_cycles_select_own_school on public.assessment_cycles;
create policy assessment_cycles_select_own_school on public.assessment_cycles
  for select to authenticated
  using (school_id = public.current_profile_school_id());

drop policy if exists assessment_cycles_write_admin_only on public.assessment_cycles;
create policy assessment_cycles_write_admin_only on public.assessment_cycles
  for all to authenticated
  using (public.is_administrator() and school_id = public.current_profile_school_id())
  with check (public.is_administrator() and school_id = public.current_profile_school_id());

drop policy if exists assessment_sessions_select_scoped on public.assessment_sessions;
create policy assessment_sessions_select_scoped on public.assessment_sessions
  for select to authenticated
  using (public.can_access_student(student_id));

drop policy if exists assessment_sessions_insert_staff on public.assessment_sessions;
create policy assessment_sessions_insert_staff on public.assessment_sessions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.current_profile_role() in ('teacher', 'administrator')
    and public.can_access_student(student_id)
  );

drop policy if exists assessment_sessions_update_scoped on public.assessment_sessions;
create policy assessment_sessions_update_scoped on public.assessment_sessions
  for update to authenticated
  using (
    public.current_profile_role() in ('teacher', 'administrator')
    and public.can_access_student(student_id)
  )
  with check (
    public.current_profile_role() in ('teacher', 'administrator')
    and public.can_access_student(student_id)
  );

drop policy if exists assessment_sessions_delete_staff on public.assessment_sessions;
create policy assessment_sessions_delete_staff on public.assessment_sessions
  for delete to authenticated
  using (
    public.current_profile_role() in ('teacher', 'administrator')
    and public.can_access_student(student_id)
    and status <> 'completed'
  );

drop policy if exists responses_select_scoped on public.responses;
create policy responses_select_scoped on public.responses
  for select to authenticated
  using (public.can_access_session(session_id));

drop policy if exists results_select_scoped on public.results;
create policy results_select_scoped on public.results
  for select to authenticated
  using (public.can_access_session(session_id));

drop policy if exists student_reports_select_scoped on public.student_reports;
create policy student_reports_select_scoped on public.student_reports
  for select to authenticated
  using (public.can_access_student(student_id));

drop policy if exists school_reports_select_admin_only on public.school_reports;
create policy school_reports_select_admin_only on public.school_reports
  for select to authenticated
  using (public.is_administrator() and school_id = public.current_profile_school_id());

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists school_skill_weights_select_own_school on public.school_skill_weights;
create policy school_skill_weights_select_own_school on public.school_skill_weights
  for select to authenticated
  using (school_id = public.current_profile_school_id());

-- audit_log has no client-facing policies: written and read via the service
-- role only.

-- ===========================================================================
-- Private storage bucket for report PDFs (0003)
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- ===========================================================================
-- Level 1, Form A: the ReadWell Level 1 Baseline Assessment (0016, 0017).
-- Assessor-led; items generated from src/lib/readwell/level1FormA.ts
-- (seedSql.test.ts keeps this copy in step). Only added where Level 1 has
-- no Form A yet, so this never replaces one.
-- ===========================================================================

insert into public.skill_areas (key, name) values
  ('storyListening', 'Story listening'),
  ('vocabulary', 'Vocabulary'),
  ('printConcepts', 'Print concepts'),
  ('soundAwareness', 'Sound awareness'),
  ('letterNames', 'Letter names'),
  ('letterSounds', 'Letter sounds'),
  ('wordReading', 'Word reading'),
  ('heartWords', 'Heart words'),
  ('storyQuestions', 'Story questions'),
  ('writing', 'Writing')
on conflict (key) do nothing;

insert into public.assessments (level, form, version, items, is_active)
select 1, 'A', 1, '[
    {"id":"L1A.LC.01","skillAreaKey":"storyListening","type":"assessor","part":1,"prompt":"What animal does Kwaku have?","accept":"A goat"},
    {"id":"L1A.LC.02","skillAreaKey":"storyListening","type":"assessor","part":1,"prompt":"What does Kwaku give the goat every morning?","accept":"Water"},
    {"id":"L1A.LC.03","skillAreaKey":"storyListening","type":"assessor","part":1,"prompt":"Where did Kwaku find the goat?","accept":"In the kitchen"},
    {"id":"L1A.LC.04","skillAreaKey":"storyListening","type":"assessor","part":1,"prompt":"Why was the goat able to run away?","accept":"The gate was open"},
    {"id":"L1A.LC.05","skillAreaKey":"storyListening","type":"assessor","part":1,"prompt":"Why do you think Kwaku tied the goat with a rope?","accept":"So it cannot run away again, or any sensible reason"},
    {"id":"L1A.VO.01","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"ram","detail":"hen, ram, dog, fish","accept":"Picture 2 (ram)"},
    {"id":"L1A.VO.02","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"web","detail":"net, rope, web, nest","accept":"Picture 3 (web)"},
    {"id":"L1A.VO.03","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"hut","detail":"hut, tent, car, tree","accept":"Picture 1 (hut)"},
    {"id":"L1A.VO.04","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"mop","detail":"broom, brush, bucket, mop","accept":"Picture 4 (mop)"},
    {"id":"L1A.VO.05","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"tin","detail":"cup, tin, bottle, basket","accept":"Picture 2 (tin)"},
    {"id":"L1A.VO.06","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"bucket","detail":"pot, bowl, basket, bucket","accept":"Picture 4 (bucket)"},
    {"id":"L1A.VO.07","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"ladder","detail":"ladder, chair, table, door","accept":"Picture 1 (ladder)"},
    {"id":"L1A.VO.08","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"bridge","detail":"road, river, bridge, gate","accept":"Picture 3 (bridge)"},
    {"id":"L1A.VO.09","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"roof","detail":"window, roof, door, wall","accept":"Picture 2 (roof)"},
    {"id":"L1A.VO.10","skillAreaKey":"vocabulary","type":"assessor","part":2,"prompt":"farmer","detail":"teacher, driver, farmer, doctor","accept":"Picture 3 (farmer)"},
    {"id":"L1A.CP.01","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Show me the front of this book.","accept":"Turns to or points to the front cover"},
    {"id":"L1A.CP.02","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Show me the back of the book.","accept":"Points to the back cover"},
    {"id":"L1A.CP.03","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Open the book so that we can read it.","accept":"Opens from the front with the book the right way up"},
    {"id":"L1A.CP.04","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"I want to read this page. Show me where I start reading.","accept":"Points to the first word of the first line, not the picture","instruction":"Now turn to page 4 yourself."},
    {"id":"L1A.CP.05","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Which way do I go from there?","accept":"Moves a finger from left to right along the line"},
    {"id":"L1A.CP.06","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Where do I go after that?","accept":"Moves down to the start of the next line"},
    {"id":"L1A.CP.07","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Show me just one letter.","accept":"Points to or covers one letter only"},
    {"id":"L1A.CP.08","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Show me just one word.","accept":"Points to or frames one whole word"},
    {"id":"L1A.CP.09","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Show me a capital letter.","accept":"Points to any capital letter"},
    {"id":"L1A.CP.10","skillAreaKey":"printConcepts","type":"assessor","part":3,"prompt":"Show me a full stop.","accept":"Points to any full stop"},
    {"id":"L1A.SA.1.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":1,"prompt":"Rung 1, item 1"},
    {"id":"L1A.SA.1.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":1,"prompt":"Rung 1, item 2"},
    {"id":"L1A.SA.1.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":1,"prompt":"Rung 1, item 3"},
    {"id":"L1A.SA.1.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":1,"prompt":"Rung 1, item 4"},
    {"id":"L1A.SA.1.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":1,"prompt":"Rung 1, item 5"},
    {"id":"L1A.SA.2.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":2,"prompt":"Rung 2, item 1"},
    {"id":"L1A.SA.2.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":2,"prompt":"Rung 2, item 2"},
    {"id":"L1A.SA.2.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":2,"prompt":"Rung 2, item 3"},
    {"id":"L1A.SA.2.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":2,"prompt":"Rung 2, item 4"},
    {"id":"L1A.SA.2.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":2,"prompt":"Rung 2, item 5"},
    {"id":"L1A.SA.3.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":3,"prompt":"Rung 3, item 1"},
    {"id":"L1A.SA.3.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":3,"prompt":"Rung 3, item 2"},
    {"id":"L1A.SA.3.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":3,"prompt":"Rung 3, item 3"},
    {"id":"L1A.SA.3.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":3,"prompt":"Rung 3, item 4"},
    {"id":"L1A.SA.3.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":3,"prompt":"Rung 3, item 5"},
    {"id":"L1A.SA.4.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":4,"prompt":"Rung 4, item 1"},
    {"id":"L1A.SA.4.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":4,"prompt":"Rung 4, item 2"},
    {"id":"L1A.SA.4.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":4,"prompt":"Rung 4, item 3"},
    {"id":"L1A.SA.4.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":4,"prompt":"Rung 4, item 4"},
    {"id":"L1A.SA.4.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":4,"prompt":"Rung 4, item 5"},
    {"id":"L1A.SA.5.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":5,"prompt":"Rung 5, item 1"},
    {"id":"L1A.SA.5.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":5,"prompt":"Rung 5, item 2"},
    {"id":"L1A.SA.5.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":5,"prompt":"Rung 5, item 3"},
    {"id":"L1A.SA.5.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":5,"prompt":"Rung 5, item 4"},
    {"id":"L1A.SA.5.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":5,"prompt":"Rung 5, item 5"},
    {"id":"L1A.SA.6.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":6,"prompt":"Rung 6, item 1"},
    {"id":"L1A.SA.6.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":6,"prompt":"Rung 6, item 2"},
    {"id":"L1A.SA.6.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":6,"prompt":"Rung 6, item 3"},
    {"id":"L1A.SA.6.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":6,"prompt":"Rung 6, item 4"},
    {"id":"L1A.SA.6.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":6,"prompt":"Rung 6, item 5"},
    {"id":"L1A.SA.7.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":7,"prompt":"Rung 7, item 1"},
    {"id":"L1A.SA.7.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":7,"prompt":"Rung 7, item 2"},
    {"id":"L1A.SA.7.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":7,"prompt":"Rung 7, item 3"},
    {"id":"L1A.SA.7.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":7,"prompt":"Rung 7, item 4"},
    {"id":"L1A.SA.7.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":7,"prompt":"Rung 7, item 5"},
    {"id":"L1A.SA.8.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":8,"prompt":"Rung 8, item 1"},
    {"id":"L1A.SA.8.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":8,"prompt":"Rung 8, item 2"},
    {"id":"L1A.SA.8.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":8,"prompt":"Rung 8, item 3"},
    {"id":"L1A.SA.8.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":8,"prompt":"Rung 8, item 4"},
    {"id":"L1A.SA.8.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":8,"prompt":"Rung 8, item 5"},
    {"id":"L1A.SA.9.1","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":9,"prompt":"Rung 9, item 1"},
    {"id":"L1A.SA.9.2","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":9,"prompt":"Rung 9, item 2"},
    {"id":"L1A.SA.9.3","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":9,"prompt":"Rung 9, item 3"},
    {"id":"L1A.SA.9.4","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":9,"prompt":"Rung 9, item 4"},
    {"id":"L1A.SA.9.5","skillAreaKey":"soundAwareness","type":"assessor","part":4,"row":9,"prompt":"Rung 9, item 5"},
    {"id":"L1A.LN.01","skillAreaKey":"letterNames","type":"assessor","part":5,"row":1,"prompt":"s"},
    {"id":"L1A.LN.02","skillAreaKey":"letterNames","type":"assessor","part":5,"row":1,"prompt":"m"},
    {"id":"L1A.LN.03","skillAreaKey":"letterNames","type":"assessor","part":5,"row":1,"prompt":"a"},
    {"id":"L1A.LN.04","skillAreaKey":"letterNames","type":"assessor","part":5,"row":1,"prompt":"t"},
    {"id":"L1A.LN.05","skillAreaKey":"letterNames","type":"assessor","part":5,"row":1,"prompt":"o"},
    {"id":"L1A.LN.06","skillAreaKey":"letterNames","type":"assessor","part":5,"row":1,"prompt":"b"},
    {"id":"L1A.LN.07","skillAreaKey":"letterNames","type":"assessor","part":5,"row":2,"prompt":"k"},
    {"id":"L1A.LN.08","skillAreaKey":"letterNames","type":"assessor","part":5,"row":2,"prompt":"e"},
    {"id":"L1A.LN.09","skillAreaKey":"letterNames","type":"assessor","part":5,"row":2,"prompt":"w"},
    {"id":"L1A.LN.10","skillAreaKey":"letterNames","type":"assessor","part":5,"row":2,"prompt":"d"},
    {"id":"L1A.LN.11","skillAreaKey":"letterNames","type":"assessor","part":5,"row":2,"prompt":"r"},
    {"id":"L1A.LN.12","skillAreaKey":"letterNames","type":"assessor","part":5,"row":2,"prompt":"i"},
    {"id":"L1A.LN.13","skillAreaKey":"letterNames","type":"assessor","part":5,"row":3,"prompt":"n"},
    {"id":"L1A.LN.14","skillAreaKey":"letterNames","type":"assessor","part":5,"row":3,"prompt":"z"},
    {"id":"L1A.LN.15","skillAreaKey":"letterNames","type":"assessor","part":5,"row":3,"prompt":"c"},
    {"id":"L1A.LN.16","skillAreaKey":"letterNames","type":"assessor","part":5,"row":3,"prompt":"f"},
    {"id":"L1A.LN.17","skillAreaKey":"letterNames","type":"assessor","part":5,"row":3,"prompt":"u"},
    {"id":"L1A.LN.18","skillAreaKey":"letterNames","type":"assessor","part":5,"row":3,"prompt":"h"},
    {"id":"L1A.LN.19","skillAreaKey":"letterNames","type":"assessor","part":5,"row":4,"prompt":"p"},
    {"id":"L1A.LN.20","skillAreaKey":"letterNames","type":"assessor","part":5,"row":4,"prompt":"x"},
    {"id":"L1A.LN.21","skillAreaKey":"letterNames","type":"assessor","part":5,"row":4,"prompt":"g"},
    {"id":"L1A.LN.22","skillAreaKey":"letterNames","type":"assessor","part":5,"row":4,"prompt":"l"},
    {"id":"L1A.LN.23","skillAreaKey":"letterNames","type":"assessor","part":5,"row":4,"prompt":"j"},
    {"id":"L1A.LN.24","skillAreaKey":"letterNames","type":"assessor","part":5,"row":4,"prompt":"y"},
    {"id":"L1A.LN.25","skillAreaKey":"letterNames","type":"assessor","part":5,"row":5,"prompt":"v"},
    {"id":"L1A.LN.26","skillAreaKey":"letterNames","type":"assessor","part":5,"row":5,"prompt":"q"},
    {"id":"L1A.LS.01","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":1,"prompt":"a","accept":"The short sound only"},
    {"id":"L1A.LS.02","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":1,"prompt":"t","accept":"/t/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.03","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":1,"prompt":"s","accept":"/s/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.04","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":1,"prompt":"m","accept":"/m/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.05","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":1,"prompt":"p","accept":"/p/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.06","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":1,"prompt":"n","accept":"/n/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.07","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":2,"prompt":"g","accept":"/g/ as in goat"},
    {"id":"L1A.LS.08","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":2,"prompt":"i","accept":"The short sound only"},
    {"id":"L1A.LS.09","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":2,"prompt":"h","accept":"/h/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.10","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":2,"prompt":"d","accept":"/d/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.11","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":2,"prompt":"u","accept":"The short sound only"},
    {"id":"L1A.LS.12","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":2,"prompt":"c","accept":"/k/"},
    {"id":"L1A.LS.13","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":3,"prompt":"f","accept":"/f/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.14","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":3,"prompt":"o","accept":"The short sound only"},
    {"id":"L1A.LS.15","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":3,"prompt":"l","accept":"/l/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.16","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":3,"prompt":"y","accept":"/y/ as in yam"},
    {"id":"L1A.LS.17","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":3,"prompt":"b","accept":"/b/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.18","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":3,"prompt":"r","accept":"/r/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.19","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":4,"prompt":"e","accept":"The short sound only"},
    {"id":"L1A.LS.20","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":4,"prompt":"k","accept":"/k/"},
    {"id":"L1A.LS.21","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":4,"prompt":"w","accept":"/w/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.22","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":4,"prompt":"j","accept":"/j/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.23","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":4,"prompt":"z","accept":"/z/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.24","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":4,"prompt":"v","accept":"/v/ (a small extra vowel is still correct)"},
    {"id":"L1A.LS.25","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":5,"prompt":"x","accept":"/ks/ as at the end of fox"},
    {"id":"L1A.LS.26","skillAreaKey":"letterSounds","type":"assessor","part":6,"row":5,"prompt":"q","accept":"/kw/"},
    {"id":"L1A.CV.01","skillAreaKey":"wordReading","type":"assessor","part":7,"row":1,"prompt":"ma"},
    {"id":"L1A.CV.02","skillAreaKey":"wordReading","type":"assessor","part":7,"row":1,"prompt":"fe"},
    {"id":"L1A.CV.03","skillAreaKey":"wordReading","type":"assessor","part":7,"row":1,"prompt":"ti"},
    {"id":"L1A.CV.04","skillAreaKey":"wordReading","type":"assessor","part":7,"row":1,"prompt":"po"},
    {"id":"L1A.CV.05","skillAreaKey":"wordReading","type":"assessor","part":7,"row":1,"prompt":"su"},
    {"id":"L1A.CV.06","skillAreaKey":"wordReading","type":"assessor","part":7,"row":2,"prompt":"da"},
    {"id":"L1A.CV.07","skillAreaKey":"wordReading","type":"assessor","part":7,"row":2,"prompt":"ne"},
    {"id":"L1A.CV.08","skillAreaKey":"wordReading","type":"assessor","part":7,"row":2,"prompt":"li"},
    {"id":"L1A.CV.09","skillAreaKey":"wordReading","type":"assessor","part":7,"row":2,"prompt":"bo"},
    {"id":"L1A.CV.10","skillAreaKey":"wordReading","type":"assessor","part":7,"row":2,"prompt":"gu"},
    {"id":"L1A.RW.01","skillAreaKey":"wordReading","type":"assessor","part":8,"row":1,"prompt":"gap"},
    {"id":"L1A.RW.02","skillAreaKey":"wordReading","type":"assessor","part":8,"row":1,"prompt":"den"},
    {"id":"L1A.RW.03","skillAreaKey":"wordReading","type":"assessor","part":8,"row":1,"prompt":"rip"},
    {"id":"L1A.RW.04","skillAreaKey":"wordReading","type":"assessor","part":8,"row":1,"prompt":"jog"},
    {"id":"L1A.RW.05","skillAreaKey":"wordReading","type":"assessor","part":8,"row":1,"prompt":"bug"},
    {"id":"L1A.RW.06","skillAreaKey":"wordReading","type":"assessor","part":8,"row":2,"prompt":"yes"},
    {"id":"L1A.RW.07","skillAreaKey":"wordReading","type":"assessor","part":8,"row":2,"prompt":"dim"},
    {"id":"L1A.RW.08","skillAreaKey":"wordReading","type":"assessor","part":8,"row":2,"prompt":"lap"},
    {"id":"L1A.RW.09","skillAreaKey":"wordReading","type":"assessor","part":8,"row":2,"prompt":"hum"},
    {"id":"L1A.RW.10","skillAreaKey":"wordReading","type":"assessor","part":8,"row":2,"prompt":"fog"},
    {"id":"L1A.RW.11","skillAreaKey":"wordReading","type":"assessor","part":8,"row":3,"prompt":"rib"},
    {"id":"L1A.RW.12","skillAreaKey":"wordReading","type":"assessor","part":8,"row":3,"prompt":"lot"},
    {"id":"L1A.RW.13","skillAreaKey":"wordReading","type":"assessor","part":8,"row":3,"prompt":"wag"},
    {"id":"L1A.RW.14","skillAreaKey":"wordReading","type":"assessor","part":8,"row":3,"prompt":"met"},
    {"id":"L1A.RW.15","skillAreaKey":"wordReading","type":"assessor","part":8,"row":3,"prompt":"bud"},
    {"id":"L1A.RW.16","skillAreaKey":"wordReading","type":"assessor","part":8,"row":4,"prompt":"pop"},
    {"id":"L1A.RW.17","skillAreaKey":"wordReading","type":"assessor","part":8,"row":4,"prompt":"tug"},
    {"id":"L1A.RW.18","skillAreaKey":"wordReading","type":"assessor","part":8,"row":4,"prompt":"bet"},
    {"id":"L1A.RW.19","skillAreaKey":"wordReading","type":"assessor","part":8,"row":4,"prompt":"hip"},
    {"id":"L1A.RW.20","skillAreaKey":"wordReading","type":"assessor","part":8,"row":4,"prompt":"bad"},
    {"id":"L1A.NW.01","skillAreaKey":"wordReading","type":"assessor","part":9,"row":1,"prompt":"vap"},
    {"id":"L1A.NW.02","skillAreaKey":"wordReading","type":"assessor","part":9,"row":1,"prompt":"teg"},
    {"id":"L1A.NW.03","skillAreaKey":"wordReading","type":"assessor","part":9,"row":1,"prompt":"nim"},
    {"id":"L1A.NW.04","skillAreaKey":"wordReading","type":"assessor","part":9,"row":1,"prompt":"dob"},
    {"id":"L1A.NW.05","skillAreaKey":"wordReading","type":"assessor","part":9,"row":1,"prompt":"fum"},
    {"id":"L1A.NW.06","skillAreaKey":"wordReading","type":"assessor","part":9,"row":2,"prompt":"zat"},
    {"id":"L1A.NW.07","skillAreaKey":"wordReading","type":"assessor","part":9,"row":2,"prompt":"pib"},
    {"id":"L1A.NW.08","skillAreaKey":"wordReading","type":"assessor","part":9,"row":2,"prompt":"vog"},
    {"id":"L1A.NW.09","skillAreaKey":"wordReading","type":"assessor","part":9,"row":2,"prompt":"lut"},
    {"id":"L1A.NW.10","skillAreaKey":"wordReading","type":"assessor","part":9,"row":2,"prompt":"fep"},
    {"id":"L1A.HW.01","skillAreaKey":"heartWords","type":"assessor","part":10,"row":1,"prompt":"the","detail":"Set 1"},
    {"id":"L1A.HW.02","skillAreaKey":"heartWords","type":"assessor","part":10,"row":1,"prompt":"of","detail":"Set 1"},
    {"id":"L1A.HW.03","skillAreaKey":"heartWords","type":"assessor","part":10,"row":1,"prompt":"she","detail":"Set 2"},
    {"id":"L1A.HW.04","skillAreaKey":"heartWords","type":"assessor","part":10,"row":1,"prompt":"have","detail":"Set 2"},
    {"id":"L1A.HW.05","skillAreaKey":"heartWords","type":"assessor","part":10,"row":1,"prompt":"are","detail":"Set 3"},
    {"id":"L1A.HW.06","skillAreaKey":"heartWords","type":"assessor","part":10,"row":2,"prompt":"go","detail":"Set 3"},
    {"id":"L1A.HW.07","skillAreaKey":"heartWords","type":"assessor","part":10,"row":2,"prompt":"with","detail":"Set 4"},
    {"id":"L1A.HW.08","skillAreaKey":"heartWords","type":"assessor","part":10,"row":2,"prompt":"he","detail":"Set 4"},
    {"id":"L1A.HW.09","skillAreaKey":"heartWords","type":"assessor","part":10,"row":2,"prompt":"was","detail":"Set 5"},
    {"id":"L1A.HW.10","skillAreaKey":"heartWords","type":"assessor","part":10,"row":2,"prompt":"you","detail":"Set 5"},
    {"id":"L1A.HW.11","skillAreaKey":"heartWords","type":"assessor","part":10,"row":3,"prompt":"said","detail":"Set 6"},
    {"id":"L1A.HW.12","skillAreaKey":"heartWords","type":"assessor","part":10,"row":3,"prompt":"there","detail":"Set 6"},
    {"id":"L1A.HW.13","skillAreaKey":"heartWords","type":"assessor","part":10,"row":3,"prompt":"look","detail":"Set 7"},
    {"id":"L1A.HW.14","skillAreaKey":"heartWords","type":"assessor","part":10,"row":3,"prompt":"like","detail":"Set 7"},
    {"id":"L1A.HW.15","skillAreaKey":"heartWords","type":"assessor","part":10,"row":3,"prompt":"down","detail":"Set 8"},
    {"id":"L1A.HW.16","skillAreaKey":"heartWords","type":"assessor","part":10,"row":4,"prompt":"for","detail":"Set 8"},
    {"id":"L1A.HW.17","skillAreaKey":"heartWords","type":"assessor","part":10,"row":4,"prompt":"saw","detail":"Set 9"},
    {"id":"L1A.HW.18","skillAreaKey":"heartWords","type":"assessor","part":10,"row":4,"prompt":"away","detail":"Set 9"},
    {"id":"L1A.HW.19","skillAreaKey":"heartWords","type":"assessor","part":10,"row":4,"prompt":"happy","detail":"Set 10"},
    {"id":"L1A.HW.20","skillAreaKey":"heartWords","type":"assessor","part":10,"row":4,"prompt":"where","detail":"Set 10"},
    {"id":"L1A.ST.READ","skillAreaKey":"storyQuestions","type":"assessor","part":11,"prompt":"Tim and the pup","scored":false},
    {"id":"L1A.STQ.01","skillAreaKey":"storyQuestions","type":"assessor","part":11,"prompt":"What does Tim have?","accept":"A bag, or a big red bag","fromLine":1},
    {"id":"L1A.STQ.02","skillAreaKey":"storyQuestions","type":"assessor","part":11,"prompt":"Where did the pup hide?","accept":"In the bag","fromLine":2},
    {"id":"L1A.STQ.03","skillAreaKey":"storyQuestions","type":"assessor","part":11,"prompt":"What did Tim say to the pup?","accept":"No","fromLine":3},
    {"id":"L1A.STQ.04","skillAreaKey":"storyQuestions","type":"assessor","part":11,"prompt":"Where did the pup sit?","accept":"On his leg, or on Tim''s leg","fromLine":5},
    {"id":"L1A.STQ.05","skillAreaKey":"storyQuestions","type":"assessor","part":11,"prompt":"Why do you think Tim is happy at the end?","accept":"He likes the pup, he has a friend, or any sensible reason from the story","fromLine":7},
    {"id":"L1A.AT.01","skillAreaKey":"readingAttitude","type":"assessor","part":12,"prompt":"How do you feel when someone reads a story to you?","scored":false,"responseChoices":[{"label":"Happy","value":3},{"label":"Just okay","value":2},{"label":"Sad","value":1}]},
    {"id":"L1A.AT.02","skillAreaKey":"readingAttitude","type":"assessor","part":12,"prompt":"How do you feel when you look at books by yourself?","scored":false,"responseChoices":[{"label":"Happy","value":3},{"label":"Just okay","value":2},{"label":"Sad","value":1}]},
    {"id":"L1A.AT.03","skillAreaKey":"readingAttitude","type":"assessor","part":12,"prompt":"How do you feel about learning to read?","scored":false,"responseChoices":[{"label":"Happy","value":3},{"label":"Just okay","value":2},{"label":"Sad","value":1}]},
    {"id":"L1A.AT.04","skillAreaKey":"readingAttitude","type":"assessor","part":12,"prompt":"Does someone at home read or tell stories with you?","scored":false,"responseChoices":[{"label":"Yes","value":"yes"},{"label":"Sometimes","value":"sometimes"},{"label":"No","value":"no"}]},
    {"id":"L1A.WT.01","skillAreaKey":"writing","type":"assessor","part":13,"row":1,"prompt":"Write your name on the first line.","maxScore":2,"accept":"2: The whole first name, readable. 1: The first letter, or at least two letters of the name. 0: Nothing, or marks that are not letters."},
    {"id":"L1A.WT.02","skillAreaKey":"writing","type":"assessor","part":13,"row":2,"prompt":"/s/","accept":"s"},
    {"id":"L1A.WT.03","skillAreaKey":"writing","type":"assessor","part":13,"row":2,"prompt":"/m/","accept":"m"},
    {"id":"L1A.WT.04","skillAreaKey":"writing","type":"assessor","part":13,"row":2,"prompt":"/t/","accept":"t"},
    {"id":"L1A.WT.05","skillAreaKey":"writing","type":"assessor","part":13,"row":2,"prompt":"/b/","accept":"b"},
    {"id":"L1A.WT.06","skillAreaKey":"writing","type":"assessor","part":13,"row":2,"prompt":"/i/","accept":"i"},
    {"id":"L1A.WT.07","skillAreaKey":"writing","type":"assessor","part":13,"row":3,"prompt":"tag","detail":"The shirt has a tag.","accept":"All three letters are correct and in the right order"},
    {"id":"L1A.WT.08","skillAreaKey":"writing","type":"assessor","part":13,"row":3,"prompt":"peg","detail":"Hang the cloth with a peg.","accept":"All three letters are correct and in the right order"},
    {"id":"L1A.WT.09","skillAreaKey":"writing","type":"assessor","part":13,"row":3,"prompt":"job","detail":"My mother has a job.","accept":"All three letters are correct and in the right order"},
    {"id":"L1A.WT.10","skillAreaKey":"writing","type":"assessor","part":13,"row":3,"prompt":"bun","detail":"I ate a bun.","accept":"All three letters are correct and in the right order"},
    {"id":"L1A.WT.11","skillAreaKey":"writing","type":"assessor","part":13,"row":4,"prompt":"The sentence starts with a capital letter"},
    {"id":"L1A.WT.12","skillAreaKey":"writing","type":"assessor","part":13,"row":4,"prompt":"There are clear spaces between the words"},
    {"id":"L1A.WT.13","skillAreaKey":"writing","type":"assessor","part":13,"row":4,"prompt":"The sentence ends with a full stop"},
    {"id":"L1A.WT.14","skillAreaKey":"writing","type":"assessor","part":13,"row":4,"prompt":"At least three of the five words are spelled correctly"}
  ]'::jsonb, true
where not exists (select 1 from public.assessments where level = 1 and form = 'A');

commit;

-- Ask the API to pick up the changes right away.
notify pgrst, 'reload schema';
