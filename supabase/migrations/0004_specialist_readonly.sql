-- Reading specialists can view reports for their assigned students (PRD
-- §4.5) but should not be able to administer assessments themselves, only
-- teachers and administrators start/resume a session. The original
-- assessment_sessions_insert_staff policy only checked can_access_student(),
-- which (correctly) also returns true for an assigned specialist, so it
-- under-restricted this one write. Tighten it to teacher/administrator only.

drop policy if exists assessment_sessions_insert_staff on public.assessment_sessions;

create policy assessment_sessions_insert_staff on public.assessment_sessions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.current_profile_role() in ('teacher', 'administrator')
    and public.can_access_student(student_id)
  );
