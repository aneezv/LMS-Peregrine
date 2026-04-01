-- Unique course code (required). Existing rows get a deterministic placeholder from id.

alter table public.courses add column if not exists course_code varchar(40);

update public.courses
set course_code = 'LEG-' || replace(id::text, '-', '')
where course_code is null or trim(course_code) = '';

alter table public.courses alter column course_code set not null;

drop index if exists courses_course_code_lower_key;
create unique index courses_course_code_lower_key on public.courses (lower(trim(course_code)));
