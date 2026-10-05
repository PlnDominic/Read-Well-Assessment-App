-- Read Well Assessment App: complete database setup in one file.
--
-- Paste the whole file into Supabase -> SQL Editor -> Run, in the project
-- your app uses (Project Settings -> API -> Project URL must match the
-- app's NEXT_PUBLIC_SUPABASE_URL).
--
-- Safe to run on a brand-new project, on a project that ran only some of
-- the migrations, and again on one that already ran all of this: every
-- statement checks before it creates or changes anything. It is the
-- migrations in supabase/migrations/ (0001-0014) folded together, plus the
-- reports storage bucket and starter Grade 1 content. It creates no login
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
  grade smallint not null,
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
  grade_level smallint not null,
  version integer not null default 1,
  items jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (grade_level, version)
);

create table if not exists public.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  skill_area_id uuid not null references public.skill_areas (id) on delete cascade,
  grade_level smallint not null,
  recommendation_text text not null,
  program_reference text,
  created_at timestamptz not null default now()
);
create index if not exists recommendation_rules_lookup_idx
  on public.recommendation_rules (skill_area_id, grade_level);

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
  session_code text not null unique,
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
-- Grade-match guard (0006, relaxed by 0014 for explicit overrides)
-- ===========================================================================

create or replace function public.check_session_grade_match()
returns trigger language plpgsql
as $$
declare
  student_grade smallint;
  assessment_grade smallint;
begin
  -- An explicit, audited override (overrideStudentGrade in src/lib/kiosk.ts)
  -- is the one allowed mismatch: PRD §4.1 says "blocked or requires explicit
  -- override with a warning".
  if new.grade_override then
    return new;
  end if;
  select grade into student_grade from public.students where id = new.student_id;
  select grade_level into assessment_grade from public.assessments where id = new.assessment_id;
  if student_grade is distinct from assessment_grade then
    raise exception 'Grade mismatch: student is grade %, assessment is grade %', student_grade, assessment_grade;
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_sessions_grade_match on public.assessment_sessions;
create trigger assessment_sessions_grade_match
  before insert or update of student_id, assessment_id, grade_override on public.assessment_sessions
  for each row execute function public.check_session_grade_match();

-- ===========================================================================
-- Row Level Security (0002, 0004, 0007, 0009, 0010, 0011)
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
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));

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
-- Starter Grade 1 content (skill areas, one assessment, recommendations).
-- Editable afterwards at /admin/content. Only added where missing, so this
-- never overwrites content you've changed.
-- ===========================================================================

insert into public.skill_areas (key, name) values
  ('phonics', 'Phonemic Awareness / Phonics'),
  ('sightWords', 'Sight Word Recognition'),
  ('fluency', 'Fluency'),
  ('vocabulary', 'Vocabulary'),
  ('comprehension', 'Comprehension')
on conflict (key) do nothing;

insert into public.assessments (grade_level, version, items, is_active)
select 1, 1, '[
    {"id": "q1", "skillAreaKey": "phonics", "type": "choice",
     "prompt": "Tap the word that starts with the same sound as this: /b/",
     "options": [{"text": "BALL", "isCorrect": true}, {"text": "CAT", "isCorrect": false}, {"text": "SUN", "isCorrect": false}]},
    {"id": "q2", "skillAreaKey": "sightWords", "type": "choice",
     "prompt": "Tap the word: \"the\"",
     "options": [{"text": "THE", "isCorrect": true}, {"text": "AND", "isCorrect": false}, {"text": "SHE", "isCorrect": false}]},
    {"id": "q3", "skillAreaKey": "fluency", "type": "mic",
     "prompt": "Tap the button and read this word out loud: \"jump\"", "expectedText": "jump"},
    {"id": "q4", "skillAreaKey": "vocabulary", "type": "choice",
     "prompt": "Which word means the same as \"happy\"?",
     "options": [{"text": "JOYFUL", "isCorrect": true}, {"text": "SAD", "isCorrect": false}, {"text": "ANGRY", "isCorrect": false}]},
    {"id": "q5", "skillAreaKey": "comprehension", "type": "choice",
     "passage": "The dog ran to the park. It was sunny outside.",
     "prompt": "Where did the dog go?",
     "options": [{"text": "THE PARK", "isCorrect": true}, {"text": "THE STORE", "isCorrect": false}, {"text": "SCHOOL", "isCorrect": false}]}
  ]'::jsonb, true
where not exists (select 1 from public.assessments where grade_level = 1);

insert into public.recommendation_rules (skill_area_id, grade_level, recommendation_text, program_reference)
select sa.id, 1, r.text, r.ref
from (values
  ('phonics', 'Daily sound-blending drills from Read Well Foundations Level A, focusing on short-vowel patterns.', 'Read Well Foundations Level A'),
  ('sightWords', 'Flashcard review of the Read Well Grade 1 high-frequency word list, 10 minutes per day.', 'Read Well Grade 1 HFW List'),
  ('fluency', 'Practice repeated readings of grade-level passages (Read Well Unit 4) to build reading rate and expression.', 'Read Well Unit 4'),
  ('vocabulary', 'Pre-teach unit vocabulary using picture cards before each Read Well lesson.', 'Read Well Grade 1 Vocabulary Cards'),
  ('comprehension', 'Guided retelling practice after each passage using the Read Well comprehension question stems.', 'Read Well Grade 1 Comprehension Stems')
) as r(key, text, ref)
join public.skill_areas sa on sa.key = r.key
where not exists (
  select 1 from public.recommendation_rules rr where rr.skill_area_id = sa.id and rr.grade_level = 1
);

commit;

-- Ask the API to pick up the changes right away.
notify pgrst, 'reload schema';
