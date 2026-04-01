-- New enum labels from ALTER TYPE ... ADD VALUE are not visible in the same
-- transaction (55P04). Supabase runs one file = one transaction, so enum adds
-- must commit in a separate migration before 20260330240000 references them.
-- Idempotent with 20260330220000_module_type_mcq_feedback_external_resource.sql.

alter type public.module_type add value if not exists 'mcq';
alter type public.module_type add value if not exists 'feedback';
alter type public.module_type add value if not exists 'external_resource';
