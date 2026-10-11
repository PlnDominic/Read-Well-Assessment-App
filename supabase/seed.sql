-- ⚠️  LOCAL DEVELOPMENT ONLY. DO NOT RUN THIS AGAINST A HOSTED/PRODUCTION
-- SUPABASE PROJECT. ⚠️
--
-- It creates two live login accounts with a password published in this
-- public repo ("readwell-demo"), fine on a throwaway local Postgres
-- instance, a real security hole on anything reachable from the internet.
-- For a real deployment, use supabase/bootstrap.sql to create your actual
-- first school and administrator instead.
--
-- Ms. Rivera's Level 1 class at Lincoln Elementary, with a current
-- assessment cycle, so the real app can be exercised end to end without
-- hand-entering a roster. Level 1 Form A itself comes from the migrations
-- (0016, 0017); there are no pre-made sessions: start one from the class
-- list and pick Form A to try the assessor screen.
--
-- Uses fixed UUIDs (rather than gen_random_uuid()) so this file is safe to
-- re-run against a fresh `supabase db reset` and so the demo login ids are
-- easy to reference from docs/tests.
--
-- NOTE: seeding rows directly into auth.users/auth.identities depends on
-- the GoTrue schema shipped with the Supabase CLI's local Postgres image.
-- It is not something to replicate against a hosted project even for a
-- one-off; see supabase/bootstrap.sql for the supported way to create a
-- real account there.

begin;

-- ---------------------------------------------------------------------------
-- Staff auth accounts (password for both: "readwell-demo")
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111101',
    'authenticated', 'authenticated',
    'rivera@lincoln-elementary.edu',
    crypt('readwell-demo', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111102',
    'authenticated', 'authenticated',
    'chen@lincoln-elementary.edu',
    crypt('readwell-demo', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  )
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111101',
    jsonb_build_object('sub', '11111111-1111-1111-1111-111111111101', 'email', 'rivera@lincoln-elementary.edu'),
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111102',
    '11111111-1111-1111-1111-111111111102',
    jsonb_build_object('sub', '11111111-1111-1111-1111-111111111102', 'email', 'chen@lincoln-elementary.edu'),
    'email', now(), now(), now()
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Domain data
-- ---------------------------------------------------------------------------

insert into public.schools (id, name, address) values
  ('22222222-2222-2222-2222-222222222201', 'Lincoln Elementary', '100 Lincoln Ave')
on conflict (id) do nothing;

insert into public.profiles (id, school_id, name, email, role) values
  ('11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201', 'Ms. Rivera', 'rivera@lincoln-elementary.edu', 'teacher'),
  ('11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222201', 'Dr. Chen', 'chen@lincoln-elementary.edu', 'administrator')
on conflict (id) do nothing;

-- Vocabulary is the one Level 1 strand skill area the migrations leave to
-- starter content (setup.sql adds it on hosted projects).
insert into public.skill_areas (key, name) values ('vocabulary', 'Vocabulary')
on conflict (key) do nothing;

insert into public.assessment_cycles (id, school_id, name, starts_at, is_current) values
  ('55555555-5555-5555-5555-555555555501', '22222222-2222-2222-2222-222222222201', 'Fall Reading Assessment Cycle', '2026-09-01', true)
on conflict (id) do nothing;

insert into public.students (id, school_id, teacher_id, name, level) values
  ('66666666-6666-6666-6666-666666666601', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Amara Johnson', 1),
  ('66666666-6666-6666-6666-666666666602', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Diego Martinez', 1),
  ('66666666-6666-6666-6666-666666666603', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Priya Shah', 1),
  ('66666666-6666-6666-6666-666666666604', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Noah Williams', 1),
  ('66666666-6666-6666-6666-666666666605', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Layla Chen', 1)
on conflict (id) do nothing;

commit;
