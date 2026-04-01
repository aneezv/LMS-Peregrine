-- Course-level completion record ("internship completed")

create table public.course_completions (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  learner_id   uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (course_id, learner_id)
);

create index course_completions_course_id_idx on public.course_completions(course_id);
create index course_completions_learner_id_idx on public.course_completions(learner_id);

alter table public.course_completions enable row level security;

create policy "Learners view own course completion"
  on public.course_completions for select to authenticated
  using (learner_id = auth.uid());

create policy "Learners insert own course completion when enrolled"
  on public.course_completions for insert to authenticated
  with check (
    learner_id = auth.uid()
    and exists (
      select 1
      from public.enrollments e
      where e.course_id = course_completions.course_id
        and e.learner_id = auth.uid()
    )
  );

create policy "Staff view course completions for their courses"
  on public.course_completions for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.courses c
      where c.id = course_completions.course_id
        and c.instructor_id = auth.uid()
    )
  );

