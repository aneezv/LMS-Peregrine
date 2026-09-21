-- Make modules (lessons) publicly available for published courses
drop policy if exists "Users view modules" on public.modules;
create policy "Users view modules" on public.modules for select
  using (exists (select 1 from public.courses where courses.id = modules.course_id and (courses.status = 'published' or courses.instructor_id = auth.uid())));

-- Make sections publicly available for published courses
drop policy if exists "Users view sections" on public.sections;
create policy "Users view sections" on public.sections for select
  using (exists (select 1 from public.courses where courses.id = sections.course_id and (courses.status = 'published' or courses.instructor_id = auth.uid())));

-- Make instructor profiles publicly available for published courses
drop policy if exists "View instructors of published courses" on public.profiles;
create policy "View instructors of published courses" on public.profiles
  for select
  using (
    exists (
      select 1 from public.courses c
      where c.instructor_id = profiles.id and c.status = 'published'
    )
  );
