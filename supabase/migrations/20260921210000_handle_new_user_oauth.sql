-- Make handle_new_user robust for OAuth providers (Google) which might use 'name' instead of 'full_name'

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- Extract name from raw_user_meta_data, falling back to 'name', then email prefix
  v_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    v_name,
    'learner',
    new.email
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        email     = coalesce(excluded.email, public.profiles.email);
        
  return new;
end;
$$;
