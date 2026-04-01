-- Allow multiple quiz attempts per learner per module (replayable).
alter table public.quiz_attempts drop constraint if exists quiz_attempts_module_id_learner_id_key;

create index if not exists quiz_attempts_module_learner_submitted_idx
  on public.quiz_attempts (module_id, learner_id, submitted_at desc);

-- Replace insert policy name (wording only; RLS rules unchanged). Idempotent.
drop policy if exists "Enrolled learners insert quiz attempt once" on public.quiz_attempts;
drop policy if exists "Enrolled learners insert quiz attempts" on public.quiz_attempts;

create policy "Enrolled learners insert quiz attempts"
  on public.quiz_attempts for insert to authenticated
  with check (
    learner_id = auth.uid()
    and exists (
      select 1 from public.modules mod
      join public.enrollments e on e.course_id = mod.course_id
      where mod.id = quiz_attempts.module_id
        and e.learner_id = auth.uid()
        and mod.type = 'mcq'
    )
  );
