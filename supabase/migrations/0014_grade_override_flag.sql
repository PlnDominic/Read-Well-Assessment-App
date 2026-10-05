-- Lets an explicit, audited grade override through the grade-match guard
-- from 0006. PRD §4.1: assigning a mismatched-grade assessment is "blocked
-- or requires explicit override with a warning". The guard still blocks
-- every mismatch except a session created by overrideStudentGrade
-- (src/lib/kiosk.ts), which sets grade_override and writes an audit_log row.

alter table public.assessment_sessions
  add column if not exists grade_override boolean not null default false;

create or replace function public.check_session_grade_match()
returns trigger
language plpgsql
as $$
declare
  student_grade smallint;
  assessment_grade smallint;
begin
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
