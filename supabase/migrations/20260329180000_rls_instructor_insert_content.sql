-- Course Builder inserts sections/modules/assignments as the course owner.
-- Previously only SELECT was allowed → PostgREST returned 403 on POST.

drop policy if exists "Instructors insert sections for their courses" on public.sections;
create policy "Instructors insert sections for their courses"
  on public.sections for insert to authenticated
  with check (
    exists (
      select 1 from public.courses c
      where c.id = sections.course_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists "Instructors insert modules for their courses" on public.modules;
create policy "Instructors insert modules for their courses"
  on public.modules for insert to authenticated
  with check (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists "Instructors insert assignments for their modules" on public.assignments;
create policy "Instructors insert assignments for their modules"
  on public.assignments for insert to authenticated
  with check (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = assignments.module_id and c.instructor_id = auth.uid()
    )
  );
