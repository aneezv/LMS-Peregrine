-- Admins can create/update courses for any instructor; list profiles for instructor picker.

drop policy if exists "Admins insert any course" on public.courses;
create policy "Admins insert any course"
  on public.courses for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Admins update any course" on public.courses;
create policy "Admins update any course"
  on public.courses for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete any course" on public.courses;
create policy "Admins delete any course"
  on public.courses for delete to authenticated
  using (public.is_admin());

drop policy if exists "Admins select profiles" on public.profiles;
create policy "Admins select profiles"
  on public.profiles for select to authenticated
  using (public.is_admin());
