-- Add demo_video_url to courses table for course promotional/demo video (YouTube/Vimeo)
alter table public.courses
  add column if not exists demo_video_url text;

comment on column public.courses.demo_video_url is
  'Public URL of course demo/preview video (YouTube or Vimeo only).';
