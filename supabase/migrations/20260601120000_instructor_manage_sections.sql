-- Allow instructors to update and delete sections for courses they own.
-- Admins already have full access via "Admins manage all sections".

create policy "Instructors update sections for their courses" on public.sections
  for update to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = sections.course_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = sections.course_id and c.instructor_id = auth.uid()
    )
  );

create policy "Instructors delete sections for their courses" on public.sections
  for delete to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = sections.course_id and c.instructor_id = auth.uid()
    )
  );
