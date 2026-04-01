-- Quiz builder, external resource links (no progress), feedback submissions
--
-- Do NOT add module_type enum values in this file: same-transaction use causes 55P04.
-- They are added in 20260330220000 and/or 20260330235000 (commits before this file runs).

alter table public.modules
  add column if not exists quiz_passing_pct smallint not null default 60
    check (quiz_passing_pct >= 0 and quiz_passing_pct <= 100);

-- External resource: many links, shared text in modules.description
create table public.module_external_links (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  label varchar(200),
  url text not null,
  sort_order integer not null default 0
);

create index module_external_links_module_id_idx on public.module_external_links(module_id);

-- Quiz (module type mcq)
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  prompt text not null,
  sort_order integer not null default 0
);

create index quiz_questions_module_id_idx on public.quiz_questions(module_id);

create table public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  sort_order integer not null default 0
);

create index quiz_options_question_id_idx on public.quiz_options(question_id);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null,
  max_score integer not null,
  passed boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (module_id, learner_id)
);

create index quiz_attempts_module_id_idx on public.quiz_attempts(module_id);

create table public.quiz_attempt_answers (
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  option_id uuid not null references public.quiz_options(id) on delete restrict,
  primary key (attempt_id, question_id)
);

-- Feedback: one submission per learner per module
create table public.module_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  submitted_at timestamptz not null default now(),
  unique (module_id, learner_id)
);

create index module_feedback_submissions_module_id_idx on public.module_feedback_submissions(module_id);

-- Migrate legacy single URL on external_resource modules
insert into public.module_external_links (module_id, label, url, sort_order)
select m.id, coalesce(nullif(trim(m.title), ''), 'Link'), m.content_url, 0
from public.modules m
where m.type = 'external_resource'
  and m.content_url is not null
  and trim(m.content_url) <> ''
  and not exists (select 1 from public.module_external_links l where l.module_id = m.id);

update public.modules set content_url = null where type = 'external_resource';

alter table public.module_external_links enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;
alter table public.module_feedback_submissions enable row level security;

-- module_external_links: view like modules
create policy "View external links with modules"
  on public.module_external_links for select to authenticated
  using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_external_links.module_id
        and (c.status = 'published' or c.instructor_id = auth.uid() or public.is_admin())
    )
  );

create policy "Staff manage external links"
  on public.module_external_links for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_external_links.module_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_external_links.module_id and c.instructor_id = auth.uid()
    )
  );

-- quiz questions & options: view with modules
create policy "View quiz questions with modules"
  on public.quiz_questions for select to authenticated
  using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = quiz_questions.module_id
        and (c.status = 'published' or c.instructor_id = auth.uid() or public.is_admin())
    )
  );

create policy "Staff manage quiz questions"
  on public.quiz_questions for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = quiz_questions.module_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = quiz_questions.module_id and c.instructor_id = auth.uid()
    )
  );

create policy "View quiz options with question"
  on public.quiz_options for select to authenticated
  using (
    exists (
      select 1 from public.quiz_questions q
      join public.modules m on m.id = q.module_id
      join public.courses c on c.id = m.course_id
      where q.id = quiz_options.question_id
        and (c.status = 'published' or c.instructor_id = auth.uid() or public.is_admin())
    )
  );

create policy "Staff manage quiz options"
  on public.quiz_options for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.quiz_questions q
      join public.modules m on m.id = q.module_id
      join public.courses c on c.id = m.course_id
      where q.id = quiz_options.question_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.quiz_questions q
      join public.modules m on m.id = q.module_id
      join public.courses c on c.id = m.course_id
      where q.id = quiz_options.question_id and c.instructor_id = auth.uid()
    )
  );

-- quiz attempts: learner owns; staff read for their courses
create policy "Learners view own quiz attempts"
  on public.quiz_attempts for select to authenticated
  using (learner_id = auth.uid());

create policy "Staff view quiz attempts for their courses"
  on public.quiz_attempts for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = quiz_attempts.module_id and c.instructor_id = auth.uid()
    )
  );

create policy "Enrolled learners insert quiz attempt once"
  on public.quiz_attempts for insert to authenticated
  with check (
    learner_id = auth.uid()
    and exists (
      select 1 from public.modules mod
      join public.enrollments e on e.course_id = mod.course_id
      where mod.id = quiz_attempts.module_id
        and e.learner_id = auth.uid()
        and mod.type = 'mcq'
    )
  );

create policy "Learners view own quiz attempt answers"
  on public.quiz_attempt_answers for select to authenticated
  using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = quiz_attempt_answers.attempt_id and a.learner_id = auth.uid()
    )
  );

create policy "Staff view quiz attempt answers"
  on public.quiz_attempt_answers for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.quiz_attempts att
      join public.modules m on m.id = att.module_id
      join public.courses c on c.id = m.course_id
      where att.id = quiz_attempt_answers.attempt_id and c.instructor_id = auth.uid()
    )
  );

create policy "Learners insert answers for own attempt"
  on public.quiz_attempt_answers for insert to authenticated
  with check (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = quiz_attempt_answers.attempt_id and a.learner_id = auth.uid()
    )
  );

-- feedback submissions
create policy "Learners view own feedback"
  on public.module_feedback_submissions for select to authenticated
  using (learner_id = auth.uid());

create policy "Staff view feedback for their courses"
  on public.module_feedback_submissions for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_feedback_submissions.module_id and c.instructor_id = auth.uid()
    )
  );

create policy "Enrolled learners submit feedback once"
  on public.module_feedback_submissions for insert to authenticated
  with check (
    learner_id = auth.uid()
    and exists (
      select 1 from public.modules mod
      join public.enrollments e on e.course_id = mod.course_id
      where mod.id = module_feedback_submissions.module_id
        and e.learner_id = auth.uid()
        and mod.type = 'feedback'
    )
  );
