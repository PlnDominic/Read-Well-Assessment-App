-- Deactivating a staff account needs a fast, RLS-friendly source of truth.
-- The GoTrue admin API can ban a user (see deactivateStaff in
-- src/app/admin/staff/actions.ts, which does both), but querying "is this
-- user banned" isn't something the normal client can do, so we mirror it
-- here for the app's own reads (staff list, proxy.ts login gate).

alter table public.profiles add column is_active boolean not null default true;
