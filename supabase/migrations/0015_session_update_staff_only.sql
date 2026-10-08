-- Reading specialists are read-only (0004_specialist_readonly.sql), but the
-- original assessment_sessions_update_scoped policy only checked
-- can_access_student(), which is also true for an assigned specialist. The
-- app itself never updates a session through a staff member's own session
-- (the kiosk routes use the service role), so this policy only mattered to
-- someone calling the Supabase API directly with their own login -- and it
-- let a specialist rewrite a student's session (status, code, progress).
-- Tighten it to teacher/administrator, same as the insert and delete
-- policies.

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
