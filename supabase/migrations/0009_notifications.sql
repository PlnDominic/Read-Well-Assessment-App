-- In-app notifications: a teacher is notified when their student's report
-- finishes generating; every administrator at a school is notified when
-- the school-wide report finishes. Rows are written by the report
-- generation service (src/lib/reports.ts) via the service-role client;
-- there is deliberately no client-facing insert policy, same pattern as
-- audit_log, but a recipient can read and mark their own as read.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  message text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_recipient_id_created_at_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

-- Only lets a recipient flip their own `read` flag; the with check mirrors
-- `using` rather than re-validating other columns, since there's nothing
-- else on the row a client should be able to change.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
