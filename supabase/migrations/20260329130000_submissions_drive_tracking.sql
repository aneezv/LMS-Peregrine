-- Submissions: Drive tracking columns + RLS so learners can insert/update and instructors can read.

alter table public.submissions
  add column if not exists drive_file_id text;

alter table public.submissions
  add column if not exists storage_provider text not null default 'google_drive';

drop policy if exists "Learners manage own submissions" on public.submissions;
drop policy if exists "Learners select own submissions" on public.submissions;
drop policy if exists "Learners insert own submissions" on public.submissions;
drop policy if exists "Learners update own submissions" on public.submissions;
drop policy if exists "Learners delete own submissions" on public.submissions;
drop policy if exists "Instructors view course submissions" on public.submissions;

create policy "Learners select own submissions" on public.submissions
  for select to authenticated
  using (learner_id = auth.uid());

create policy "Learners insert own submissions" on public.submissions
  for insert to authenticated
  with check (learner_id = auth.uid());

create policy "Learners update own submissions" on public.submissions
  for update to authenticated
  using (learner_id = auth.uid())
  with check (learner_id = auth.uid());

create policy "Learners delete own submissions" on public.submissions
  for delete to authenticated
  using (learner_id = auth.uid());

create policy "Instructors view course submissions" on public.submissions
  for select to authenticated
  using (
    exists (
      select 1
      from public.assignments a
      join public.modules m on m.id = a.module_id
      join public.courses c on c.id = m.course_id
      where a.id = submissions.assignment_id
        and c.instructor_id = auth.uid()
    )
  );
