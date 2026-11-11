-- Permitayo, Phase 3: security model for business profiles and applications.
--
-- Same principles as Phase 2:
--   1. Revoke everything, then grant back the minimum (column-level where possible).
--   2. RLS on every table. Applicants see only their own rows. BPLO personnel and
--      administrators can read business profiles and NON-draft applications.
--   3. Ownership (owner_id, applicant_id), reference numbers, statuses and
--      timestamps are never writable by API roles. Status changes happen only in
--      SECURITY DEFINER functions that re-check the caller with auth.uid().
--   4. Guard triggers repeat the column rules as a second line of defence.
--   5. Every status change is written to application_status_history by a trigger,
--      and significant events are written to audit_logs (no personal values).

-- ---------------------------------------------------------------------------
-- Guard triggers (defence in depth)
-- ---------------------------------------------------------------------------
create or replace function public.guard_business_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (
       new.id is distinct from old.id
       or new.owner_id is distinct from old.owner_id
       or new.business_reference_number is distinct from old.business_reference_number
       or new.record_status is distinct from old.record_status
       or new.created_at is distinct from old.created_at
     )
  then
    raise exception 'This business field cannot be changed directly.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger business_establishments_guard_protected_columns
  before update on public.business_establishments
  for each row execute function public.guard_business_protected_columns();

create or replace function public.guard_application_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    -- New applications from the API always start as an unreferenced draft owned by the caller.
    if new.applicant_id is distinct from (select auth.uid())
       or new.application_status <> 'draft'
       or new.reference_number is not null
       or new.submitted_at is not null
       or new.cancelled_at is not null
       or new.cancelled_by is not null
       or new.cancellation_reason is not null
       or new.submission_snapshot is not null
    then
      raise exception 'Applications must be created as drafts by their owner.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger permit_applications_guard_insert
  before insert on public.permit_applications
  for each row execute function public.guard_application_insert();

create or replace function public.guard_application_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if old.application_status <> 'draft' then
      raise exception 'Submitted or cancelled applications cannot be changed directly.' using errcode = '42501';
    end if;
    if new.id is distinct from old.id
       or new.applicant_id is distinct from old.applicant_id
       or new.application_status is distinct from old.application_status
       or new.reference_number is distinct from old.reference_number
       or new.submitted_at is distinct from old.submitted_at
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancellation_reason is distinct from old.cancellation_reason
       or new.submission_snapshot is distinct from old.submission_snapshot
       or new.created_at is distinct from old.created_at
    then
      raise exception 'This application field cannot be changed directly.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger permit_applications_guard_update
  before update on public.permit_applications
  for each row execute function public.guard_application_update();

-- Only drafts may ever be deleted, by anyone. Submitted and cancelled records are kept.
create or replace function public.guard_application_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.application_status <> 'draft' then
    raise exception 'Only draft applications can be deleted. Submitted records are preserved.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger permit_applications_guard_delete
  before delete on public.permit_applications
  for each row execute function public.guard_application_delete();

-- History rows are append-only for everyone (cascade from a draft delete is allowed).
create or replace function public.guard_status_history_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Status history cannot be changed.' using errcode = '42501';
end;
$$;

create trigger application_status_history_no_update
  before update on public.application_status_history
  for each row execute function public.guard_status_history_update();

-- ---------------------------------------------------------------------------
-- Status history and audit triggers
-- ---------------------------------------------------------------------------
create or replace function public.record_application_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_remarks text := nullif(btrim(coalesce(current_setting('permitayo.status_remarks', true), '')), '');
begin
  if tg_op = 'INSERT' then
    insert into public.application_status_history (application_id, previous_status, new_status, changed_by, remarks)
    values (new.id, null, new.application_status, coalesce(v_actor, new.applicant_id), 'Draft created.');
    perform public.write_audit_log(coalesce(v_actor, new.applicant_id), 'application.created', 'permit_application', new.id,
      'Draft application created.');
  elsif new.application_status is distinct from old.application_status then
    insert into public.application_status_history (application_id, previous_status, new_status, changed_by, remarks)
    values (new.id, old.application_status, new.application_status, v_actor, left(v_remarks, 500));
  end if;
  return new;
end;
$$;

create trigger permit_applications_record_status
  after insert or update on public.permit_applications
  for each row execute function public.record_application_status();

create or replace function public.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(coalesce(v_actor, new.owner_id), 'business.created', 'business', new.id,
      'Business profile created: ' || new.business_reference_number || '.');
  elsif new.record_status is distinct from old.record_status then
    perform public.write_audit_log(v_actor, 'business.status_changed', 'business', new.id,
      'Business profile ' || new.business_reference_number || ' record status changed from '
      || old.record_status || ' to ' || new.record_status || '.');
  else
    perform public.write_audit_log(v_actor, 'business.updated', 'business', new.id,
      'Business profile updated: ' || new.business_reference_number || '.');
  end if;
  return new;
end;
$$;

create trigger business_establishments_audit_change
  after insert or update on public.business_establishments
  for each row execute function public.audit_business_change();

create or replace function public.audit_application_draft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.write_audit_log((select auth.uid()), 'application.draft_deleted', 'permit_application', old.id,
    'Draft application deleted by its owner.');
  return old;
end;
$$;

create trigger permit_applications_audit_delete
  after delete on public.permit_applications
  for each row execute function public.audit_application_draft_delete();

create or replace function public.audit_permit_type_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(v_actor, 'permit_type.created', 'permit_type', new.id,
      'Permit type created: ' || new.application_code || '.');
  elsif new.is_active is distinct from old.is_active then
    perform public.write_audit_log(v_actor,
      case when new.is_active then 'permit_type.activated' else 'permit_type.deactivated' end,
      'permit_type', new.id,
      'Permit type ' || new.application_code || case when new.is_active then ' activated.' else ' deactivated.' end);
  else
    perform public.write_audit_log(v_actor, 'permit_type.updated', 'permit_type', new.id,
      'Permit type details updated: ' || new.application_code || '.');
  end if;
  return new;
end;
$$;

create trigger permit_types_audit_change
  after insert or update on public.permit_types
  for each row execute function public.audit_permit_type_change();

-- ---------------------------------------------------------------------------
-- RPCs (each re-checks the caller inside the database)
-- ---------------------------------------------------------------------------

-- Submit a draft. Assigns the PTY-YYYY-NNNNNN reference on the server, freezes a
-- snapshot of the applicant and business details, and records the status change.
create or replace function public.submit_permit_application(p_application uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_app public.permit_applications%rowtype;
  v_business public.business_establishments%rowtype;
  v_type public.permit_types%rowtype;
  v_applicant public.profiles%rowtype;
  v_reference text;
begin
  if v_actor is null or public.current_app_role() is distinct from 'applicant' then
    raise exception 'Only applicants can submit applications.' using errcode = '42501';
  end if;

  select * into v_app from public.permit_applications where id = p_application for update;
  -- Same message whether it does not exist or belongs to someone else.
  if not found or v_app.applicant_id <> v_actor then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if v_app.application_status <> 'draft' then
    raise exception 'Only draft applications can be submitted.';
  end if;

  select * into v_business from public.business_establishments where id = v_app.business_id;
  if not found or v_business.owner_id <> v_actor then
    raise exception 'The selected business profile is not yours.' using errcode = '42501';
  end if;
  if v_business.record_status = 'inactive' then
    raise exception 'The selected business profile is inactive.';
  end if;

  select * into v_type from public.permit_types where id = v_app.permit_type_id;
  if not found or not v_type.is_active then
    raise exception 'The selected application type is not available.';
  end if;

  if coalesce(btrim(v_app.business_name), '') = ''
     or coalesce(btrim(v_app.business_address), '') = ''
     or coalesce(btrim(v_app.nature_of_business), '') = ''
     or coalesce(btrim(v_app.business_category), '') = '' then
    raise exception 'Complete the business name, address, nature of business and category before submitting.';
  end if;

  select * into v_applicant from public.profiles where id = v_actor;

  v_reference := public.next_reference_number('PTY', public.manila_year());

  perform set_config('permitayo.status_remarks', 'Application submitted by the applicant.', true);

  update public.permit_applications
  set application_status = 'submitted',
      reference_number = v_reference,
      submitted_at = now(),
      submission_snapshot = jsonb_build_object(
        'applicant', jsonb_build_object(
          'full_name', v_applicant.full_name,
          'email', v_applicant.email,
          'phone_number', v_applicant.phone_number
        ),
        'permit_type', jsonb_build_object(
          'name', v_type.name,
          'application_code', v_type.application_code
        ),
        'business', to_jsonb(v_business) - 'owner_id'
      )
  where id = p_application;

  perform set_config('permitayo.status_remarks', '', true);

  perform public.write_audit_log(v_actor, 'application.submitted', 'permit_application', p_application,
    'Application submitted: ' || v_reference || '.');

  return v_reference;
end;
$$;

-- Cancel an application. The record is kept; status, timestamp, reason and the
-- cancelling user are recorded.
--   * The applicant who owns it may cancel a draft or a submitted application.
--   * BPLO personnel and administrators may cancel a submitted application, and
--     must give a reason.
create or replace function public.cancel_permit_application(p_application uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := public.current_app_role();
  v_app public.permit_applications%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_is_owner boolean;
  v_is_staff boolean;
begin
  if v_actor is null or v_role is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Reason must be 500 characters or fewer.' using errcode = '22023';
  end if;

  select * into v_app from public.permit_applications where id = p_application for update;
  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;

  v_is_owner := v_role = 'applicant' and v_app.applicant_id = v_actor;
  v_is_staff := v_role in ('bplo_personnel', 'administrator') and v_app.application_status <> 'draft';

  if not v_is_owner and not v_is_staff then
    -- Do not reveal whether another applicant's application exists.
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if v_app.application_status not in ('draft', 'submitted') then
    raise exception 'This application can no longer be cancelled.';
  end if;
  if v_is_staff and not v_is_owner and v_reason is null then
    raise exception 'Give a reason for cancelling this application.';
  end if;

  perform set_config('permitayo.status_remarks',
    coalesce(v_reason, case when v_is_owner then 'Cancelled by the applicant.' else 'Cancelled by authorized personnel.' end),
    true);

  update public.permit_applications
  set application_status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = v_reason
  where id = p_application;

  perform set_config('permitayo.status_remarks', '', true);

  perform public.write_audit_log(v_actor, 'application.cancelled', 'permit_application', p_application,
    'Application cancelled' || coalesce(': ' || v_app.reference_number, ' (draft)') || '.');
end;
$$;

-- BPLO personnel and administrators set a business profile's record status.
create or replace function public.set_business_record_status(p_business uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_app_role(array['bplo_personnel', 'administrator']) then
    raise exception 'Only BPLO personnel or administrators can change a business record status.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending_verification', 'active', 'inactive') then
    raise exception 'Invalid record status.' using errcode = '22023';
  end if;

  update public.business_establishments set record_status = p_status
  where id = p_business and record_status is distinct from p_status;

  if not found and not exists (select 1 from public.business_establishments where id = p_business) then
    raise exception 'Business profile not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
revoke all on public.reference_counters from public, anon, authenticated;
revoke all on public.permit_types from public, anon, authenticated;
revoke all on public.business_establishments from public, anon, authenticated;
revoke all on public.permit_applications from public, anon, authenticated;
revoke all on public.application_status_history from public, anon, authenticated;

grant select, insert, update on public.permit_types to authenticated;

grant select on public.business_establishments to authenticated;
-- owner_id, business_reference_number, record_status and timestamps are not writable.
grant insert (
  registered_business_name, trade_name, business_description, business_type, ownership_type,
  business_category, business_email, business_contact_number, province, municipality, barangay,
  street_address, zip_code, owner_full_name, owner_email, owner_contact_number, nature_of_business,
  employee_count, estimated_capital, establishment_status, date_established
) on public.business_establishments to authenticated;
grant update (
  registered_business_name, trade_name, business_description, business_type, ownership_type,
  business_category, business_email, business_contact_number, province, municipality, barangay,
  street_address, zip_code, owner_full_name, owner_email, owner_contact_number, nature_of_business,
  employee_count, estimated_capital, establishment_status, date_established
) on public.business_establishments to authenticated;

grant select, delete on public.permit_applications to authenticated;
-- applicant_id, status, reference number, snapshot and timestamps are not writable.
grant insert (business_id, permit_type_id, business_name, business_address, nature_of_business, business_category, applicant_remarks)
  on public.permit_applications to authenticated;
grant update (business_id, permit_type_id, business_name, business_address, nature_of_business, business_category, applicant_remarks)
  on public.permit_applications to authenticated;

grant select on public.application_status_history to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.next_reference_number(text, integer) from public, anon, authenticated;
revoke all on function public.manila_year() from public, anon, authenticated;
revoke all on function public.assign_business_reference() from public, anon, authenticated;
revoke all on function public.guard_business_protected_columns() from public, anon, authenticated;
revoke all on function public.guard_application_insert() from public, anon, authenticated;
revoke all on function public.guard_application_update() from public, anon, authenticated;
revoke all on function public.guard_application_delete() from public, anon, authenticated;
revoke all on function public.guard_status_history_update() from public, anon, authenticated;
revoke all on function public.record_application_status() from public, anon, authenticated;
revoke all on function public.audit_business_change() from public, anon, authenticated;
revoke all on function public.audit_application_draft_delete() from public, anon, authenticated;
revoke all on function public.audit_permit_type_change() from public, anon, authenticated;
revoke all on function public.submit_permit_application(uuid) from public, anon, authenticated;
revoke all on function public.cancel_permit_application(uuid, text) from public, anon, authenticated;
revoke all on function public.set_business_record_status(uuid, text) from public, anon, authenticated;

-- Callable RPCs (each re-checks the caller inside).
grant execute on function public.submit_permit_application(uuid) to authenticated;
grant execute on function public.cancel_permit_application(uuid, text) to authenticated;
grant execute on function public.set_business_record_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.reference_counters enable row level security; -- no policies: no API access
alter table public.permit_types enable row level security;
alter table public.business_establishments enable row level security;
alter table public.permit_applications enable row level security;
alter table public.application_status_history enable row level security;

-- permit_types ----------------------------------------------------------------
-- Any active account can read active types; staff and administrators see all.
create policy permit_types_select
  on public.permit_types for select to authenticated
  using (
    (is_active and (select public.current_app_role()) is not null)
    or (select public.has_app_role(array['bplo_personnel', 'administrator']))
  );

create policy permit_types_insert_admin
  on public.permit_types for insert to authenticated
  with check ((select public.is_admin()));

create policy permit_types_update_admin
  on public.permit_types for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- business_establishments ---------------------------------------------------
create policy business_select_own
  on public.business_establishments for select to authenticated
  using (owner_id = (select auth.uid()));

create policy business_select_staff
  on public.business_establishments for select to authenticated
  using ((select public.has_app_role(array['bplo_personnel', 'administrator'])));

create policy business_insert_own
  on public.business_establishments for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.current_app_role()) = 'applicant'
  );

create policy business_update_own
  on public.business_establishments for update to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.current_app_role()) = 'applicant'
    and record_status <> 'inactive'
  )
  with check (owner_id = (select auth.uid()));

-- permit_applications -------------------------------------------------------
create policy applications_select_own
  on public.permit_applications for select to authenticated
  using (applicant_id = (select auth.uid()));

-- Drafts stay private to the applicant until they are submitted.
create policy applications_select_staff
  on public.permit_applications for select to authenticated
  using (
    application_status <> 'draft'
    and (select public.has_app_role(array['bplo_personnel', 'administrator']))
  );

create policy applications_insert_own
  on public.permit_applications for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and application_status = 'draft'
    and (select public.current_app_role()) = 'applicant'
    and exists (
      select 1 from public.business_establishments b
      where b.id = business_id and b.owner_id = (select auth.uid()) and b.record_status <> 'inactive'
    )
    and exists (select 1 from public.permit_types t where t.id = permit_type_id and t.is_active)
  );

create policy applications_update_own_draft
  on public.permit_applications for update to authenticated
  using (
    applicant_id = (select auth.uid())
    and application_status = 'draft'
    and (select public.current_app_role()) = 'applicant'
  )
  with check (
    applicant_id = (select auth.uid())
    and application_status = 'draft'
    and exists (
      select 1 from public.business_establishments b
      where b.id = business_id and b.owner_id = (select auth.uid()) and b.record_status <> 'inactive'
    )
    and exists (select 1 from public.permit_types t where t.id = permit_type_id and t.is_active)
  );

create policy applications_delete_own_draft
  on public.permit_applications for delete to authenticated
  using (
    applicant_id = (select auth.uid())
    and application_status = 'draft'
    and (select public.current_app_role()) = 'applicant'
  );

-- application_status_history -------------------------------------------------
-- Visible exactly when the parent application is visible to the caller
-- (the subquery runs under the caller's own RLS on permit_applications).
create policy status_history_select
  on public.application_status_history for select to authenticated
  using (exists (select 1 from public.permit_applications a where a.id = application_id));
