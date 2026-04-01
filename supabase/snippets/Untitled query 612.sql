-- Deletes templates + placeholders + learner certificates (and related policies via CASCADE)
drop table if exists public.certificate_template_placeholders cascade;
drop table if exists public.certificate_templates cascade;

drop table if exists public.certificates cascade;

-- Deletes the enum used by `public.certificates`
drop type if exists public.certificate_status cascade;