-- ReadWell levels replace grades, and each level has four assessments:
-- Form A, Form B, Form C and the Final assessment. The teacher picks
-- which one a child takes each time. A form is either assessor-led (an
-- adult scores it one to one) or a game the child plays on their own
-- device with a join code (the kiosk flow).
--
-- 1. students.grade, assessments.grade_level and
--    recommendation_rules.grade_level become `level`.
-- 2. assessments.form says which of the four a row is. The active game
--    content for each level (e.g. the Level 2 quest) becomes that level's
--    Form A, unless Form A is already taken. Any other row from before this
--    change keeps form NULL and is switched off; sessions already taken
--    against it still point at it, so their reports keep working.
-- 3. The ReadWell Level 1 Form A content (seeded at grade -1 by 0016)
--    becomes Level 1, Form A.
-- 4. Students placed in KG 1 or KG 2 (grades -1 and 0) move to Level 1;
--    every other student keeps their number as their level. Check
--    placements on the Students page after running this.
-- 5. Only game sessions need a join code; assessor-led ones have none.
-- 6. The grade-match guard (0006, 0014) becomes a level-match guard.

-- A stray level column that someone added by hand before this migration
-- (say, in the table editor, after the app reported it missing) would block
-- the renames below. It's set aside as level_unused rather than dropped, so
-- nothing in it is lost; drop it once you've checked it's empty.
do $$
declare r record;
begin
  for r in
    select * from (values ('students', 'grade'), ('assessments', 'grade_level'), ('recommendation_rules', 'grade_level')) as v(tbl, old_col)
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = r.tbl and column_name = r.old_col)
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = r.tbl and column_name = 'level') then
      execute format('alter table public.%I rename column level to level_unused', r.tbl);
    end if;
  end loop;
end $$;

alter table public.students rename column grade to level;
alter table public.assessments rename column grade_level to level;
alter table public.recommendation_rules rename column grade_level to level;

alter table public.assessments add column form text;
alter table public.assessments add constraint assessments_form_check
  check (form in ('A', 'B', 'C', 'Final'));

-- One version series per level and form, not per level.
alter table public.assessments drop constraint if exists assessments_grade_level_version_key;

update public.assessments
set level = 1, form = 'A'
where form is null and items -> 0 ->> 'id' like 'L1A.%';

update public.assessments a
set form = 'A'
where a.id in (
    -- Nothing stopped two being active at once before; take the newest.
    select distinct on (level) id from public.assessments
    where form is null and is_active
    order by level, version desc
  )
  and not exists (
    select 1 from public.assessments b
    where b.level = a.level and b.form = 'A' and b.id <> a.id
  );

update public.assessments set is_active = false where form is null and is_active;

alter table public.assessments add constraint assessments_level_form_version_key
  unique (level, form, version);

-- At most one active assessment per level and form: that's the one a
-- teacher's pick starts.
create unique index assessments_one_active_per_form
  on public.assessments (level, form)
  where is_active and form is not null;

update public.students set level = 1 where level < 1;
alter table public.students add constraint students_level_positive check (level >= 1);

alter table public.assessment_sessions alter column session_code drop not null;

drop trigger if exists assessment_sessions_grade_match on public.assessment_sessions;
drop function if exists public.check_session_grade_match();

-- A session's assessment must be for the student's own level. grade_override
-- (0014) is still honoured so sessions created with an override before this
-- change can be updated; nothing sets it any more.
create function public.check_session_level_match()
returns trigger
language plpgsql
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

create trigger assessment_sessions_level_match
  before insert or update of student_id, assessment_id, grade_override on public.assessment_sessions
  for each row execute function public.check_session_level_match();

notify pgrst, 'reload schema';
