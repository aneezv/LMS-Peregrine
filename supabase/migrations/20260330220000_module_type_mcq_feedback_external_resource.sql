-- Learner content module types: MCQ (link/form), feedback, external resource
alter type public.module_type add value if not exists 'mcq';
alter type public.module_type add value if not exists 'feedback';
alter type public.module_type add value if not exists 'external_resource';
