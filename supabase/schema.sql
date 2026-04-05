-- ============================================================
-- Peregrine T&C – Full database schema (baseline + migrations)
-- Source of truth: mirrors supabase/migrations/*.sql through
-- 20260404120000_card_coordinator_role.sql, 20260405120000_id_card_scan_attendance_rls.sql
-- Use: Supabase SQL Editor for a greenfield project, or compare
-- against `supabase db dump` / migration history.
-- Then run supabase/seed.sql (see that file for production vs demo usage).
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────
-- 1. PROFILES (extends auth.users)
-- ──────────────────────────────────────────────
create type user_role as enum ('admin', 'instructor', 'learner', 'card_coordinator');

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  full_name     varchar(120),
  email         text,
  role          user_role not null default 'learner',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.email is 'Copied from auth.users.email on signup.';

-- Auto-create profile on new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    'learner',
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────
-- 2. COURSES
-- ──────────────────────────────────────────────
create type course_status as enum ('draft', 'published', 'archived');
create type enrollment_type as enum ('open', 'invite_only');

create table public.courses (
  id                  uuid primary key default gen_random_uuid(),
  instructor_id       uuid not null references public.profiles(id),
  course_code         varchar(40) not null,
  title               varchar(200) not null,
  description         text,
  status              course_status not null default 'draft',
  enrollment_type     enrollment_type not null default 'open',
  thumbnail_url       text,
  starts_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index courses_course_code_lower_key on public.courses (lower(trim(course_code)));

-- ──────────────────────────────────────────────
-- 3. SECTIONS
-- ──────────────────────────────────────────────
create table public.sections (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       varchar(200) not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- 4. MODULES
-- ──────────────────────────────────────────────
create type module_type as enum (
  'video',
  'document',
  'live_session',
  'offline_session',
  'assignment',
  'quiz',
  'mcq',
  'feedback',
  'external_resource'
);

create table public.modules (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  section_id       uuid references public.sections(id) on delete set null,
  type             module_type not null,
  title            varchar(200) not null,
  description      text,
  content_url      text,
  session_location text,
  sort_order       integer not null default 0,
  week_index       integer not null default 1 check (week_index >= 1),
  available_from   timestamptz,
  is_sequential    boolean not null default false,
  session_start_at timestamptz,
  session_end_at   timestamptz,
  quiz_passing_pct smallint not null default 60
    check (quiz_passing_pct >= 0 and quiz_passing_pct <= 100),
  quiz_allow_retest boolean not null default true,
  quiz_time_limit_minutes smallint
    null
    check (
      quiz_time_limit_minutes is null
      or (quiz_time_limit_minutes >= 1 and quiz_time_limit_minutes <= 1440)
    ),
  quiz_randomize_questions boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- External resource links (shared description on modules.description)
create table public.module_external_links (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  label varchar(200),
  url text not null,
  sort_order integer not null default 0
);

create index module_external_links_module_id_idx on public.module_external_links(module_id);

-- Quiz content (module type mcq)
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
  submitted_at timestamptz not null default now()
);

create index quiz_attempts_module_id_idx on public.quiz_attempts(module_id);
create unique index quiz_attempts_module_learner_unique
  on public.quiz_attempts (module_id, learner_id);
create index quiz_attempts_module_learner_submitted_idx
  on public.quiz_attempts (module_id, learner_id, submitted_at desc);

create table public.quiz_attempt_answers (
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  option_id uuid not null references public.quiz_options(id) on delete restrict,
  primary key (attempt_id, question_id)
);

create table public.module_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  submitted_at timestamptz not null default now(),
  unique (module_id, learner_id)
);

create index module_feedback_submissions_module_id_idx on public.module_feedback_submissions(module_id);

-- ──────────────────────────────────────────────
-- 5. ENROLLMENTS
-- ──────────────────────────────────────────────
create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  learner_id  uuid not null references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (course_id, learner_id)
);

-- ──────────────────────────────────────────────
-- 6. ASSIGNMENTS
-- ──────────────────────────────────────────────
create table public.assignments (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.modules(id) on delete cascade,
  description      text,
  max_score        integer not null default 100,
  passing_score    integer not null default 60,
  deadline_at      timestamptz,
  allow_late       boolean not null default false,
  late_penalty_pct smallint not null default 0,
  created_at       timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- 7. SUBMISSIONS
-- ──────────────────────────────────────────────
create table public.submissions (
  id               uuid primary key default gen_random_uuid(),
  assignment_id    uuid not null references public.assignments(id) on delete cascade,
  learner_id       uuid not null references public.profiles(id) on delete cascade,
  file_url         text,
  drive_file_id    text,
  storage_provider text not null default 'google_drive',
  is_turned_in     boolean not null default false,
  turned_in_at     timestamptz,
  submitted_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  score            integer,
  feedback         text,
  graded_at        timestamptz,
  is_passed        boolean,
  unique (assignment_id, learner_id)
);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  file_url text not null,
  drive_file_id text,
  original_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index submission_files_submission_id_idx on public.submission_files(submission_id);

-- Learners cannot set or change grade columns (PostgREST / client tamper)
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

create trigger submissions_guard_learner_grade_fields_ins
  before insert on public.submissions
  for each row execute function public.submissions_guard_learner_grade_fields();

create trigger submissions_guard_learner_grade_fields_upd
  before update on public.submissions
  for each row execute function public.submissions_guard_learner_grade_fields();

create or replace function public.mark_module_progress_on_submission_graded()
returns trigger as $$
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
$$ language plpgsql security definer set search_path = public;

create trigger submissions_mark_module_progress_on_grade
  after insert or update of graded_at on public.submissions
  for each row execute function public.mark_module_progress_on_submission_graded();

-- ──────────────────────────────────────────────
-- 8. ATTENDANCE
-- ──────────────────────────────────────────────
create type attendance_status as enum ('on_time', 'late', 'absent');

create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references public.modules(id) on delete cascade,
  learner_id     uuid not null references public.profiles(id) on delete cascade,
  clocked_in_at  timestamptz not null default now(),
  ip_address     inet,
  status         attendance_status,
  unique (module_id, learner_id)
);

-- ──────────────────────────────────────────────
-- 9. MODULE PROGRESS
-- ──────────────────────────────────────────────
create table public.module_progress (
  id              uuid primary key default gen_random_uuid(),
  module_id       uuid not null references public.modules(id) on delete cascade,
  learner_id      uuid not null references public.profiles(id) on delete cascade,
  watch_pct       smallint not null default 0,
  is_completed    boolean not null default false,
  completed_at    timestamptz,
  unique (module_id, learner_id)
);

-- Instructor/admin-marked attendance for live/offline session modules (once per module)
create table public.module_session_roster (
  id                    uuid primary key default gen_random_uuid(),
  module_id             uuid not null references public.modules(id) on delete cascade,
  learner_id            uuid not null references public.profiles(id) on delete cascade,
  is_present            boolean not null default false,
  roster_submitted_at   timestamptz,
  updated_at            timestamptz not null default now(),
  last_marked_by        uuid references public.profiles(id) on delete set null,
  unique (module_id, learner_id)
);

create index module_session_roster_module_id_idx on public.module_session_roster(module_id);

create or replace function public.sync_session_progress_from_roster()
returns trigger as $$
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
$$ language plpgsql security definer set search_path = public;

create trigger module_session_roster_sync_progress
  after insert or update on public.module_session_roster
  for each row execute function public.sync_session_progress_from_roster();

-- ──────────────────────────────────────────────
-- 10. COURSE COMPLETIONS
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- 11. CERTIFICATES
-- ──────────────────────────────────────────────
create type certificate_status as enum ('valid', 'revoked');

create table public.certificates (
  id          uuid primary key default gen_random_uuid(),
  learner_id  uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  issued_at   timestamptz not null default now(),
  pdf_url     text,
  status      certificate_status not null default 'valid',
  revoked_at  timestamptz,
  unique (learner_id, course_id)
);

-- ──────────────────────────────────────────────
-- RLS helpers (avoid infinite recursion when policies read `profiles` for role)
-- ──────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

create or replace function public.is_card_coordinator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'card_coordinator'::public.user_role
  );
$$;

revoke all on function public.is_card_coordinator() from public;
grant execute on function public.is_card_coordinator() to authenticated;
grant execute on function public.is_card_coordinator() to service_role;

-- ──────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.sections enable row level security;
alter table public.modules enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.attendance enable row level security;
alter table public.module_progress enable row level security;
alter table public.module_session_roster enable row level security;
alter table public.module_external_links enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;
alter table public.module_feedback_submissions enable row level security;
alter table public.course_completions enable row level security;
alter table public.certificates enable row level security;

-- Policies for modules and sections (updated earlier)
create policy "Users view modules" on public.modules for select to authenticated
using (exists (select 1 from public.courses where courses.id = modules.course_id and (courses.status = 'published' or courses.instructor_id = auth.uid())));

create policy "Admins and card coordinators view all modules" on public.modules
  for select
  to authenticated
  using (public.is_admin() or public.is_card_coordinator());

create policy "Users view sections" on public.sections for select to authenticated
using (exists (select 1 from public.courses where courses.id = sections.course_id and (courses.status = 'published' or courses.instructor_id = auth.uid())));

-- Policies for assignments
create policy "Users view assignments" on public.assignments for select to authenticated
using (exists (select 1 from public.modules m join public.courses c on c.id = m.course_id where m.id = assignments.module_id and (c.status = 'published' or c.instructor_id = auth.uid())));

create policy "Instructors insert sections for their courses" on public.sections
  for insert to authenticated
  with check (
    exists (
      select 1 from public.courses c
      where c.id = sections.course_id and c.instructor_id = auth.uid()
    )
  );

create policy "Instructors insert modules for their courses" on public.modules
  for insert to authenticated
  with check (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.instructor_id = auth.uid()
    )
  );

create policy "Instructors insert assignments for their modules" on public.assignments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = assignments.module_id and c.instructor_id = auth.uid()
    )
  );

create policy "Instructors update modules for their courses" on public.modules
  for update to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.instructor_id = auth.uid()
    )
  );

create policy "Instructors delete modules for their courses" on public.modules
  for delete to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.instructor_id = auth.uid()
    )
  );

create policy "Instructors update assignments for their modules" on public.assignments
  for update to authenticated
  using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = assignments.module_id and c.instructor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = assignments.module_id and c.instructor_id = auth.uid()
    )
  );

create policy "Instructors delete assignments for their modules" on public.assignments
  for delete to authenticated
  using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = assignments.module_id and c.instructor_id = auth.uid()
    )
  );

-- Admins can manage course content for any course (aligns with "Admins update any course" on public.courses)
create policy "Admins manage all sections"
  on public.sections
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins manage all modules"
  on public.modules
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins manage all assignments"
  on public.assignments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- module_external_links
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

-- quiz_questions / quiz_options
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

-- quiz_attempts / answers
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

create policy "Enrolled learners insert quiz attempts"
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

create policy "Learners update own quiz attempts"
  on public.quiz_attempts for update to authenticated
  using (learner_id = auth.uid())
  with check (learner_id = auth.uid());

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

create policy "Learners update own quiz attempt answers"
  on public.quiz_attempt_answers for update to authenticated
  using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = quiz_attempt_answers.attempt_id and a.learner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = quiz_attempt_answers.attempt_id and a.learner_id = auth.uid()
    )
  );

-- module_feedback_submissions
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

-- course_completions
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

-- Profiles: users see/edit their own
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Admins select profiles" on public.profiles
  for select to authenticated
  using (public.is_admin());
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Courses: published visible to all authenticated users
create policy "Published courses are visible to all" on public.courses
  for select using (status = 'published' or instructor_id = auth.uid());
create policy "Instructors manage their courses" on public.courses
  for all using (instructor_id = auth.uid());

create policy "Admins insert any course" on public.courses
  for insert to authenticated
  with check (public.is_admin());

create policy "Admins update any course" on public.courses
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete any course" on public.courses
  for delete to authenticated
  using (public.is_admin());

-- Enrollments: learners see their own; staff see roster for their courses
create policy "Learners see their own enrollments" on public.enrollments
  for select using (learner_id = auth.uid());
create policy "Learners can enroll themselves" on public.enrollments
  for insert with check (learner_id = auth.uid());

create policy "Instructors view enrollments for their courses" on public.enrollments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = enrollments.course_id
        and c.instructor_id = auth.uid()
    )
  );

create policy "Admins view all enrollments" on public.enrollments
  for select
  to authenticated
  using (public.is_admin());

create policy "Card coordinators view all enrollments" on public.enrollments
  for select
  to authenticated
  using (public.is_card_coordinator());

-- Submissions: learners CRUD own rows; course instructors can read (grading)
drop policy if exists "Learners manage own submissions" on public.submissions;

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

create policy "Admins view all submissions" on public.submissions
  for select to authenticated
  using (public.is_admin());

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
  using (public.is_admin())
  with check (public.is_admin());

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
  using (public.is_admin());

create policy "Admins view all courses" on public.courses
  for select to authenticated
  using (public.is_admin());

create policy "Card coordinators view all courses" on public.courses
  for select
  to authenticated
  using (public.is_card_coordinator());

create policy "Staff view learner profiles" on public.profiles
  for select to authenticated
  using (
    public.is_admin()
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
    or (
      public.is_card_coordinator()
      and exists (select 1 from public.enrollments e where e.learner_id = profiles.id)
    )
  );

create policy "View instructors of published courses" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.instructor_id = profiles.id and c.status = 'published'
    )
  );

-- Certificates: learner sees theirs; public verification by ID done at API level
create policy "Learners see their certificates" on public.certificates
  for select using (learner_id = auth.uid());

-- Module progress: learners manage their own
create policy "Learners manage their progress" on public.module_progress
  for all using (learner_id = auth.uid());

create policy "Staff view module progress for their courses"
  on public.module_progress
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_progress.module_id
        and c.instructor_id = auth.uid()
    )
  );

-- Session roster: learners read own row; staff manage
create policy "Learners read own session roster row" on public.module_session_roster
  for select to authenticated
  using (learner_id = auth.uid());

create policy "Staff manage session roster" on public.module_session_roster
  for all to authenticated
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

create policy "Card coordinators manage session roster" on public.module_session_roster
  for all
  to authenticated
  using (public.is_card_coordinator())
  with check (public.is_card_coordinator());

-- Offline physical ID cards (QR pool + bind); see migration 20260402100000
create or replace function public._offline_random_segment(p_len int)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  res text := '';
  i int;
begin
  if p_len is null or p_len < 1 or p_len > 32 then
    raise exception 'invalid segment length';
  end if;
  for i in 1..p_len loop
    res := res || substr(alphabet, 1 + floor(random() * 36)::int, 1);
  end loop;
  return res;
end;
$$;

revoke all on function public._offline_random_segment(int) from public;

create table public.offline_learner_id_cards (
  id uuid primary key default gen_random_uuid(),
  public_code text not null,
  learner_id uuid references public.profiles(id) on delete set null,
  bound_at timestamptz,
  bound_by uuid references public.profiles(id) on delete set null,
  batch_id uuid,
  batch_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offline_learner_id_cards_public_code_format_chk
    check (public_code ~ '^ID-[A-Z0-9]{3}-[A-Z0-9]{3}$'),
  constraint offline_learner_id_cards_bound_consistency_chk
    check (
      (learner_id is null and bound_at is null and bound_by is null)
      or (learner_id is not null and bound_at is not null and bound_by is not null)
    )
);

create unique index offline_learner_id_cards_public_code_key on public.offline_learner_id_cards (public_code);

create unique index offline_learner_id_cards_learner_active_key
  on public.offline_learner_id_cards (learner_id)
  where learner_id is not null;

create or replace function public.touch_offline_learner_id_cards_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger offline_learner_id_cards_touch_updated_at
  before update on public.offline_learner_id_cards
  for each row
  execute function public.touch_offline_learner_id_cards_updated_at();

create or replace function public.offline_learner_id_cards_block_coordinator_unbind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.learner_id is not null
     and new.learner_id is null
     and public.is_card_coordinator() then
    raise exception 'card coordinators cannot unbind id cards';
  end if;
  return new;
end;
$$;

revoke all on function public.offline_learner_id_cards_block_coordinator_unbind() from public;

create trigger offline_learner_id_cards_block_coordinator_unbind
  before update on public.offline_learner_id_cards
  for each row
  execute function public.offline_learner_id_cards_block_coordinator_unbind();

alter table public.offline_learner_id_cards enable row level security;

create policy "Learners read own offline id card"
  on public.offline_learner_id_cards
  for select
  to authenticated
  using (learner_id = auth.uid());

create policy "Staff read offline id cards"
  on public.offline_learner_id_cards
  for select
  to authenticated
  using (
    public.is_admin()
    or public.is_card_coordinator()
    or (
      learner_id is null
      or exists (
        select 1
        from public.enrollments e
        join public.courses c on c.id = e.course_id
        where e.learner_id = offline_learner_id_cards.learner_id
          and c.instructor_id = auth.uid()
      )
    )
  );

create policy "Admin manage offline id cards"
  on public.offline_learner_id_cards
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Instructors update offline id cards for their courses"
  on public.offline_learner_id_cards
  for update
  to authenticated
  using (
    not public.is_admin()
    and (
      learner_id is null
      or exists (
        select 1
        from public.enrollments e
        join public.courses c on c.id = e.course_id
        where e.learner_id = offline_learner_id_cards.learner_id
          and c.instructor_id = auth.uid()
      )
    )
  )
  with check (
    not public.is_admin()
    and (
      (
        learner_id is null
        and bound_at is null
        and bound_by is null
      )
      or exists (
        select 1
        from public.enrollments e
        join public.courses c on c.id = e.course_id
        where e.learner_id = offline_learner_id_cards.learner_id
          and c.instructor_id = auth.uid()
      )
    )
  );

create policy "Card coordinators update offline id cards for binding"
  on public.offline_learner_id_cards
  for update
  to authenticated
  using (public.is_card_coordinator())
  with check (public.is_card_coordinator());

create or replace function public.mint_offline_id_cards(
  p_count int,
  p_batch_label text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_remaining int;
  v_code text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_count is null or p_count < 1 or p_count > 5000 then
    raise exception 'invalid count';
  end if;

  v_remaining := p_count;
  while v_remaining > 0 loop
    v_code := 'ID-' || public._offline_random_segment(3) || '-' || public._offline_random_segment(3);
    begin
      insert into public.offline_learner_id_cards (public_code, batch_label)
      values (v_code, p_batch_label);
      v_inserted := v_inserted + 1;
      v_remaining := v_remaining - 1;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.mint_offline_id_cards(int, text) from public;
grant execute on function public.mint_offline_id_cards(int, text) to authenticated;

-- Attendance: learners manage their own
create policy "Learners manage their attendance" on public.attendance
  for all using (learner_id = auth.uid());

-- ──────────────────────────────────────────────
-- INTERNSHIP ONLINE HOURS (see migration 20260330260000)
-- ──────────────────────────────────────────────
create type public.internship_session_status as enum (
  'ACTIVE',
  'ON_BREAK',
  'INACTIVE_AUTO',
  'ENDED'
);

create type public.internship_activity_event_type as enum (
  'mouse_move',
  'click',
  'keypress',
  'visibility_hidden',
  'visibility_visible',
  'heartbeat',
  'inactivity_detected',
  'session_start',
  'break_start',
  'resume',
  'session_end',
  'ping_challenge_ok'
);

create table public.internship_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  break_seconds integer not null default 0 check (break_seconds >= 0),
  status public.internship_session_status not null default 'ACTIVE',
  last_tick_at timestamptz not null default now(),
  had_inactivity_auto boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index internship_sessions_one_open_per_user_course
  on public.internship_sessions (user_id, course_id)
  where status <> 'ENDED' and course_id is not null;

create unique index internship_sessions_one_open_legacy_null_course
  on public.internship_sessions (user_id)
  where status <> 'ENDED' and course_id is null;

create index internship_sessions_user_id_idx on public.internship_sessions(user_id);
create index internship_sessions_course_id_idx on public.internship_sessions(course_id);
create index internship_sessions_start_time_idx on public.internship_sessions(start_time desc);

create table public.internship_activity_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.internship_sessions(id) on delete cascade,
  logged_at timestamptz not null default now(),
  event_type public.internship_activity_event_type not null
);

create index internship_activity_logs_session_id_idx on public.internship_activity_logs(session_id);
create index internship_activity_logs_logged_at_idx on public.internship_activity_logs(logged_at desc);

create table public.internship_daily_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_utc date not null,
  active_seconds integer not null default 0 check (active_seconds >= 0 and active_seconds <= 86400),
  primary key (user_id, day_utc)
);

create table public.internship_daily_activity_course (
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  day_utc date not null,
  active_seconds integer not null default 0 check (active_seconds >= 0 and active_seconds <= 86400),
  primary key (user_id, course_id, day_utc)
);

create index internship_daily_activity_course_user_id_course_id_idx
  on public.internship_daily_activity_course(user_id, course_id);

create index internship_daily_activity_course_day_idx
  on public.internship_daily_activity_course(day_utc desc);

create or replace function public.internship_process_heartbeat(
  p_session_id uuid,
  p_now timestamptz,
  p_tab_visible boolean,
  p_on_course_page boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_sess record;
  v_delta int;
  v_credit int;
  v_day date;
  v_daily int;
  v_max_daily int := 3600;
  v_idle int := 180;
  v_tick_cap int := 45;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_sess
  from public.internship_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('error', 'session_not_found');
  end if;

  if v_sess.status = 'ENDED' then
    return jsonb_build_object('error', 'session_ended');
  end if;

  v_delta := floor(extract(epoch from (p_now - v_sess.last_tick_at)))::int;
  if v_delta < 0 then
    v_delta := 0;
  end if;
  if v_delta > 86400 then
    v_delta := 86400;
  end if;

  v_day := (p_now at time zone 'utc')::date;

  if v_sess.status = 'ON_BREAK' then
    v_credit := least(v_delta, v_tick_cap);
    update public.internship_sessions
      set
        break_seconds = break_seconds + v_credit,
        last_tick_at = p_now,
        updated_at = p_now
    where id = p_session_id;

    return jsonb_build_object(
      'ok', true,
      'credited_break', v_credit,
      'active_seconds', v_sess.active_seconds,
      'break_seconds', v_sess.break_seconds + v_credit,
      'status', 'ON_BREAK'
    );
  end if;

  if v_sess.status = 'INACTIVE_AUTO' then
    update public.internship_sessions
      set last_tick_at = p_now, updated_at = p_now
    where id = p_session_id;
    return jsonb_build_object(
      'ok', true,
      'credited_active', 0,
      'active_seconds', v_sess.active_seconds,
      'break_seconds', v_sess.break_seconds,
      'status', 'INACTIVE_AUTO'
    );
  end if;

  if v_sess.status = 'ACTIVE' then
    if v_delta > v_idle then
      update public.internship_sessions
        set
          status = 'INACTIVE_AUTO',
          had_inactivity_auto = true,
          last_tick_at = p_now,
          updated_at = p_now
      where id = p_session_id;
      return jsonb_build_object(
        'ok', true,
        'credited_active', 0,
        'auto_inactive', true,
        'active_seconds', v_sess.active_seconds,
        'break_seconds', v_sess.break_seconds,
        'status', 'INACTIVE_AUTO'
      );
    end if;

    if not p_tab_visible or not p_on_course_page then
      update public.internship_sessions
        set last_tick_at = p_now, updated_at = p_now
      where id = p_session_id;
      return jsonb_build_object(
        'ok', true,
        'credited_active', 0,
        'tab_inactive', true,
        'active_seconds', v_sess.active_seconds,
        'break_seconds', v_sess.break_seconds,
        'status', 'ACTIVE'
      );
    end if;

    v_credit := least(v_delta, v_tick_cap);

    -- Daily cap: per-course when course_id exists, otherwise fall back to legacy global bucket.
    if v_sess.course_id is null then
      select coalesce(active_seconds, 0) into v_daily
      from public.internship_daily_activity
      where user_id = v_sess.user_id and day_utc = v_day;

      if v_daily >= v_max_daily then
        v_credit := 0;
      elsif v_daily + v_credit > v_max_daily then
        v_credit := v_max_daily - v_daily;
      end if;

      if v_credit > 0 then
        insert into public.internship_daily_activity (user_id, day_utc, active_seconds)
        values (v_sess.user_id, v_day, v_credit)
        on conflict (user_id, day_utc) do update
          set active_seconds = public.internship_daily_activity.active_seconds + excluded.active_seconds;
      end if;
    else
      select coalesce(active_seconds, 0) into v_daily
      from public.internship_daily_activity_course
      where user_id = v_sess.user_id and course_id = v_sess.course_id and day_utc = v_day;

      if v_daily >= v_max_daily then
        v_credit := 0;
      elsif v_daily + v_credit > v_max_daily then
        v_credit := v_max_daily - v_daily;
      end if;

      if v_credit > 0 then
        insert into public.internship_daily_activity_course (user_id, course_id, day_utc, active_seconds)
        values (v_sess.user_id, v_sess.course_id, v_day, v_credit)
        on conflict (user_id, course_id, day_utc) do update
          set active_seconds = public.internship_daily_activity_course.active_seconds + excluded.active_seconds;
      end if;
    end if;

    update public.internship_sessions
      set
        active_seconds = active_seconds + v_credit,
        last_tick_at = p_now,
        updated_at = p_now
    where id = p_session_id;

    return jsonb_build_object(
      'ok', true,
      'credited_active', v_credit,
      'active_seconds', v_sess.active_seconds + v_credit,
      'break_seconds', v_sess.break_seconds,
      'status', 'ACTIVE',
      'daily_active_seconds', v_daily + v_credit
    );
  end if;

  return jsonb_build_object('error', 'unknown_state');
end;
$$;

revoke all on function public.internship_process_heartbeat(uuid, timestamptz, boolean, boolean) from public;
grant execute on function public.internship_process_heartbeat(uuid, timestamptz, boolean, boolean) to authenticated;

alter table public.internship_sessions enable row level security;
alter table public.internship_activity_logs enable row level security;
alter table public.internship_daily_activity enable row level security;
alter table public.internship_daily_activity_course enable row level security;

revoke insert, update, delete on public.internship_daily_activity from anon, authenticated;
grant select on public.internship_daily_activity to authenticated;

revoke insert, update, delete on public.internship_daily_activity_course from anon, authenticated;
grant select on public.internship_daily_activity_course to authenticated;

create policy "internship_sessions learner full access"
  on public.internship_sessions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      course_id is null
      or exists (
        select 1 from public.enrollments e
        where e.course_id = internship_sessions.course_id
          and e.learner_id = auth.uid()
      )
    )
  );

create policy "internship_sessions staff select"
  on public.internship_sessions
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      join public.courses c on c.id = e.course_id
      where e.learner_id = internship_sessions.user_id
        and c.instructor_id = auth.uid()
    )
  );

create policy "internship_activity learner insert"
  on public.internship_activity_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.internship_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "internship_activity learner select"
  on public.internship_activity_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internship_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "internship_activity staff select"
  on public.internship_activity_logs
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.internship_sessions s
      join public.enrollments e on e.learner_id = s.user_id
      join public.courses c on c.id = e.course_id
      where s.id = internship_activity_logs.session_id
        and c.instructor_id = auth.uid()
    )
  );

create policy "internship_daily learner read own"
  on public.internship_daily_activity
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "internship_daily admin read all"
  on public.internship_daily_activity
  for select
  to authenticated
  using (public.is_admin());

create policy "internship_daily_course learner read own"
  on public.internship_daily_activity_course
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "internship_daily_course admin read all"
  on public.internship_daily_activity_course
  for select
  to authenticated
  using (public.is_admin());

-- ──────────────────────────────────────────────
-- SHEET SYNC LOGS (Google Sheet → LMS integration)
-- Mirrors migration 20260403140000_sheet_sync_logs.sql
-- ──────────────────────────────────────────────
create table public.sheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  rows_total integer not null default 0,
  rows_ok integer not null default 0,
  rows_skipped integer not null default 0,
  error_summary text,
  details jsonb
);

create table public.sheet_sync_row_state (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  sheet_name text not null,
  row_number integer not null,
  payload_hash text not null,
  last_outcome text not null check (last_outcome in ('synced', 'partial', 'error', 'skipped')),
  last_error text,
  updated_at timestamptz not null default now(),
  last_run_id uuid references public.sheet_sync_runs (id) on delete set null,
  unique (source_id, sheet_name, row_number)
);

create index sheet_sync_runs_started_at_idx on public.sheet_sync_runs (started_at desc);
create index sheet_sync_row_state_lookup_idx on public.sheet_sync_row_state (source_id, sheet_name, row_number);

alter table public.sheet_sync_runs enable row level security;
alter table public.sheet_sync_row_state enable row level security;

create policy "Admins read sheet sync runs"
  on public.sheet_sync_runs
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins read sheet sync row state"
  on public.sheet_sync_row_state
  for select
  to authenticated
  using (public.is_admin());

-- ──────────────────────────────────────────────
-- STORAGE (assignment files bucket + policies)
-- ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('eduflow-storage', 'eduflow-storage', true)
on conflict (id) do nothing;

drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Learners can upload assignments" on storage.objects;
drop policy if exists "Learners can update own assignments" on storage.objects;

create policy "Public Access"
on storage.objects for select
using (bucket_id = 'eduflow-storage');

create policy "Learners can upload assignments"
on storage.objects for insert
to authenticated
with check (bucket_id = 'eduflow-storage');

create policy "Learners can update own assignments"
on storage.objects for update
to authenticated
using (bucket_id = 'eduflow-storage');
