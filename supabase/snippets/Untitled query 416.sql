-- Allow instructors to update/delete syllabus rows (edit course flow).

drop policy if exists "Instructors update modules for their courses" on public.modules;
create policy "Instructors update modules for their courses"
  on public.modules for update to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists "Instructors delete modules for their courses" on public.modules;
create policy "Instructors delete modules for their courses"
  on public.modules for delete to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists "Instructors update assignments for their modules" on public.assignments;
create policy "Instructors update assignments for their modules"
  on public.assignments for update to authenticated
  using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = assignments.module_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = assignments.module_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists "Instructors delete assignments for their modules" on public.assignments;
create policy "Instructors delete assignments for their modules"
  on public.assignments for delete to authenticated
  using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = assignments.module_id and c.instructor_id = auth.uid()
    )
  );
