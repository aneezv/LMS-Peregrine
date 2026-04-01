-- Group syllabus by week (within course). Display order: week_index, then sort_order.

alter table public.modules
  add column if not exists week_index integer not null default 1;

alter table public.modules
  drop constraint if exists modules_week_index_positive;

alter table public.modules
  add constraint modules_week_index_positive check (week_index >= 1);
