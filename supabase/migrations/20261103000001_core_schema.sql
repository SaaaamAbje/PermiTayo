-- Permitayo, Phase 2: core schema.
-- Tables: profiles, departments, department_members, audit_logs.
-- Security (RLS, grants, functions) is in the next migration.

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per Supabase Auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
    constraint profiles_full_name_length check (char_length(btrim(full_name)) between 2 and 120),
  email text not null,
  phone_number text
    constraint profiles_phone_format check (phone_number is null or phone_number ~ '^(\+63|0)9[0-9]{9}$'),
  role text not null default 'applicant'
    constraint profiles_role_allowed check (
      role in ('applicant', 'bplo_personnel', 'department_personnel', 'department_head', 'administrator')
    ),
  account_status text not null default 'active'
    constraint profiles_status_allowed check (
      account_status in ('active', 'inactive', 'suspended', 'pending')
    ),
  -- When the applicant accepted the privacy notice at registration.
  privacy_notice_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_key on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);
create index profiles_account_status_idx on public.profiles (account_status);
create index profiles_created_at_idx on public.profiles (created_at desc);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is
  'Application profile for each auth user. role and account_status are only changed through admin_* functions.';

-- ---------------------------------------------------------------------------
-- departments: configurable list of participating offices
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  department_name text not null
    constraint departments_name_length check (char_length(btrim(department_name)) between 2 and 160),
  department_code text not null
    constraint departments_code_format check (department_code ~ '^[A-Z0-9_-]{2,16}$'),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_code_key unique (department_code)
);

create unique index departments_name_lower_key on public.departments (lower(department_name));

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- department_members: assigns personnel to departments
-- ---------------------------------------------------------------------------
create table public.department_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete restrict,
  department_position text
    constraint department_members_position_length check (
      department_position is null or char_length(department_position) <= 80
    ),
  created_at timestamptz not null default now(),
  constraint department_members_unique unique (profile_id, department_id)
);

create index department_members_department_idx on public.department_members (department_id);

-- ---------------------------------------------------------------------------
-- audit_logs: append-only record of important activity
-- Never store passwords, tokens or other secrets here.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Kept (set to null) if the acting user is later deleted.
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_user_idx on public.audit_logs (user_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
