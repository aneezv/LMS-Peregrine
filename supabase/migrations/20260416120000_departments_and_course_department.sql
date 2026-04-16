-- Departments lookup + courses.department_id (scalable catalog grouping).

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create unique index departments_name_lower_key
  on public.departments (lower(trim(name)));

create index departments_sort_order_idx
  on public.departments (sort_order, name);

insert into public.departments (name, sort_order)
values ('General', 0);

alter table public.courses
  add column department_id uuid references public.departments (id);

update public.courses c
set department_id = d.id
from public.departments d
where c.department_id is null
  and lower(trim(d.name)) = 'general';

alter table public.courses
  alter column department_id set not null;

create index courses_department_id_idx on public.courses (department_id);

-- Supports published catalog: filter by status/enrollment + optional department + order by created_at
create index courses_catalog_list_idx
  on public.courses (status, enrollment_type, department_id, created_at desc, id desc);

alter table public.departments enable row level security;

create policy "Authenticated read departments"
  on public.departments
  for select
  to authenticated
  using (true);

create policy "Admins insert departments"
  on public.departments
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins update departments"
  on public.departments
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete departments"
  on public.departments
  for delete
  to authenticated
  using (public.is_admin());

revoke all on public.departments from public;
grant select on public.departments to authenticated;
grant insert, update, delete on public.departments to authenticated;
