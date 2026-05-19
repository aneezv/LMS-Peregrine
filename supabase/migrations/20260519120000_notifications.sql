-- Notifications: shared contract between the client LMS app and the separate
-- LMS Admin app. The Admin app (service_role) inserts one `notifications` row
-- describing a campaign, then calls fn_dispatch_notification() which fans the
-- campaign out into one `notification_recipients` row per targeted user.
-- Clients only read their own recipient rows + the joined campaign, and flip
-- is_read on their own rows. All targeting/fan-out logic lives here so the
-- Admin app stays a thin writer.

create type public.notification_type   as enum ('info', 'success', 'warning', 'announcement');
create type public.notification_target as enum ('all', 'role', 'user', 'course');

-- ── Campaign (authored by admin) ─────────────────────────────────────────────
create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 200),
  body             text not null check (char_length(body) <= 4000),
  type             public.notification_type   not null default 'info',
  link_url         text,
  created_by       uuid references public.profiles(id) on delete set null,
  target_type      public.notification_target not null,
  target_role      public.user_role,
  target_user_ids  uuid[],
  target_course_id uuid references public.courses(id) on delete cascade,
  expires_at       timestamptz,
  dispatched_at    timestamptz,
  created_at       timestamptz not null default now(),
  constraint notifications_target_role_chk
    check (target_type <> 'role' or target_role is not null),
  constraint notifications_target_users_chk
    check (target_type <> 'user'
           or (target_user_ids is not null and array_length(target_user_ids, 1) >= 1)),
  constraint notifications_target_course_chk
    check (target_type <> 'course' or target_course_id is not null)
);

-- ── Fan-out / per-user read state ────────────────────────────────────────────
create table public.notification_recipients (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  recipient_id    uuid not null references auth.users(id)          on delete cascade,
  is_read         boolean not null default false,
  read_at         timestamptz,
  -- Denormalized from notifications.expires_at at dispatch so the read path
  -- stays a single-table, index-backed query (no join to filter expired).
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint notification_recipients_unique unique (notification_id, recipient_id)
);

create index notification_recipients_recipient_unread_idx
  on public.notification_recipients (recipient_id, is_read, created_at desc);
create index notification_recipients_recipient_created_idx
  on public.notification_recipients (recipient_id, created_at desc, id desc);
create index notification_recipients_notification_idx
  on public.notification_recipients (notification_id);
create index notifications_target_course_idx
  on public.notifications (target_course_id) where target_course_id is not null;
create index notification_recipients_expires_idx
  on public.notification_recipients (expires_at) where expires_at is not null;
create index notification_recipients_created_idx
  on public.notification_recipients (created_at);

-- ── Dispatch: single source of truth for targeting + idempotent fan-out ──────
create or replace function public.fn_dispatch_notification(p_notification_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_n   public.notifications;
  v_cnt integer := 0;
begin
  select * into v_n from public.notifications where id = p_notification_id for update;
  if not found then
    raise exception 'notification % not found', p_notification_id;
  end if;
  if v_n.dispatched_at is not null then
    return 0;
  end if;

  with targets as (
    select p.id as recipient_id
    from public.profiles p
    where p.is_active
      and (
            (v_n.target_type = 'all')
         or (v_n.target_type = 'role'   and p.role = v_n.target_role)
         or (v_n.target_type = 'user'   and p.id = any (coalesce(v_n.target_user_ids, array[]::uuid[])))
         or (v_n.target_type = 'course' and exists (
               select 1 from public.enrollments e
               where e.course_id = v_n.target_course_id and e.learner_id = p.id))
      )
  ),
  ins as (
    insert into public.notification_recipients (notification_id, recipient_id, expires_at)
    select p_notification_id, t.recipient_id, v_n.expires_at from targets t
    on conflict (notification_id, recipient_id) do nothing
    returning 1
  )
  select count(*)::int into v_cnt from ins;

  update public.notifications set dispatched_at = now() where id = p_notification_id;
  return v_cnt;
end;
$$;

revoke all on function public.fn_dispatch_notification(uuid) from public;
grant execute on function public.fn_dispatch_notification(uuid) to service_role;

-- ── Retention: bounded lifecycle, run on a schedule via the cron route ───────
-- Purges, in one pass:
--   1. recipient rows whose campaign has expired (expires_at < now())
--   2. read rows older than READ_RETENTION (default 30d)
--   3. any row older than HARD_CAP (default 90d) regardless of read state
--   4. campaign rows that are expired or have no recipients left
-- p_read_retention / p_hard_cap are intervals so the schedule can tune them.
create or replace function public.fn_purge_notifications(
  p_read_retention interval default interval '30 days',
  p_hard_cap       interval default interval '90 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_expired   int := 0;
  v_read_old  int := 0;
  v_hard      int := 0;
  v_campaigns int := 0;
begin
  with d as (
    delete from public.notification_recipients
    where expires_at is not null and expires_at < now()
    returning 1
  ) select count(*)::int into v_expired from d;

  with d as (
    delete from public.notification_recipients
    where is_read and read_at is not null and read_at < now() - p_read_retention
    returning 1
  ) select count(*)::int into v_read_old from d;

  with d as (
    delete from public.notification_recipients
    where created_at < now() - p_hard_cap
    returning 1
  ) select count(*)::int into v_hard from d;

  with d as (
    delete from public.notifications n
    where (n.expires_at is not null and n.expires_at < now())
       or (n.dispatched_at is not null
           and not exists (select 1 from public.notification_recipients r
                           where r.notification_id = n.id))
    returning 1
  ) select count(*)::int into v_campaigns from d;

  return jsonb_build_object(
    'expired_recipients',   v_expired,
    'read_retention',       v_read_old,
    'hard_cap',             v_hard,
    'campaigns_removed',    v_campaigns,
    'ran_at',               now()
  );
end;
$$;

revoke all on function public.fn_purge_notifications(interval, interval) from public;
grant execute on function public.fn_purge_notifications(interval, interval) to service_role;

-- ── RLS (owned-row pattern) ──────────────────────────────────────────────────
alter table public.notifications           enable row level security;
alter table public.notification_recipients enable row level security;

create policy "Recipients read their notifications"
  on public.notifications for select to authenticated
  using (exists (
    select 1 from public.notification_recipients r
    where r.notification_id = notifications.id and r.recipient_id = auth.uid()));

create policy "Users read own recipient rows"
  on public.notification_recipients for select to authenticated
  using (recipient_id = auth.uid());

create policy "Users update own recipient read state"
  on public.notification_recipients for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ── Grants (no INSERT/DELETE for authenticated -> service_role/RPC only) ──────
revoke all on public.notifications           from public;
revoke all on public.notification_recipients from public;
grant select         on public.notifications          to authenticated;
grant select, update on public.notification_recipients to authenticated;
grant all            on public.notifications           to service_role;
grant all            on public.notification_recipients to service_role;

-- ── Realtime (RLS is the security boundary; client filters recipient_id) ─────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_recipients'
  ) then
    alter publication supabase_realtime add table public.notification_recipients;
  end if;
end;
$$;
