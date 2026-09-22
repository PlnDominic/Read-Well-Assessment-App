-- PRD §4.1 acceptance criterion: "Attempting to assign a Grade 2 assessment
-- to a Grade 1 student is blocked." The application always resolves a
-- session's assessment by the student's own grade (see
-- startOrResumeAssessment in src/app/teacher/actions.ts), so a mismatch
-- can't currently happen through the UI — but that's a property of today's
-- application code, not a guarantee. Enforce it at the database layer too
-- (TRD §6: "All access rules enforced at the API/database layer, not just
-- the UI"), so it holds regardless of future code paths.

create function public.check_session_grade_match()
returns trigger
language plpgsql
as $$
declare
  student_grade smallint;
  assessment_grade smallint;
begin
  select grade into student_grade from public.students where id = new.student_id;
  select grade_level into assessment_grade from public.assessments where id = new.assessment_id;
  if student_grade is distinct from assessment_grade then
    raise exception 'Grade mismatch: student is grade %, assessment is grade %', student_grade, assessment_grade;
  end if;
  return new;
end;
$$;

create trigger assessment_sessions_grade_match
  before insert or update of student_id, assessment_id on public.assessment_sessions
  for each row execute function public.check_session_grade_match();
