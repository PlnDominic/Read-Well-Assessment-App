-- ⚠️  LOCAL DEVELOPMENT ONLY. DO NOT RUN THIS AGAINST A HOSTED/PRODUCTION
-- SUPABASE PROJECT. ⚠️
--
-- It creates two live login accounts with a password published in this
-- public repo ("readwell-demo"), fine on a throwaway local Postgres
-- instance, a real security hole on anything reachable from the internet.
-- For a real deployment, use supabase/bootstrap.sql to create your actual
-- first school and administrator instead.
--
-- Mirrors the mock data from the original clickable prototype (Ms. Rivera's
-- Grade 1 roster, Lincoln Elementary, the 5-item sample assessment) so the
-- real app can be exercised end-to-end without hand-entering content.
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

insert into public.skill_areas (id, key, name) values
  ('33333333-3333-3333-3333-333333333301', 'phonics', 'Phonemic Awareness / Phonics'),
  ('33333333-3333-3333-3333-333333333302', 'sightWords', 'Sight Word Recognition'),
  ('33333333-3333-3333-3333-333333333303', 'fluency', 'Fluency'),
  ('33333333-3333-3333-3333-333333333304', 'vocabulary', 'Vocabulary'),
  ('33333333-3333-3333-3333-333333333305', 'comprehension', 'Comprehension')
on conflict (id) do nothing;

insert into public.assessments (id, grade_level, version, items, is_active) values (
  '44444444-4444-4444-4444-444444444401',
  1,
  1,
  '[
    {
      "id": "q1", "skillAreaKey": "phonics", "type": "choice",
      "prompt": "Tap the word that starts with the same sound as this: /b/",
      "options": [
        {"text": "BALL", "isCorrect": true},
        {"text": "CAT", "isCorrect": false},
        {"text": "SUN", "isCorrect": false}
      ]
    },
    {
      "id": "q2", "skillAreaKey": "sightWords", "type": "choice",
      "prompt": "Tap the word: \"the\"",
      "options": [
        {"text": "THE", "isCorrect": true},
        {"text": "AND", "isCorrect": false},
        {"text": "SHE", "isCorrect": false}
      ]
    },
    {
      "id": "q3", "skillAreaKey": "fluency", "type": "mic",
      "prompt": "Tap the button and read this word out loud: \"jump\"",
      "expectedText": "jump"
    },
    {
      "id": "q4", "skillAreaKey": "vocabulary", "type": "choice",
      "prompt": "Which word means the same as \"happy\"?",
      "options": [
        {"text": "JOYFUL", "isCorrect": true},
        {"text": "SAD", "isCorrect": false},
        {"text": "ANGRY", "isCorrect": false}
      ]
    },
    {
      "id": "q5", "skillAreaKey": "comprehension", "type": "choice",
      "passage": "The dog ran to the park. It was sunny outside.",
      "prompt": "Where did the dog go?",
      "options": [
        {"text": "THE PARK", "isCorrect": true},
        {"text": "THE STORE", "isCorrect": false},
        {"text": "SCHOOL", "isCorrect": false}
      ]
    }
  ]'::jsonb,
  true
) on conflict (id) do nothing;

insert into public.recommendation_rules (skill_area_id, grade_level, recommendation_text, program_reference) values
  ('33333333-3333-3333-3333-333333333301', 1, 'Daily sound-blending drills from Read Well Foundations Level A, focusing on short-vowel patterns.', 'Read Well Foundations Level A'),
  ('33333333-3333-3333-3333-333333333302', 1, 'Flashcard review of the Read Well Grade 1 high-frequency word list, 10 minutes per day.', 'Read Well Grade 1 HFW List'),
  ('33333333-3333-3333-3333-333333333303', 1, 'Practice repeated readings of grade-level passages (Read Well Unit 4) to build reading rate and expression.', 'Read Well Unit 4'),
  ('33333333-3333-3333-3333-333333333304', 1, 'Pre-teach unit vocabulary using picture cards before each Read Well lesson.', 'Read Well Grade 1 Vocabulary Cards'),
  ('33333333-3333-3333-3333-333333333305', 1, 'Guided retelling practice after each passage using the Read Well comprehension question stems.', 'Read Well Grade 1 Comprehension Stems')
on conflict do nothing;

insert into public.assessment_cycles (id, school_id, name, starts_at, is_current) values
  ('55555555-5555-5555-5555-555555555501', '22222222-2222-2222-2222-222222222201', 'Fall Reading Assessment Cycle', '2026-09-01', true)
on conflict (id) do nothing;

insert into public.students (id, school_id, teacher_id, name, grade) values
  ('66666666-6666-6666-6666-666666666601', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Amara Johnson', 1),
  ('66666666-6666-6666-6666-666666666602', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Diego Martinez', 1),
  ('66666666-6666-6666-6666-666666666603', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Priya Shah', 1),
  ('66666666-6666-6666-6666-666666666604', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Noah Williams', 1),
  ('66666666-6666-6666-6666-666666666605', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Layla Chen', 1)
on conflict (id) do nothing;

-- Sessions: Amara/Diego/Layla completed, Priya in progress, Noah not started.
insert into public.assessment_sessions (id, student_id, assessment_id, cycle_id, status, session_code, current_item_index, started_at, completed_at, created_by) values
  ('77777777-7777-7777-7777-777777777701', '66666666-6666-6666-6666-666666666601', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501', 'completed', 'AMR001', 5, now() - interval '2 days', now() - interval '2 days' + interval '9 minutes', '11111111-1111-1111-1111-111111111101'),
  ('77777777-7777-7777-7777-777777777702', '66666666-6666-6666-6666-666666666602', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501', 'completed', 'DGO002', 5, now() - interval '2 days', now() - interval '2 days' + interval '11 minutes', '11111111-1111-1111-1111-111111111101'),
  ('77777777-7777-7777-7777-777777777703', '66666666-6666-6666-6666-666666666603', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501', 'in_progress', 'PRY003', 2, now() - interval '1 hour', null, '11111111-1111-1111-1111-111111111101'),
  ('77777777-7777-7777-7777-777777777705', '66666666-6666-6666-6666-666666666605', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501', 'completed', 'LYL005', 5, now() - interval '2 days', now() - interval '2 days' + interval '8 minutes', '11111111-1111-1111-1111-111111111101')
on conflict (id) do nothing;

-- Results matching the original prototype's mock report scores.
insert into public.results (session_id, skill_area_id, score, flagged_as_difficulty) values
  ('77777777-7777-7777-7777-777777777701', '33333333-3333-3333-3333-333333333301', 88, false),
  ('77777777-7777-7777-7777-777777777701', '33333333-3333-3333-3333-333333333303', 62, true),
  ('77777777-7777-7777-7777-777777777701', '33333333-3333-3333-3333-333333333304', 91, false),
  ('77777777-7777-7777-7777-777777777701', '33333333-3333-3333-3333-333333333305', 84, false),
  ('77777777-7777-7777-7777-777777777701', '33333333-3333-3333-3333-333333333302', 79, false),

  ('77777777-7777-7777-7777-777777777702', '33333333-3333-3333-3333-333333333301', 48, true),
  ('77777777-7777-7777-7777-777777777702', '33333333-3333-3333-3333-333333333303', 55, true),
  ('77777777-7777-7777-7777-777777777702', '33333333-3333-3333-3333-333333333304', 72, false),
  ('77777777-7777-7777-7777-777777777702', '33333333-3333-3333-3333-333333333305', 60, true),
  ('77777777-7777-7777-7777-777777777702', '33333333-3333-3333-3333-333333333302', 41, true),

  ('77777777-7777-7777-7777-777777777705', '33333333-3333-3333-3333-333333333301', 90, false),
  ('77777777-7777-7777-7777-777777777705', '33333333-3333-3333-3333-333333333303', 85, false),
  ('77777777-7777-7777-7777-777777777705', '33333333-3333-3333-3333-333333333304', 88, false),
  ('77777777-7777-7777-7777-777777777705', '33333333-3333-3333-3333-333333333305', 92, false),
  ('77777777-7777-7777-7777-777777777705', '33333333-3333-3333-3333-333333333302', 87, false)
on conflict do nothing;

insert into public.student_reports (student_id, session_id, overall_label, status) values
  ('66666666-6666-6666-6666-666666666601', '77777777-7777-7777-7777-777777777701', 'On Track', 'pending'),
  ('66666666-6666-6666-6666-666666666602', '77777777-7777-7777-7777-777777777702', 'Needs Support', 'pending'),
  ('66666666-6666-6666-6666-666666666605', '77777777-7777-7777-7777-777777777705', 'On Track', 'pending')
on conflict do nothing;

commit;
