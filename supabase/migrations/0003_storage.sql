-- Private bucket for generated student/school report PDFs.
--
-- No client-facing storage policies are defined on purpose: every read goes
-- through a Route Handler using the service-role client, which checks the
-- caller's access via can_access_student()/is_administrator() *before*
-- minting a short-lived signed URL (TRD §8: reports must not be publicly
-- accessible by guessable URL, and access must match the student's report
-- permissions).

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;
