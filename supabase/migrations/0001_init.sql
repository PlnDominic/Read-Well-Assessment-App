-- Read Well Assessment App: core schema
-- Implements the data model from the TRD (section 3) plus supporting
-- tables (assessment_cycles, audit_log) needed to make the school-wide
-- report and access-audit requirements concrete.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Reference / tenant tables
-- ---------------------------------------------------------------------------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

create type public.user_role as enum ('teacher', 'reading_specialist', 'administrator');

-- One row per staff member (students do not authenticate; see TRD §6).
-- id matches auth.users.id.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete restrict,
  name text not null,
  email text not null,
  role public.user_role not null,
  created_at timestamptz not null default now()
);

create index profiles_school_id_idx on public.profiles (school_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  grade smallint not null,
  created_at timestamptz not null default now()
);

create index students_school_id_idx on public.students (school_id);
create index students_teacher_id_idx on public.students (teacher_id);

-- Reading specialists are assigned to specific students (TRD §4.5 / §6).
create table public.specialist_assignments (
  specialist_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (specialist_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Assessment content (configurable by the program team, not hard-coded)
-- ---------------------------------------------------------------------------

create table public.skill_areas (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- e.g. 'phonics', 'fluency'
  name text not null -- display label
);

-- items is a jsonb array of:
--  { id, skillAreaKey, type: 'choice' | 'mic', prompt, passage?,
--    options?: [{ text, isCorrect }] }
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  grade_level smallint not null,
  version integer not null default 1,
  items jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (grade_level, version)
);

create table public.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  skill_area_id uuid not null references public.skill_areas (id) on delete cascade,
  grade_level smallint not null,
  recommendation_text text not null,
  program_reference text,
  created_at timestamptz not null default now()
);

create index recommendation_rules_lookup_idx
  on public.recommendation_rules (skill_area_id, grade_level);

-- ---------------------------------------------------------------------------
-- Assessment cycles (a school-wide report is generated per cycle)
-- ---------------------------------------------------------------------------

create table public.assessment_cycles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null, -- e.g. "Fall 2026"
  starts_at date not null,
  ends_at date,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create index assessment_cycles_school_idx on public.assessment_cycles (school_id);

-- ---------------------------------------------------------------------------
-- Assessment sessions, responses, results
-- ---------------------------------------------------------------------------

create type public.session_status as enum ('not_started', 'in_progress', 'completed');

create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  cycle_id uuid not null references public.assessment_cycles (id) on delete restrict,
  status public.session_status not null default 'not_started',
  -- Short code a student enters on a shared/kiosk device to resume this
  -- specific session (TRD §6: teacher-initiated, no independent student auth).
  session_code text not null unique,
  current_item_index integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index assessment_sessions_student_idx on public.assessment_sessions (student_id);
create index assessment_sessions_cycle_idx on public.assessment_sessions (cycle_id);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  item_id text not null,
  answer jsonb not null,
  is_correct boolean,
  answered_at timestamptz not null default now(),
  unique (session_id, item_id)
);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  skill_area_id uuid not null references public.skill_areas (id) on delete restrict,
  score smallint not null check (score between 0 and 100),
  flagged_as_difficulty boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, skill_area_id)
);

-- ---------------------------------------------------------------------------
-- Generated reports
-- ---------------------------------------------------------------------------

create table public.student_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  session_id uuid not null unique references public.assessment_sessions (id) on delete cascade,
  overall_label text not null,
  generated_at timestamptz not null default now(),
  pdf_path text, -- storage object path; signed URLs are minted on demand
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed'))
);

create table public.school_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  cycle_id uuid not null references public.assessment_cycles (id) on delete cascade,
  generated_at timestamptz not null default now(),
  pdf_path text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  unique (school_id, cycle_id)
);

-- ---------------------------------------------------------------------------
-- Audit log (TRD §8: audit who accessed/exported a student's report)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null, -- e.g. 'report.view', 'report.export'
  resource_type text not null, -- 'student_report' | 'school_report'
  resource_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_resource_idx on public.audit_log (resource_type, resource_id);
