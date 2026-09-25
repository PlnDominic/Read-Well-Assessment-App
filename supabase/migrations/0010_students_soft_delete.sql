-- Soft delete for students: an admin "delete" now sets deleted_at instead
-- of removing the row, so an accidental delete (or a student who left
-- mid-cycle and comes back) is recoverable, and historical assessment data
-- tied to the student isn't destroyed. NULL means active.
alter table public.students add column deleted_at timestamptz;

-- Hides soft-deleted students from every normal read (rosters, dashboards,
-- CSV export, session creation) without touching can_access_student(), so
-- a direct link to an already-generated report for a deleted student still
-- resolves -- soft delete removes a student from view, not their history.
-- Restoring/listing deleted students goes through the service-role client
-- instead (see admin/students/actions.ts), same pattern as other
-- admin-only reads that need to see past what RLS normally allows.
drop policy students_select_scoped on public.students;
create policy students_select_scoped on public.students
  for select to authenticated
  using (deleted_at is null and public.can_access_student(id));
