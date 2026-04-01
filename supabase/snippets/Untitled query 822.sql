-- Heartbeat RPC updates internship_sessions / internship_daily_activity; without this, RLS can
-- block those writes inside SECURITY DEFINER for some roles, and break_seconds never accumulates.
-- auth.uid() checks inside the function still enforce ownership.
alter function public.internship_process_heartbeat(uuid, timestamptz, boolean) set row_security = off;
