-- Learning streak: use Asia/Kolkata calendar day (IST) for bucketing and display grace.
-- Re-backfill rollup from module_progress so last_success_day / streaks match IST semantics.

create or replace function private.maintain_learning_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
  v_row public.learning_streak%rowtype;
  v_new_streak integer;
begin
  if new.is_completed is distinct from true or new.completed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.is_completed is true
    and old.completed_at is not null then
    return new;
  end if;

  v_day := (timezone('Asia/Kolkata', new.completed_at))::date;

  select * into v_row
  from public.learning_streak
  where learner_id = new.learner_id;

  if not found then
    insert into public.learning_streak (learner_id, current_streak, longest_streak, last_success_day, updated_at)
    values (new.learner_id, 1, 1, v_day, now());
    return new;
  end if;

  if v_row.last_success_day = v_day then
    return new;
  end if;

  if v_day < v_row.last_success_day then
    return new;
  end if;

  if v_row.last_success_day = v_day - 1 then
    v_new_streak := v_row.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  update public.learning_streak
  set
    current_streak = v_new_streak,
    longest_streak = greatest(v_row.longest_streak, v_new_streak),
    last_success_day = v_day,
    updated_at = now()
  where learner_id = new.learner_id;

  return new;
end;
$$;

create or replace view public.learning_streak_display
with (security_invoker = true)
as
select
  learner_id,
  last_success_day,
  longest_streak,
  case
    when last_success_day is not null
      and last_success_day >= ((timezone('Asia/Kolkata', now()))::date - 1)
    then current_streak
    else 0
  end as streak
from public.learning_streak;

-- Rebuild streak rows from completions (IST distinct days per learner).
do $$
declare
  r record;
  v_days date[];
  n int;
  v_longest int;
  v_run int;
  i int;
  v_curr int;
  j int;
begin
  for r in
    select distinct learner_id
    from public.module_progress
    where is_completed = true
      and completed_at is not null
  loop
    select array_agg(d order by d) into v_days
    from (
      select distinct (timezone('Asia/Kolkata', completed_at))::date as d
      from public.module_progress
      where learner_id = r.learner_id
        and is_completed = true
        and completed_at is not null
    ) s;

    if v_days is null or coalesce(array_length(v_days, 1), 0) = 0 then
      continue;
    end if;

    n := array_length(v_days, 1);

    v_longest := 1;
    v_run := 1;
    for i in 2..n loop
      if v_days[i] = v_days[i - 1] + 1 then
        v_run := v_run + 1;
      else
        if v_run > v_longest then
          v_longest := v_run;
        end if;
        v_run := 1;
      end if;
    end loop;
    if v_run > v_longest then
      v_longest := v_run;
    end if;

    v_curr := 1;
    for j in reverse n..2 loop
      if v_days[j] = v_days[j - 1] + 1 then
        v_curr := v_curr + 1;
      else
        exit;
      end if;
    end loop;

    insert into public.learning_streak (learner_id, current_streak, longest_streak, last_success_day, updated_at)
    values (r.learner_id, v_curr, v_longest, v_days[n], now())
    on conflict (learner_id) do update set
      current_streak = excluded.current_streak,
      longest_streak = excluded.longest_streak,
      last_success_day = excluded.last_success_day,
      updated_at = excluded.updated_at;
  end loop;
end;
$$;
