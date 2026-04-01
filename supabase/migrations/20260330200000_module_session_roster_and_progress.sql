-- Session roster (instructor/admin) + submission graded → module_progress

-- ──────────────────────────────────────────────
-- Instructor-marked attendance per session module
-- ──────────────────────────────────────────────
create table public.module_session_roster (
  id                    uuid primary key default gen_random_uuid(),
  module_id             uuid not null references public.modules(id) on delete cascade,
  learner_id            uuid not null references public.profiles(id) on delete cascade,
  is_present              boolean not null default true,
  roster_submitted_at     timestamptz,
  updated_at            timestamptz not null default now(),
  last_marked_by        uuid references public.profiles(id) on delete set null,
  unique (module_id, learner_id)
);

create index module_session_roster_module_id_idx on public.module_session_roster(module_id);

alter table public.module_session_roster enable row level security;

create policy "Learners read own session roster row"
  on public.module_session_roster
  for select
  to authenticated
  using (learner_id = auth.uid());

create policy "Staff manage session roster"
  on public.module_session_roster
  for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_session_roster.module_id
        and c.instructor_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_session_roster.module_id
        and c.instructor_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────
-- Graded assignment → mark module complete (first grade only; re-grade unchanged)
-- ──────────────────────────────────────────────
create or replace function public.mark_module_progress_on_submission_graded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.graded_at is null then
    return new;
  end if;
  if tg_op = 'update' and old.graded_at is not null then
    return new;
  end if;

  insert into public.module_progress (module_id, learner_id, is_completed, completed_at, watch_pct)
  select a.module_id, new.learner_id, true, now(), 100
  from public.assignments a
  where a.id = new.assignment_id
  on conflict (module_id, learner_id) do update
    set is_completed = true,
        completed_at = coalesce(module_progress.completed_at, excluded.completed_at),
        watch_pct = greatest(module_progress.watch_pct, excluded.watch_pct);

  return new;
end;
$$;

create trigger submissions_mark_module_progress_on_grade
  after insert or update of graded_at on public.submissions
  for each row
  execute function public.mark_module_progress_on_submission_graded();

-- ──────────────────────────────────────────────
-- Session roster (after submit) → module_progress for present learners
-- ──────────────────────────────────────────────
create or replace function public.sync_session_progress_from_roster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mtype module_type;
begin
  select type into mtype from public.modules where id = coalesce(new.module_id, old.module_id);
  if mtype not in ('live_session', 'offline_session') then
    return coalesce(new, old);
  end if;

  if tg_op = 'delete' then
    delete from public.module_progress
    where module_id = old.module_id and learner_id = old.learner_id;
    return old;
  end if;

  if new.roster_submitted_at is null then
    return new;
  end if;

  if new.is_present then
    insert into public.module_progress (module_id, learner_id, is_completed, completed_at, watch_pct)
    values (new.module_id, new.learner_id, true, now(), 100)
    on conflict (module_id, learner_id) do update
      set is_completed = true,
          completed_at = coalesce(module_progress.completed_at, excluded.completed_at),
          watch_pct = greatest(module_progress.watch_pct, excluded.watch_pct);
  else
    update public.module_progress
      set is_completed = false,
          completed_at = null
      where module_id = new.module_id
        and learner_id = new.learner_id;
  end if;

  return new;
end;
$$;

create trigger module_session_roster_sync_progress
  after insert or update on public.module_session_roster
  for each row
  execute function public.sync_session_progress_from_roster();

-- ──────────────────────────────────────────────
-- Backfill from existing graded work
-- ──────────────────────────────────────────────
insert into public.module_progress (module_id, learner_id, is_completed, completed_at, watch_pct)
select a.module_id, s.learner_id, true, s.graded_at, 100
from public.submissions s
join public.assignments a on a.id = s.assignment_id
where s.graded_at is not null
on conflict (module_id, learner_id) do update
  set is_completed = true,
      completed_at = coalesce(module_progress.completed_at, excluded.completed_at),
      watch_pct = greatest(module_progress.watch_pct, excluded.watch_pct);
