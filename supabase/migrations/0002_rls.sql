-- Row Level Security for the Read Well Assessment App.
--
-- Architecture note: students never authenticate (TRD §6), so the
-- student-facing assessment flow (redeeming a session code, autosaving
-- responses, completing a session) is served by Next.js Route Handlers
-- using the Supabase *service role* key, a server-only credential that
-- bypasses RLS, with authorization enforced in application code against
-- the session_code. RLS below governs everything staff (teacher / reading
-- specialist / administrator) access through their own authenticated
-- session, which is the boundary the TRD requires to be enforced at the
-- API/database layer, not just the UI.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they don't recurse through the RLS
-- of the tables they read).
-- ---------------------------------------------------------------------------

create function public.current_profile_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.current_profile_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid();
$$;

create function public.is_administrator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() = 'administrator';
$$;

create function public.can_access_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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

create function public.can_access_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assessment_sessions sess
    where sess.id = target_session_id
      and public.can_access_student(sess.student_id)
  );
$$;

revoke execute on function public.current_profile_role() from public;
revoke execute on function public.current_profile_school_id() from public;
revoke execute on function public.is_administrator() from public;
revoke execute on function public.can_access_student(uuid) from public;
revoke execute on function public.can_access_session(uuid) from public;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_school_id() to authenticated;
grant execute on function public.is_administrator() to authenticated;
grant execute on function public.can_access_student(uuid) to authenticated;
grant execute on function public.can_access_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- schools
-- ---------------------------------------------------------------------------

create policy schools_select_own on public.schools
  for select to authenticated
  using (id = public.current_profile_school_id());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (public.is_administrator() and school_id = public.current_profile_school_id())
  );

-- No client-side insert/update/delete: staff accounts are provisioned via
-- the service role (admin invite flow), not directly by end users.

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------

create policy students_select_scoped on public.students
  for select to authenticated
  using (public.can_access_student(id));

create policy students_insert_teacher_or_admin on public.students
  for insert to authenticated
  with check (
    school_id = public.current_profile_school_id()
    and (
      (public.current_profile_role() = 'teacher' and teacher_id = auth.uid())
      or public.is_administrator()
    )
  );

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

create policy students_delete_admin_only on public.students
  for delete to authenticated
  using (public.is_administrator() and school_id = public.current_profile_school_id());

-- ---------------------------------------------------------------------------
-- specialist_assignments
-- ---------------------------------------------------------------------------

create policy specialist_assignments_select on public.specialist_assignments
  for select to authenticated
  using (
    specialist_id = auth.uid()
    or (public.is_administrator() and public.can_access_student(student_id))
  );

create policy specialist_assignments_write_admin_only on public.specialist_assignments
  for all to authenticated
  using (public.is_administrator() and public.can_access_student(student_id))
  with check (public.is_administrator() and public.can_access_student(student_id));

-- ---------------------------------------------------------------------------
-- reference data: skill_areas, assessments, recommendation_rules
-- (readable by any signed-in staff member; writes are managed via
-- migrations/seed or a future admin content tool, not the app's RLS)
-- ---------------------------------------------------------------------------

create policy skill_areas_select_staff on public.skill_areas
  for select to authenticated using (true);

create policy assessments_select_staff on public.assessments
  for select to authenticated using (true);

create policy recommendation_rules_select_staff on public.recommendation_rules
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- assessment_cycles
-- ---------------------------------------------------------------------------

create policy assessment_cycles_select_own_school on public.assessment_cycles
  for select to authenticated
  using (school_id = public.current_profile_school_id());

create policy assessment_cycles_write_admin_only on public.assessment_cycles
  for all to authenticated
  using (public.is_administrator() and school_id = public.current_profile_school_id())
  with check (public.is_administrator() and school_id = public.current_profile_school_id());

-- ---------------------------------------------------------------------------
-- assessment_sessions / responses / results / reports
-- (all scoped through can_access_student / can_access_session; students
-- reach the underlying rows only via the service-role Route Handlers)
-- ---------------------------------------------------------------------------

create policy assessment_sessions_select_scoped on public.assessment_sessions
  for select to authenticated
  using (public.can_access_student(student_id));

create policy assessment_sessions_insert_staff on public.assessment_sessions
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_student(student_id));

create policy assessment_sessions_update_scoped on public.assessment_sessions
  for update to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));

create policy responses_select_scoped on public.responses
  for select to authenticated
  using (public.can_access_session(session_id));

create policy results_select_scoped on public.results
  for select to authenticated
  using (public.can_access_session(session_id));

create policy student_reports_select_scoped on public.student_reports
  for select to authenticated
  using (public.can_access_student(student_id));

create policy school_reports_select_admin_only on public.school_reports
  for select to authenticated
  using (public.is_administrator() and school_id = public.current_profile_school_id());

-- audit_log has no client-facing policies: it is written and read via the
-- service role only (background jobs / future admin tooling).
