-- Permitayo, Phase 3: business profiles and permit applications (schema).
-- Tables: reference_counters, permit_types, business_establishments,
--         permit_applications, application_status_history.
-- Security (grants, RLS, guard triggers, RPCs) is in the next migration.
--
-- Existing Phase 2 tables are not changed. owner_id / applicant_id reference
-- public.profiles(id), which is the auth user's id.

-- ---------------------------------------------------------------------------
-- reference_counters: per-prefix, per-year counters for public reference
-- numbers (BUS-2026-000001, PTY-2026-000001). Only definer functions touch it.
-- ---------------------------------------------------------------------------
create table public.reference_counters (
  prefix text not null
    constraint reference_counters_prefix_format check (prefix ~ '^[A-Z]{2,5}$'),
  year integer not null
    constraint reference_counters_year_range check (year between 2000 and 2999),
  last_value bigint not null default 0
    constraint reference_counters_last_value_positive check (last_value >= 0),
  primary key (prefix, year)
);

comment on table public.reference_counters is
  'Server-side counters for public reference numbers. Not readable or writable by API roles.';

-- Returns the next reference for a prefix and year, e.g. PTY-2026-000001.
-- The INSERT ... ON CONFLICT DO UPDATE takes a row lock, so concurrent callers
-- are serialised and can never receive the same number. A rolled-back
-- transaction also rolls back its increment, so numbers are not skipped.
create or replace function public.next_reference_number(p_prefix text, p_year integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  insert into public.reference_counters as rc (prefix, year, last_value)
  values (p_prefix, p_year, 1)
  on conflict (prefix, year)
  do update set last_value = rc.last_value + 1
  returning rc.last_value into v_value;

  return p_prefix || '-' || p_year::text || '-'
    || case when v_value < 1000000 then lpad(v_value::text, 6, '0') else v_value::text end;
end;
$$;

-- Current year in Philippine time (used for reference numbers).
create or replace function public.manila_year()
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from (now() at time zone 'Asia/Manila'))::integer
$$;

-- ---------------------------------------------------------------------------
-- permit_types: configurable application types
-- ---------------------------------------------------------------------------
create table public.permit_types (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint permit_types_name_length check (char_length(btrim(name)) between 2 and 120),
  description text
    constraint permit_types_description_length check (description is null or char_length(description) <= 1000),
  application_code text not null
    constraint permit_types_code_format check (application_code ~ '^[A-Z0-9_]{2,24}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permit_types_code_key unique (application_code)
);

create unique index permit_types_name_lower_key on public.permit_types (lower(name));

create trigger permit_types_set_updated_at
  before update on public.permit_types
  for each row execute function public.set_updated_at();

comment on table public.permit_types is
  'Application types. Managed by administrators. No municipal procedure or eligibility rule is encoded here.';

-- ---------------------------------------------------------------------------
-- business_establishments: applicant-managed business profiles
-- A profile here is NOT an official government registration.
-- ---------------------------------------------------------------------------
create table public.business_establishments (
  id uuid primary key default gen_random_uuid(),
  -- Restrict: a profile with business records cannot be silently removed.
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  -- Assigned by trigger (BUS-YYYY-NNNNNN). Never accepted from the client.
  business_reference_number text not null,

  -- Basic information
  registered_business_name text not null
    constraint business_name_length check (char_length(btrim(registered_business_name)) between 2 and 200),
  trade_name text
    constraint business_trade_name_length check (trade_name is null or char_length(trade_name) <= 200),
  business_description text
    constraint business_description_length check (business_description is null or char_length(business_description) <= 1000),
  business_type text not null
    constraint business_type_length check (char_length(btrim(business_type)) between 2 and 120),
  ownership_type text not null
    constraint business_ownership_type_allowed check (
      ownership_type in ('sole_proprietorship', 'partnership', 'corporation', 'cooperative', 'other')
    ),
  business_category text not null
    constraint business_category_length check (char_length(btrim(business_category)) between 2 and 120),
  business_email text
    constraint business_email_format check (
      business_email is null or (char_length(business_email) <= 254 and business_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    ),
  business_contact_number text not null
    constraint business_contact_format check (business_contact_number ~ '^(\+63|0)[2-9][0-9]{7,9}$'),

  -- Address (defaults to Rosario, Batangas but stays configurable)
  province text not null default 'Batangas'
    constraint business_province_length check (char_length(btrim(province)) between 2 and 80),
  municipality text not null default 'Rosario'
    constraint business_municipality_length check (char_length(btrim(municipality)) between 2 and 80),
  barangay text not null
    constraint business_barangay_length check (char_length(btrim(barangay)) between 2 and 80),
  street_address text
    constraint business_street_length check (street_address is null or char_length(street_address) <= 200),
  zip_code text not null
    constraint business_zip_format check (zip_code ~ '^[0-9]{4}$'),

  -- Owner
  owner_full_name text not null
    constraint business_owner_name_length check (char_length(btrim(owner_full_name)) between 2 and 120),
  owner_email text
    constraint business_owner_email_format check (
      owner_email is null or (char_length(owner_email) <= 254 and owner_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    ),
  owner_contact_number text not null
    constraint business_owner_contact_format check (owner_contact_number ~ '^(\+63|0)[2-9][0-9]{7,9}$'),

  -- Operation
  nature_of_business text not null
    constraint business_nature_length check (char_length(btrim(nature_of_business)) between 2 and 300),
  employee_count integer not null default 0
    constraint business_employee_count_range check (employee_count between 0 and 1000000),
  estimated_capital numeric(15, 2)
    constraint business_capital_range check (estimated_capital is null or estimated_capital between 0 and 9999999999999.99),
  establishment_status text not null
    constraint business_establishment_status_allowed check (
      establishment_status in ('not_yet_operating', 'operating', 'temporarily_closed', 'permanently_closed')
    ),
  date_established date
    constraint business_date_established_range check (date_established is null or date_established >= date '1900-01-01'),

  -- Record status of this Permitayo profile (not a government status)
  record_status text not null default 'pending_verification'
    constraint business_record_status_allowed check (record_status in ('pending_verification', 'active', 'inactive')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_reference_number_key unique (business_reference_number)
);

create index business_owner_idx on public.business_establishments (owner_id, created_at desc);
create index business_record_status_idx on public.business_establishments (record_status);
create index business_name_lower_idx on public.business_establishments (lower(registered_business_name));
create index business_created_at_idx on public.business_establishments (created_at desc);

create trigger business_establishments_set_updated_at
  before update on public.business_establishments
  for each row execute function public.set_updated_at();

-- Always assign the reference number on the server, ignoring any supplied value.
create or replace function public.assign_business_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.business_reference_number := public.next_reference_number('BUS', public.manila_year());
  return new;
end;
$$;

create trigger business_establishments_assign_reference
  before insert on public.business_establishments
  for each row execute function public.assign_business_reference();

comment on table public.business_establishments is
  'Business profiles entered by applicants. A profile is not an official government registration.';

-- ---------------------------------------------------------------------------
-- permit_applications
-- ---------------------------------------------------------------------------
create table public.permit_applications (
  id uuid primary key default gen_random_uuid(),
  -- Public reference (PTY-YYYY-NNNNNN). Null while the application is a draft.
  reference_number text,
  applicant_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  business_id uuid not null references public.business_establishments (id) on delete restrict,
  permit_type_id uuid not null references public.permit_types (id) on delete restrict,
  application_status text not null default 'draft'
    constraint permit_applications_status_allowed check (application_status in ('draft', 'submitted', 'cancelled')),

  -- Application details (prefilled from the business profile, editable while draft)
  business_name text
    constraint permit_applications_business_name_length check (business_name is null or char_length(business_name) <= 200),
  business_address text
    constraint permit_applications_business_address_length check (business_address is null or char_length(business_address) <= 400),
  nature_of_business text
    constraint permit_applications_nature_length check (nature_of_business is null or char_length(nature_of_business) <= 300),
  business_category text
    constraint permit_applications_category_length check (business_category is null or char_length(business_category) <= 120),
  applicant_remarks text
    constraint permit_applications_remarks_length check (applicant_remarks is null or char_length(applicant_remarks) <= 1000),

  -- Frozen copy of the applicant and business profile at submission time.
  submission_snapshot jsonb,

  cancellation_reason text
    constraint permit_applications_cancel_reason_length check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  cancelled_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint permit_applications_reference_key unique (reference_number),
  constraint permit_applications_reference_format check (
    reference_number is null or reference_number ~ '^PTY-[0-9]{4}-[0-9]{6,}$'
  ),
  -- Status / timestamp consistency.
  constraint permit_applications_state_consistency check (
    (application_status = 'draft' and reference_number is null and submitted_at is null and cancelled_at is null)
    or (application_status = 'submitted' and reference_number is not null and submitted_at is not null and cancelled_at is null)
    or (application_status = 'cancelled' and cancelled_at is not null)
  )
);

create index permit_applications_applicant_idx on public.permit_applications (applicant_id, created_at desc);
create index permit_applications_business_idx on public.permit_applications (business_id, created_at desc);
create index permit_applications_type_idx on public.permit_applications (permit_type_id);
create index permit_applications_status_idx on public.permit_applications (application_status, submitted_at desc);
create index permit_applications_business_name_lower_idx on public.permit_applications (lower(business_name));

create trigger permit_applications_set_updated_at
  before update on public.permit_applications
  for each row execute function public.set_updated_at();

comment on table public.permit_applications is
  'Business permit applications. Status, reference number and timestamps change only through definer functions.';

-- ---------------------------------------------------------------------------
-- application_status_history: append-only status trail (written by trigger)
-- ---------------------------------------------------------------------------
create table public.application_status_history (
  id uuid primary key default gen_random_uuid(),
  -- Drafts can be deleted by their owner; their history goes with them.
  -- Non-draft applications cannot be deleted (see guard trigger).
  application_id uuid not null references public.permit_applications (id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  remarks text
    constraint application_status_history_remarks_length check (remarks is null or char_length(remarks) <= 500),
  created_at timestamptz not null default now()
);

create index application_status_history_application_idx
  on public.application_status_history (application_id, created_at);
