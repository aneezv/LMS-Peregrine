-- Allow instructors/admins to read learner module progress for their courses.
-- This powers staff-facing progress views (e.g., enrollments page).

drop policy if exists "Staff view module progress for their courses" on public.module_progress;

create policy "Staff view module progress for their courses"
  on public.module_progress
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_progress.module_id
        and c.instructor_id = auth.uid()
    )
  );
