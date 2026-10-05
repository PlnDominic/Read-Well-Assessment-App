-- Production bootstrap: creates your REAL first school and administrator.
-- Run once, after supabase/setup.sql, in the Supabase project your app
-- uses. Do NOT run supabase/seed.sql there (it creates demo accounts with a
-- password published in this public repo).
--
-- Every account after this first one (teachers, specialists, more admins)
-- is created from inside the app at /admin/staff.
--
-- Steps:
--   1. Supabase Dashboard -> Authentication -> Users -> "Add user" ->
--      "Create new user". Enter the administrator's real email and a
--      password, and tick "Auto Confirm User".
--   2. Change the three values on the "values" lines below.
--   3. Run this whole script in the SQL Editor.
--
-- Safe to re-run: if that account already has a profile, it's left alone.

do $$
declare
  admin_email text := 'REPLACE_WITH_ADMIN_EMAIL';
  admin_name  text := 'REPLACE_WITH_ADMIN_NAME';
  school_name text := 'REPLACE_WITH_SCHOOL_NAME';
  auth_user_id uuid;
  new_school_id uuid;
begin
  if admin_email like 'REPLACE_%' or admin_name like 'REPLACE_%' or school_name like 'REPLACE_%' then
    raise exception 'Fill in admin_email, admin_name and school_name at the top of this script first.';
  end if;

  select id into auth_user_id from auth.users where lower(email) = lower(admin_email);
  if auth_user_id is null then
    raise exception 'No login account for %. Create it first: Authentication -> Users -> Add user.', admin_email;
  end if;

  if exists (select 1 from public.profiles where id = auth_user_id) then
    raise notice 'A profile for % already exists; nothing to do.', admin_email;
    return;
  end if;

  select id into new_school_id from public.schools where name = school_name limit 1;
  if new_school_id is null then
    insert into public.schools (name) values (school_name) returning id into new_school_id;
  end if;

  insert into public.profiles (id, school_id, name, email, role)
  values (auth_user_id, new_school_id, admin_name, admin_email, 'administrator');

  raise notice 'Created administrator % for %.', admin_email, school_name;
end
$$;
