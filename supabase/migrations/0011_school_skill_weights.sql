-- Per-school customization of the scoring rubric: how much each skill area
-- counts toward a weighted overall score, and an optional override of the
-- global flagged-score threshold (lib/theme.ts's FLAGGED_SCORE_THRESHOLD)
-- for that skill area at that school. A school with no row for a given
-- skill area gets weight 1.0 and the global threshold -- this table only
-- holds the overrides admins actually set (see admin/content actions.ts).
create table public.school_skill_weights (
  school_id uuid not null references public.schools (id) on delete cascade,
  skill_area_id uuid not null references public.skill_areas (id) on delete cascade,
  weight numeric(4,2) not null default 1.0 check (weight > 0),
  flagged_threshold smallint check (flagged_threshold between 0 and 100),
  primary key (school_id, skill_area_id)
);

alter table public.school_skill_weights enable row level security;

create policy school_skill_weights_select_own_school on public.school_skill_weights
  for select to authenticated
  using (school_id = public.current_profile_school_id());

-- No client-facing write policy: edited through the admin Content page via
-- the service role (requireAdmin()-gated), same pattern as skill_areas and
-- assessments.
