-- Internship online hours: session lifecycle, activity logs, daily active cap (UTC), offline hours.

create type public.internship_session_status as enum (
  'ACTIVE',
  'ON_BREAK',
  'INACTIVE_AUTO',
  'ENDED'
);

create type public.internship_activity_event_type as enum (
  'mouse_move',
  'click',
  'keypress',
  'visibility_hidden',
  'visibility_visible',
  'heartbeat',
  'inactivity_detected',
  'session_start',
  'break_start',
  'resume',
  'session_end',
  'ping_challenge_ok'
);

create table public.internship_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  break_seconds integer not null default 0 check (break_seconds >= 0),
  status public.internship_session_status not null default 'ACTIVE',
  last_tick_at timestamptz not null default now(),
  had_inactivity_auto boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open (non-ended) session per learner.
create unique index internship_sessions_one_open_per_user
  on public.internship_sessions (user_id)
  where status <> 'ENDED';

create index internship_sessions_user_id_idx on public.internship_sessions(user_id);
create index internship_sessions_start_time_idx on public.internship_sessions(start_time desc);

create table public.internship_activity_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.internship_sessions(id) on delete cascade,
  logged_at timestamptz not null default now(),
  event_type public.internship_activity_event_type not null
);

create index internship_activity_logs_session_id_idx on public.internship_activity_logs(session_id);
create index internship_activity_logs_logged_at_idx on public.internship_activity_logs(logged_at desc);

-- Server-maintained rollup for 6h/day cap (UTC day). Writes only via security definer RPC.
create table public.internship_daily_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_utc date not null,
  active_seconds integer not null default 0 check (active_seconds >= 0 and active_seconds <= 86400),
  primary key (user_id, day_utc)
);

create table public.internship_offline_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  note text,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index internship_offline_hours_user_id_idx on public.internship_offline_hours(user_id);

-- Heartbeat: server clock, idle detection, tab-hidden (no active credit), daily cap.
create or replace function public.internship_process_heartbeat(
  p_session_id uuid,
  p_now timestamptz,
  p_tab_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sess record;
  v_delta int;
  v_credit int;
  v_day date;
  v_daily int;
  v_max_daily int := 6 * 3600;
  v_idle int := 300;
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

    if not p_tab_visible then
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

revoke all on function public.internship_process_heartbeat(uuid, timestamptz, boolean) from public;
grant execute on function public.internship_process_heartbeat(uuid, timestamptz, boolean) to authenticated;

alter table public.internship_sessions enable row level security;
alter table public.internship_activity_logs enable row level security;
alter table public.internship_daily_activity enable row level security;
alter table public.internship_offline_hours enable row level security;

revoke insert, update, delete on public.internship_daily_activity from anon, authenticated;
grant select on public.internship_daily_activity to authenticated;

create policy "internship_sessions learner full access"
  on public.internship_sessions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "internship_sessions staff select"
  on public.internship_sessions
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      join public.courses c on c.id = e.course_id
      where e.learner_id = internship_sessions.user_id
        and c.instructor_id = auth.uid()
    )
  );

create policy "internship_activity learner insert"
  on public.internship_activity_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.internship_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "internship_activity learner select"
  on public.internship_activity_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internship_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "internship_activity staff select"
  on public.internship_activity_logs
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.internship_sessions s
      join public.enrollments e on e.learner_id = s.user_id
      join public.courses c on c.id = e.course_id
      where s.id = internship_activity_logs.session_id
        and c.instructor_id = auth.uid()
    )
  );

create policy "internship_daily learner read own"
  on public.internship_daily_activity
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "internship_daily admin read all"
  on public.internship_daily_activity
  for select
  to authenticated
  using (public.is_admin());

-- Offline hours: learners submit; only admins approve.
create policy "internship_offline learner insert"
  on public.internship_offline_hours
  for insert
  to authenticated
  with check (user_id = auth.uid() and approved_by is null);

create policy "internship_offline learner select own"
  on public.internship_offline_hours
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "internship_offline learner update pending"
  on public.internship_offline_hours
  for update
  to authenticated
  using (user_id = auth.uid() and approved_by is null)
  with check (user_id = auth.uid() and approved_by is null);

create policy "internship_offline admin select"
  on public.internship_offline_hours
  for select
  to authenticated
  using (public.is_admin());

create policy "internship_offline admin modify"
  on public.internship_offline_hours
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
