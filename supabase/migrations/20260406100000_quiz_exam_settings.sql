-- MCQ modules: optional time limit (minutes, client-enforced) and question randomization for learners.

alter table public.modules
  add column if not exists quiz_time_limit_minutes smallint
    null
    check (
      quiz_time_limit_minutes is null
      or (quiz_time_limit_minutes >= 1 and quiz_time_limit_minutes <= 1440)
    );

alter table public.modules
  add column if not exists quiz_randomize_questions boolean not null default false;
