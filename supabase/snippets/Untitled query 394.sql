-- Instructors/admins must read enrollments to build session rosters and see learner names.
-- Previously only "learner_id = auth.uid()" allowed SELECT, so attendance sheet saw zero rows.

create policy "Instructors view enrollments for their courses"
  on public.enrollments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = enrollments.course_id
        and c.instructor_id = auth.uid()
    )
  );

create policy "Admins view all enrollments"
  on public.enrollments
  for select
  to authenticated
  using (public.is_admin());
