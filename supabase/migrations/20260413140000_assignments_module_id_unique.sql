-- One assignment row per module (CourseBuilder upserts on module_id via PostgREST on_conflict).
-- Without a UNIQUE on module_id, PostgREST returns 400: no matching constraint for ON CONFLICT.
alter table public.assignments
  add constraint assignments_module_id_key unique (module_id);
