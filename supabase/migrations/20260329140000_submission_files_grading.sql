-- Multi-file submissions (draft / turn in) + grading + staff profile visibility

alter table public.submissions
  alter column file_url drop not null;

alter table public.submissions
  add column if not exists is_turned_in boolean not null default false;

alter table public.submissions
  add column if not exists turned_in_at timestamptz;

alter table public.submissions
  add column if not exists created_at timestamptz not null default now();

-- Legacy rows: treat as already turned in
update public.submissions
set
  is_turned_in = true,
  turned_in_at = coalesce(turned_in_at, submitted_at)
where file_url is not null and is_turned_in = false;

create table if not exists public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  file_url text not null,
  drive_file_id text,
  original_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists submission_files_submission_id_idx on public.submission_files(submission_id);

alter table public.submission_files enable row level security;

drop policy if exists "Learners own submission files" on public.submission_files;
drop policy if exists "Instructors view submission files" on public.submission_files;
drop policy if exists "Admins view all submission files" on public.submission_files;

create policy "Learners own submission files" on public.submission_files
  for all to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_files.submission_id and s.learner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_files.submission_id and s.learner_id = auth.uid()
    )
  );

create policy "Instructors view submission files" on public.submission_files
  for select to authenticated
  using (
    exists (
      select 1 from public.submissions sub
      join public.assignments a on a.id = sub.assignment_id
      join public.modules m on m.id = a.module_id
      join public.courses c on c.id = m.course_id
      where sub.id = submission_files.submission_id and c.instructor_id = auth.uid()
    )
  );

create policy "Admins view all submission files" on public.submission_files
  for select to authenticated
  using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

-- Instructors can grade (update score fields)
drop policy if exists "Instructors grade submissions" on public.submissions;
drop policy if exists "Admins grade submissions" on public.submissions;

create policy "Instructors grade submissions" on public.submissions
  for update to authenticated
  using (
    exists (
      select 1 from public.assignments a
      join public.modules m on m.id = a.module_id
      join public.courses c on c.id = m.course_id
      where a.id = submissions.assignment_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.assignments a
      join public.modules m on m.id = a.module_id
      join public.courses c on c.id = m.course_id
      where a.id = submissions.assignment_id and c.instructor_id = auth.uid()
    )
  );

create policy "Admins grade submissions" on public.submissions
  for update to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'));

-- Admins see all submissions (grading queue)
drop policy if exists "Admins view all submissions" on public.submissions;

create policy "Admins view all submissions" on public.submissions
  for select to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'));

-- Courses: admins list all for grading filters
drop policy if exists "Admins view all courses" on public.courses;

create policy "Admins view all courses" on public.courses
  for select to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'));

-- Prevent learners from setting grade columns (direct client tamper)
create or replace function public.submissions_guard_learner_grade_fields()
returns trigger as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'learner') then
    if tg_op = 'INSERT' then
      if new.score is not null or new.feedback is not null or new.graded_at is not null or new.is_passed is not null then
        raise exception 'Learners cannot set grade fields';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.score is distinct from old.score or new.feedback is distinct from old.feedback
         or new.graded_at is distinct from old.graded_at or new.is_passed is distinct from old.is_passed then
        raise exception 'Learners cannot modify grade fields';
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists submissions_guard_learner_grade_fields_ins on public.submissions;
drop trigger if exists submissions_guard_learner_grade_fields_upd on public.submissions;

create trigger submissions_guard_learner_grade_fields_ins
  before insert on public.submissions
  for each row execute function public.submissions_guard_learner_grade_fields();

create trigger submissions_guard_learner_grade_fields_upd
  before update on public.submissions
  for each row execute function public.submissions_guard_learner_grade_fields();

-- Instructors see learner names for enrolled students + submissions workflow
drop policy if exists "Staff view learner profiles" on public.profiles;

create policy "Staff view learner profiles" on public.profiles
  for select to authenticated
  using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
    or exists (
      select 1 from public.enrollments e
      join public.courses c on c.id = e.course_id
      where e.learner_id = profiles.id and c.instructor_id = auth.uid()
    )
    or exists (
      select 1 from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      join public.modules m on m.id = a.module_id
      join public.courses c on c.id = m.course_id
      where s.learner_id = profiles.id and c.instructor_id = auth.uid()
    )
  );
