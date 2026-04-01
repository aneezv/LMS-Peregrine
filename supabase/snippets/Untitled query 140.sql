-- Keep only one best-attempt row per learner/module in quiz_attempts.
-- Best is defined as highest score; latest submitted_at breaks ties.

with ranked as (
  select
    id,
    row_number() over (
      partition by module_id, learner_id
      order by score desc, submitted_at desc, id desc
    ) as rn
  from public.quiz_attempts
)
delete from public.quiz_attempts qa
using ranked r
where qa.id = r.id
  and r.rn > 1;

create unique index if not exists quiz_attempts_module_learner_unique
  on public.quiz_attempts (module_id, learner_id);

drop policy if exists "Learners update own quiz attempts" on public.quiz_attempts;
create policy "Learners update own quiz attempts"
  on public.quiz_attempts for update to authenticated
  using (learner_id = auth.uid())
  with check (learner_id = auth.uid());

drop policy if exists "Learners update own quiz attempt answers" on public.quiz_attempt_answers;
create policy "Learners update own quiz attempt answers"
  on public.quiz_attempt_answers for update to authenticated
  using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = quiz_attempt_answers.attempt_id and a.learner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = quiz_attempt_answers.attempt_id and a.learner_id = auth.uid()
    )
  );
