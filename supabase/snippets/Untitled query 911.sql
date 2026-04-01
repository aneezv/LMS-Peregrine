-- Tie internship sessions to a course; one non-ENDED session per (user_id, course_id).
-- Heartbeat: p_on_course_page — when false while ACTIVE, no active credit (like hidden tab).

alter table public.internship_sessions
  add column if not exists course_id uuid references public.courses(id) on delete cascade;

drop index if exists public.internship_sessions_one_open_per_user;

create unique index if not exists internship_sessions_one_open_per_user_course
  on public.internship_sessions (user_id, course_id)
  where status <> 'ENDED' and course_id is not null;

create unique index if not exists internship_sessions_one_open_legacy_null_course
  on public.internship_sessions (user_id)
  where status <> 'ENDED' and course_id is null;

create index if not exists internship_sessions_course_id_idx on public.internship_sessions (course_id);

drop policy if exists "internship_sessions learner full access" on public.internship_sessions;

create policy "internship_sessions learner full access"
  on public.internship_sessions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      course_id is null
      or exists (
        select 1 from public.enrollments e
        where e.course_id = internship_sessions.course_id
          and e.learner_id = auth.uid()
      )
    )
  );

drop function if exists public.internship_process_heartbeat(uuid, timestamptz, boolean);

create or replace function public.internship_process_heartbeat(
  p_session_id uuid,
  p_now timestamptz,
  p_tab_visible boolean,
  p_on_course_page boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_sess record;
  v_delta int;
  v_credit int;
  v_day date;
  v_daily int;
  v_max_daily int := 3600;
  v_idle int := 180;
  v_tick_cap int := 45;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_sess
  from public.internship_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('error', 'session_not_found');
  end if;

  if v_sess.status = 'ENDED' then
    return jsonb_build_object('error', 'session_ended');
  end if;

  v_delta := floor(extract(epoch from (p_now - v_sess.last_tick_at)))::int;
  if v_delta < 0 then
    v_delta := 0;
  end if;
  if v_delta > 86400 then
    v_delta := 86400;
  end if;

  v_day := (p_now at time zone 'utc')::date;

  if v_sess.status = 'ON_BREAK' then
    v_credit := least(v_delta, v_tick_cap);
    update public.internship_sessions
      set
        break_seconds = break_seconds + v_credit,
        last_tick_at = p_now,
        updated_at = p_now
    where id = p_session_id;

    return jsonb_build_object(
      'ok', true,
      'credited_break', v_credit,
      'active_seconds', v_sess.active_seconds,
      'break_seconds', v_sess.break_seconds + v_credit,
      'status', 'ON_BREAK'
    );
  end if;

  if v_sess.status = 'INACTIVE_AUTO' then
    update public.internship_sessions
      set last_tick_at = p_now, updated_at = p_now
    where id = p_session_id;
    return jsonb_build_object(
      'ok', true,
      'credited_active', 0,
      'active_seconds', v_sess.active_seconds,
      'break_seconds', v_sess.break_seconds,
      'status', 'INACTIVE_AUTO'
    );
  end if;

  if v_sess.status = 'ACTIVE' then
    if v_delta > v_idle then
      update public.internship_sessions
        set
          status = 'INACTIVE_AUTO',
          had_inactivity_auto = true,
          last_tick_at = p_now,
          updated_at = p_now
      where id = p_session_id;
      return jsonb_build_object(
        'ok', true,
        'credited_active', 0,
        'auto_inactive', true,
        'active_seconds', v_sess.active_seconds,
        'break_seconds', v_sess.break_seconds,
        'status', 'INACTIVE_AUTO'
      );
    end if;

    if not p_tab_visible or not p_on_course_page then
      update public.internship_sessions
        set last_tick_at = p_now, updated_at = p_now
      where id = p_session_id;
      return jsonb_build_object(
        'ok', true,
        'credited_active', 0,
        'tab_inactive', true,
        'active_seconds', v_sess.active_seconds,
        'break_seconds', v_sess.break_seconds,
        'status', 'ACTIVE'
      );
    end if;

    v_credit := least(v_delta, v_tick_cap);

    select coalesce(active_seconds, 0) into v_daily
    from public.internship_daily_activity
    where user_id = v_sess.user_id and day_utc = v_day;

    if v_daily is null then
      v_daily := 0;
    end if;

    if v_daily >= v_max_daily then
      v_credit := 0;
    elsif v_daily + v_credit > v_max_daily then
      v_credit := v_max_daily - v_daily;
    end if;

    if v_credit > 0 then
      insert into public.internship_daily_activity (user_id, day_utc, active_seconds)
      values (v_sess.user_id, v_day, v_credit)
      on conflict (user_id, day_utc) do update
        set active_seconds = public.internship_daily_activity.active_seconds + excluded.active_seconds;
    end if;

    update public.internship_sessions
      set
        active_seconds = active_seconds + v_credit,
        last_tick_at = p_now,
        updated_at = p_now
    where id = p_session_id;

    return jsonb_build_object(
      'ok', true,
      'credited_active', v_credit,
      'active_seconds', v_sess.active_seconds + v_credit,
      'break_seconds', v_sess.break_seconds,
      'status', 'ACTIVE',
      'daily_active_seconds', v_daily + v_credit
    );
  end if;

  return jsonb_build_object('error', 'unknown_state');
end;
$$;

revoke all on function public.internship_process_heartbeat(uuid, timestamptz, boolean, boolean) from public;
grant execute on function public.internship_process_heartbeat(uuid, timestamptz, boolean, boolean) to authenticated;
