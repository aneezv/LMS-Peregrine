-- Course start (for week-based module unlock defaults), thumbnails, assignment copy,
-- offline sessions, module descriptions / venue.

alter table public.courses
  add column if not exists starts_at timestamptz;

alter table public.assignments
  add column if not exists description text;

alter table public.modules
  add column if not exists description text;

alter table public.modules
  add column if not exists session_location text;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'module_type'
      and e.enumlabel = 'offline_session'
  ) then
    alter type public.module_type add value 'offline_session';
  end if;
end $$;
