-- Teacher review of automatically scored read-aloud (mic) answers.
--
-- Mic items are scored by a lenient transcript match (lib/kiosk.ts's
-- evaluateResponse), which can't hear what the teacher heard in the room:
-- a noisy transcript, an accent, or a browser without SpeechRecognition
-- (the "attempted" fallback) all produce a score the teacher may know is
-- wrong. The teacher (or an administrator) can now mark such an answer
-- correct/incorrect from the report page; the session is re-scored and the
-- report regenerated from the corrected value.
--
-- is_correct stays the one value scoring reads. auto_is_correct preserves
-- what the automatic scorer originally said (captured on the first review)
-- so the report can show that a score was changed and a review can be
-- reset; reviewed_by/reviewed_at record who changed it and when. All three
-- are null for a response nobody has reviewed.

alter table public.responses
  add column auto_is_correct boolean,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;

-- No client-facing update policy: reviews are written through the
-- reviewSpokenAnswer server action with the service role, after it checks
-- the caller is the student's teacher or a school administrator (reading
-- specialists stay read-only, per 0004_specialist_readonly.sql).
