-- ============================================================
-- Peregrine LMS – Initial Supabase Schema (v1.0)
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────
-- 1. PROFILES (extends auth.users)
-- ──────────────────────────────────────────────
create type user_role as enum ('admin', 'instructor', 'learner');

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  full_name     varchar(120),
  role          user_role not null default 'learner',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create profile on new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'learner');
  return new;
end;
$$ language plpgsql security definer;

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
  title               varchar(200) not null,
  description         text,
  status              course_status not null default 'draft',
  enrollment_type     enrollment_type not null default 'open',
  thumbnail_url       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

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
create type module_type as enum ('video', 'document', 'live_session', 'assignment', 'quiz');

create table public.modules (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  section_id       uuid references public.sections(id) on delete set null,
  type             module_type not null,
  title            varchar(200) not null,
  content_url      text,
  sort_order       integer not null default 0,
  available_from   timestamptz,
  is_sequential    boolean not null default false,
  session_start_at timestamptz,
  session_end_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

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
  file_url         text not null,
  drive_file_id    text,
  storage_provider text not null default 'google_drive',
  submitted_at     timestamptz not null default now(),
  score            integer,
  feedback         text,
  graded_at        timestamptz,
  is_passed        boolean,
  unique (assignment_id, learner_id)
);

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

-- ──────────────────────────────────────────────
-- 10. CERTIFICATES
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
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.sections enable row level security;
alter table public.modules enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.attendance enable row level security;
alter table public.module_progress enable row level security;
alter table public.certificates enable row level security;

-- Profiles: users see/edit their own
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Courses: published visible to all authenticated users
create policy "Published courses are visible to all" on public.courses
  for select using (status = 'published' or instructor_id = auth.uid());
create policy "Instructors manage their courses" on public.courses
  for all using (instructor_id = auth.uid());

-- Enrollments: learners see their own
create policy "Learners see their own enrollments" on public.enrollments
  for select using (learner_id = auth.uid());
create policy "Learners can enroll themselves" on public.enrollments
  for insert with check (learner_id = auth.uid());

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

-- Certificates: learner sees theirs; public verification by ID done at API level
create policy "Learners see their certificates" on public.certificates
  for select using (learner_id = auth.uid());

-- Module progress: learners manage their own
create policy "Learners manage their progress" on public.module_progress
  for all using (learner_id = auth.uid());

-- Attendance: learners manage their own
create policy "Learners manage their attendance" on public.attendance
  for all using (learner_id = auth.uid());
