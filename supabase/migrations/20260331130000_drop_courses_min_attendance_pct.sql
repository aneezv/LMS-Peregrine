-- Remove legacy minimum attendance requirement from courses.
alter table public.courses
  drop column if exists min_attendance_pct;
