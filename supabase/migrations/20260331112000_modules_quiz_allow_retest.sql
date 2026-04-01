alter table public.modules
  add column if not exists quiz_allow_retest boolean not null default true;
