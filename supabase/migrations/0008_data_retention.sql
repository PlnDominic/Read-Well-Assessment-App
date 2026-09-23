-- Per-school data retention. The TRD flags the actual retention policy as
-- unconfirmed, so this defaults to NULL (disabled) rather than guessing a
-- number — an administrator opts in from /admin/settings if/when their
-- school has a real policy to enforce.
--
-- No client-facing update policy is added on purpose, matching the existing
-- pattern for schools/assessments/recommendation_rules (see 0002_rls.sql):
-- the admin settings form goes through requireAdmin() + the service-role
-- client instead.

alter table public.schools
  add column if not exists data_retention_days integer;

alter table public.schools
  add constraint schools_data_retention_days_positive
    check (data_retention_days is null or data_retention_days > 0);
