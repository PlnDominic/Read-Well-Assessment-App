-- Production bootstrap: creates your REAL first school and administrator.
-- Run this once against a hosted Supabase project, after the migrations in
-- supabase/migrations/. Do NOT run supabase/seed.sql there (that file
-- creates fake demo accounts with a password published in the public
-- repo; see its header comment).
--
-- Every account after this first one (teachers, specialists, more admins)
-- should be created from inside the running app itself, at /admin/staff;
-- that flow already creates the Supabase Auth user and the profiles row
-- together, correctly, via the service-role client. This script exists
-- only because *someone* has to create the very first administrator
-- before there's anyone signed in to use that screen.
--
-- Steps:
--   1. In the Supabase Dashboard: Authentication → Users → "Add user".
--      Enter the real administrator's email and a real password (or use
--      "Send invite" if you've configured an email provider). Copy the
--      new user's UUID once it's created.
--   2. Fill in the placeholders below (search for "REPLACE_"). For an
--      address you don't have yet, replace the whole quoted placeholder
--      with the bare word `null` (no quotes).
--   3. Run this whole script once in the SQL Editor.

begin;

with new_school as (
  insert into public.schools (name, address)
  values ('REPLACE_WITH_REAL_SCHOOL_NAME', 'REPLACE_WITH_REAL_SCHOOL_ADDRESS_OR_null')
  returning id
)
insert into public.profiles (id, school_id, name, email, role)
select
  'REPLACE_WITH_AUTH_USER_UUID_FROM_STEP_1',
  new_school.id,
  'REPLACE_WITH_REAL_ADMIN_NAME',
  'REPLACE_WITH_REAL_ADMIN_EMAIL',
  'administrator'
from new_school;

commit;

-- After this, log into the app with that email/password, then use
-- /admin/staff to invite real teachers and reading specialists, and
-- /admin/students (or a teacher's own roster page) to add real students,
-- no further SQL needed for any of that.
