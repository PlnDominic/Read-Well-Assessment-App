-- Lets a teacher or administrator cancel a session that was started by
-- mistake or needs restarting (no delete policy existed before this; the
-- table defaulted to deny-all for deletes). Deliberately excludes completed
-- sessions: cancelling a finished, scored assessment should be a distinct,
-- more deliberate action than this one-click "start over" affordance.

create policy assessment_sessions_delete_staff on public.assessment_sessions
  for delete to authenticated
  using (
    public.current_profile_role() in ('teacher', 'administrator')
    and public.can_access_student(student_id)
    and status <> 'completed'
  );
