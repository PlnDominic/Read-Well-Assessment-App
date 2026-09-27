-- Automatic retry + admin alerting for report generation (TRD §7
-- Observability: "catch failed report generation before a teacher
-- notices"). Until now a failed PDF just sat there until a teacher or
-- admin happened to notice the "Retry PDF" button; there was also no way
-- to tell a report generation had silently stalled (e.g. the serverless
-- function running the after() callback was killed mid-render, leaving
-- status stuck at 'pending' forever with no error recorded anywhere).
--
-- attempted_at: set right before each generation attempt starts (see
-- generateStudentReport/generateSchoolReport in src/lib/reports.ts), so
-- the retry cron (src/app/api/cron/retry-failed-reports/route.ts) can tell
-- a 'pending' row that's been sitting untouched for too long apart from
-- one that's still legitimately in flight.
-- retry_count: how many *automatic* retries the cron has attempted.
-- Manual retries (the teacher/admin "Retry PDF" button) don't touch this,
-- so a human clicking retry never eats into the automatic budget.
-- last_error: the most recent generation failure, for the admin to see
-- without digging through server logs.
-- alerted_at: set once the automatic retry budget is exhausted and
-- administrators have been notified, so the same failure doesn't send a
-- fresh alert every time the cron runs. Cleared back to null whenever a
-- generation attempt (automatic or manual) succeeds, so a *future*
-- failure on the same report can alert again.

alter table public.student_reports
  add column attempted_at timestamptz,
  add column retry_count integer not null default 0,
  add column last_error text,
  add column alerted_at timestamptz;

alter table public.school_reports
  add column attempted_at timestamptz,
  add column retry_count integer not null default 0,
  add column last_error text,
  add column alerted_at timestamptz;
