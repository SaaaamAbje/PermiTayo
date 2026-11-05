-- Permitayo, Phase 2: security model.
--
-- Principles
--   1. Table privileges are revoked from everyone, then granted back minimally.
--   2. RLS is enabled on every table; there is no "all authenticated users" policy.
--   3. role / account_status / department assignments are changed only by the
--      SECURITY DEFINER admin_* functions below. They re-check the caller
--      (auth.uid()) inside the database, so a role value sent by a browser is
--      never trusted.
--   4. audit_logs is written only by definer functions and read only by active
--      administrators.

-- ---------------------------------------------------------------------------
-- Helper functions used by policies (SECURITY DEFINER so they can read
-- profiles without recursive RLS; search_path is pinned to '').
-- ---------------------------------------------------------------------------

-- Role of the current user, or NULL when signed out or the account is not active.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.account_status = 'active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'administrator', false)
$$;

create or replace function public.has_app_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any (p_roles), false)
$$;

-- Departments the current (active) user belongs to.
create or replace function public.my_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dm.department_id
  from public.department_members dm
  where dm.profile_id = (select auth.uid())
    and public.current_app_role() is not null
$$;

-- Departments the current user belongs to AND heads.
create or replace function public.my_head_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dm.department_id
  from public.department_members dm
  where dm.profile_id = (select auth.uid())
    and public.current_app_role() = 'department_head'
$$;

-- True when the target profile belongs to a department the current user heads.
create or replace function public.head_can_view_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.department_members dm
    where dm.profile_id = p_profile
      and dm.department_id in (select public.my_head_department_ids())
  )
$$;

-- ---------------------------------------------------------------------------
-- Audit helpers
-- ---------------------------------------------------------------------------

-- Internal writer. Not callable by API roles.
create or replace function public.write_audit_log(
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_description text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (user_id, action, entity_type, entity_id, description)
  values (p_user_id, p_action, p_entity_type, p_entity_id, p_description)
$$;

-- Lets a signed-in user record a small, fixed set of events about themselves.
-- The description text is fixed here, so callers cannot write arbitrary entries.
create or replace function public.log_self_event(p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_description text;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  v_description := case p_action
    when 'user.login' then 'User logged in.'
    when 'user.logout' then 'User logged out.'
    when 'user.password_changed' then 'User changed their password.'
    else null
  end;

  if v_description is null then
    raise exception 'Unsupported event.' using errcode = '22023';
  end if;

  perform public.write_audit_log(v_uid, p_action, 'profile', v_uid, v_description);
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating a profile for every new auth user.
-- The role is ALWAYS 'applicant'. Anything in user metadata about roles is ignored.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_consent timestamptz;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null or char_length(v_name) < 2 then
    v_name := 'New user';
  end if;

  v_phone := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone_number', ''), '[\s-]', '', 'g'), '');
  if v_phone is not null and v_phone !~ '^(\+63|0)9[0-9]{9}$' then
    v_phone := null;
  end if;

  if (new.raw_user_meta_data ->> 'privacy_notice_accepted') = 'true' then
    v_consent := now();
  end if;

  insert into public.profiles (id, full_name, email, phone_number, role, account_status, privacy_notice_accepted_at)
  values (new.id, left(v_name, 120), coalesce(new.email, ''), v_phone, 'applicant', 'active', v_consent);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in step with auth.users.email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Defence in depth: API roles can never change privileged profile columns,
-- even if a future grant or policy change allowed an UPDATE.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (
       new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.account_status is distinct from old.account_status
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at
       or new.privacy_notice_accepted_at is distinct from old.privacy_notice_accepted_at
     )
  then
    raise exception 'This profile field cannot be changed directly.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Audit trail for self-service profile edits (field names only, never values).
create or replace function public.audit_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[] := '{}';
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or v_actor <> new.id then
    return new;
  end if;
  if new.full_name is distinct from old.full_name then v_fields := array_append(v_fields, 'full_name'::text); end if;
  if new.phone_number is distinct from old.phone_number then v_fields := array_append(v_fields, 'phone_number'::text); end if;
  if array_length(v_fields, 1) is not null then
    perform public.write_audit_log(
      v_actor, 'profile.updated', 'profile', new.id,
      'Profile updated (' || array_to_string(v_fields, ', ') || ').'
    );
  end if;
  return new;
end;
$$;

create trigger profiles_audit_update
  after update on public.profiles
  for each row execute function public.audit_profile_update();

-- Audit trail for department configuration changes.
create or replace function public.audit_department_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(v_actor, 'department.created', 'department', new.id,
      'Department created: ' || new.department_code || '.');
  elsif new.is_active is distinct from old.is_active then
    perform public.write_audit_log(v_actor,
      case when new.is_active then 'department.activated' else 'department.deactivated' end,
      'department', new.id,
      'Department ' || new.department_code || case when new.is_active then ' activated.' else ' deactivated.' end);
  elsif new.department_name is distinct from old.department_name
     or new.department_code is distinct from old.department_code
     or new.description is distinct from old.description then
    perform public.write_audit_log(v_actor, 'department.updated', 'department', new.id,
      'Department details updated: ' || new.department_code || '.');
  end if;
  return new;
end;
$$;

create trigger departments_audit_change
  after insert or update on public.departments
  for each row execute function public.audit_department_change();

-- ---------------------------------------------------------------------------
-- Administrator operations. Each one:
--   * serialises on an advisory lock (prevents two admins locking each other out),
--   * re-verifies the caller is an active administrator,
--   * validates input,
--   * writes its audit entry in the same transaction.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(p_target uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old_role text;
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtext('permitayo.admin_changes'));

  if not public.is_admin() then
    raise exception 'Only administrators can change roles.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('applicant', 'bplo_personnel', 'department_personnel', 'department_head', 'administrator') then
    raise exception 'Invalid role.' using errcode = '22023';
  end if;
  if p_target = v_actor then
    raise exception 'You cannot change your own role.';
  end if;

  select role, account_status into v_old_role, v_status
  from public.profiles where id = p_target for update;
  if not found then
    raise exception 'User not found.';
  end if;
  if v_old_role = p_role then
    return;
  end if;

  if v_old_role = 'administrator' and v_status = 'active' and p_role <> 'administrator' then
    if (select count(*) from public.profiles
        where role = 'administrator' and account_status = 'active' and id <> p_target) < 1 then
      raise exception 'At least one active administrator must remain.';
    end if;
  end if;

  update public.profiles set role = p_role where id = p_target;

  -- Department assignments only make sense for staff roles.
  if p_role in ('applicant', 'administrator') then
    delete from public.department_members where profile_id = p_target;
  end if;

  perform public.write_audit_log(v_actor, 'user.role_changed', 'profile', p_target,
    'User role changed from ' || v_old_role || ' to ' || p_role || '.');
end;
$$;

create or replace function public.admin_set_account_status(p_target uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old_status text;
  v_role text;
begin
  perform pg_advisory_xact_lock(hashtext('permitayo.admin_changes'));

  if not public.is_admin() then
    raise exception 'Only administrators can change account status.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'inactive', 'suspended', 'pending') then
    raise exception 'Invalid account status.' using errcode = '22023';
  end if;
  if p_target = v_actor then
    raise exception 'You cannot change your own account status.';
  end if;

  select account_status, role into v_old_status, v_role
  from public.profiles where id = p_target for update;
  if not found then
    raise exception 'User not found.';
  end if;
  if v_old_status = p_status then
    return;
  end if;

  if v_role = 'administrator' and v_old_status = 'active' and p_status <> 'active' then
    if (select count(*) from public.profiles
        where role = 'administrator' and account_status = 'active' and id <> p_target) < 1 then
      raise exception 'At least one active administrator must remain.';
    end if;
  end if;

  update public.profiles set account_status = p_status where id = p_target;

  perform public.write_audit_log(v_actor, 'user.status_changed', 'profile', p_target,
    'Account status changed from ' || v_old_status || ' to ' || p_status || '.');
end;
$$;

create or replace function public.admin_assign_department(
  p_profile uuid,
  p_department uuid,
  p_position text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_active boolean;
  v_code text;
  v_position text := nullif(btrim(coalesce(p_position, '')), '');
  v_existing uuid;
begin
  perform pg_advisory_xact_lock(hashtext('permitayo.admin_changes'));

  if not public.is_admin() then
    raise exception 'Only administrators can assign departments.' using errcode = '42501';
  end if;
  if v_position is not null and char_length(v_position) > 80 then
    raise exception 'Position must be 80 characters or fewer.' using errcode = '22023';
  end if;

  select role into v_role from public.profiles where id = p_profile;
  if v_role is null then
    raise exception 'User not found.';
  end if;
  if v_role not in ('bplo_personnel', 'department_personnel', 'department_head') then
    raise exception 'Only BPLO, department personnel or department heads can be assigned to a department.';
  end if;

  select is_active, department_code into v_active, v_code from public.departments where id = p_department;
  if v_code is null then
    raise exception 'Department not found.';
  end if;
  if not v_active then
    raise exception 'That department is not active. Activate it first.';
  end if;

  select id into v_existing from public.department_members
  where profile_id = p_profile and department_id = p_department;

  insert into public.department_members (profile_id, department_id, department_position)
  values (p_profile, p_department, v_position)
  on conflict (profile_id, department_id)
  do update set department_position = excluded.department_position;

  perform public.write_audit_log(v_actor,
    case when v_existing is null then 'department_member.assigned' else 'department_member.updated' end,
    'profile', p_profile,
    case when v_existing is null
      then 'User assigned to department ' || v_code || '.'
      else 'Department position updated for ' || v_code || '.' end);
end;
$$;

create or replace function public.admin_remove_department_assignment(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_profile uuid;
  v_code text;
begin
  perform pg_advisory_xact_lock(hashtext('permitayo.admin_changes'));

  if not public.is_admin() then
    raise exception 'Only administrators can change department assignments.' using errcode = '42501';
  end if;

  select dm.profile_id, d.department_code into v_profile, v_code
  from public.department_members dm
  join public.departments d on d.id = dm.department_id
  where dm.id = p_member;
  if v_profile is null then
    raise exception 'Assignment not found.';
  end if;

  delete from public.department_members where id = p_member;

  perform public.write_audit_log(v_actor, 'department_member.removed', 'profile', v_profile,
    'User removed from department ' || v_code || '.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Table privileges (least privilege)
-- ---------------------------------------------------------------------------
revoke all on public.profiles from public, anon, authenticated;
revoke all on public.departments from public, anon, authenticated;
revoke all on public.department_members from public, anon, authenticated;
revoke all on public.audit_logs from public, anon, authenticated;

grant select on public.profiles to authenticated;
-- Users may edit only these two columns of their own row (see policy below).
grant update (full_name, phone_number) on public.profiles to authenticated;

grant select, insert, update on public.departments to authenticated;
grant select on public.department_members to authenticated;
grant select on public.audit_logs to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.current_app_role() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.has_app_role(text[]) from public, anon, authenticated;
revoke all on function public.my_department_ids() from public, anon, authenticated;
revoke all on function public.my_head_department_ids() from public, anon, authenticated;
revoke all on function public.head_can_view_profile(uuid) from public, anon, authenticated;
revoke all on function public.write_audit_log(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.log_self_event(text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
revoke all on function public.guard_profile_privileged_columns() from public, anon, authenticated;
revoke all on function public.audit_profile_update() from public, anon, authenticated;
revoke all on function public.audit_department_change() from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_account_status(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_assign_department(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_remove_department_assignment(uuid) from public, anon, authenticated;

-- Needed so RLS policies can call them for signed-in users.
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_app_role(text[]) to authenticated;
grant execute on function public.my_department_ids() to authenticated;
grant execute on function public.my_head_department_ids() to authenticated;
grant execute on function public.head_can_view_profile(uuid) to authenticated;
-- Callable RPCs (each re-checks the caller inside).
grant execute on function public.log_self_event(text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_account_status(uuid, text) to authenticated;
grant execute on function public.admin_assign_department(uuid, uuid, text) to authenticated;
grant execute on function public.admin_remove_department_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.audit_logs enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_admin
  on public.profiles for select to authenticated
  using ((select public.is_admin()));

create policy profiles_select_department_head
  on public.profiles for select to authenticated
  using ((select public.head_can_view_profile(id)));

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and account_status = 'active')
  with check (id = (select auth.uid()));

-- departments ---------------------------------------------------------------
-- Visible to administrators, BPLO personnel and members of that department.
-- Applicants cannot read department records.
create policy departments_select
  on public.departments for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_app_role(array['bplo_personnel']))
    or id in (select public.my_department_ids())
  );

create policy departments_insert_admin
  on public.departments for insert to authenticated
  with check ((select public.is_admin()));

create policy departments_update_admin
  on public.departments for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- department_members (writes only through admin_* functions) -----------------
create policy department_members_select_admin
  on public.department_members for select to authenticated
  using ((select public.is_admin()));

create policy department_members_select_own
  on public.department_members for select to authenticated
  using (profile_id = (select auth.uid()));

create policy department_members_select_head
  on public.department_members for select to authenticated
  using (department_id in (select public.my_head_department_ids()));

-- audit_logs (read-only, administrators only; no write policies exist) -------
create policy audit_logs_select_admin
  on public.audit_logs for select to authenticated
  using ((select public.is_admin()));
