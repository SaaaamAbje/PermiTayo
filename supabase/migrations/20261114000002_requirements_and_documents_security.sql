-- Permitayo, Phase 4: security for requirements and documents.
--
--   * permit_requirements: written by BPLO personnel and administrators under RLS;
--     created_by / updated_by are set by a trigger, never by the client; every
--     change is audited.
--   * application_documents and document_review_history: NO insert/update grants.
--     Rows are written only by register_application_document() and
--     review_application_document(), which re-check the caller with auth.uid().
--   * Storage ('permit-documents', private): an applicant can create an object
--     only at {own id}/{own application}/{requirement}/{uuid}.{pdf|jpg|png} and
--     only when that upload is currently allowed. BPLO personnel can read objects
--     that belong to submitted applications. Nobody can update objects; an
--     applicant can delete only their own objects that were never registered
--     (cleanup after a failed upload).

-- ---------------------------------------------------------------------------
-- permit_requirements: guard + audit
-- ---------------------------------------------------------------------------
create or replace function public.guard_permit_requirement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.created_by := (select auth.uid());
      new.updated_by := (select auth.uid());
      new.conditions := '{}'::jsonb;
    else
      if new.permit_type_id is distinct from old.permit_type_id
         or new.created_by is distinct from old.created_by
         or new.created_at is distinct from old.created_at
         or new.conditions is distinct from old.conditions then
        raise exception 'This requirement field cannot be changed.' using errcode = '42501';
      end if;
      new.updated_by := (select auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger permit_requirements_guard
  before insert or update on public.permit_requirements
  for each row execute function public.guard_permit_requirement();

create or replace function public.audit_permit_requirement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(v_actor, 'requirement.created', 'permit_requirement', new.id,
      'Requirement created: ' || new.name || '.');
  elsif new.is_active is distinct from old.is_active then
    perform public.write_audit_log(v_actor,
      case when new.is_active then 'requirement.activated' else 'requirement.deactivated' end,
      'permit_requirement', new.id,
      'Requirement ' || case when new.is_active then 'activated' else 'deactivated' end || ': ' || new.name || '.');
  else
    perform public.write_audit_log(v_actor, 'requirement.updated', 'permit_requirement', new.id,
      'Requirement updated: ' || new.name || '.');
  end if;
  return new;
end;
$$;

create trigger permit_requirements_audit_change
  after insert or update on public.permit_requirements
  for each row execute function public.audit_permit_requirement_change();

-- Review history is append-only for everyone.
create or replace function public.guard_document_review_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Document review history cannot be changed.' using errcode = '42501';
end;
$$;

create trigger document_review_history_append_only
  before update or delete on public.document_review_history
  for each row execute function public.guard_document_review_history();

-- ---------------------------------------------------------------------------
-- Upload eligibility (shared by the storage policy and the register function)
--   draft application      -> upload or replace any active requirement
--   submitted application  -> upload a requirement that has no document yet,
--                             or replace one marked needs_resubmission
--   cancelled application  -> nothing
-- ---------------------------------------------------------------------------
create or replace function public.document_upload_allowed(p_application uuid, p_requirement uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      a.application_status in ('draft', 'submitted')
      and (
        a.application_status = 'draft'
        or not exists (
          select 1 from public.application_documents d
          where d.application_id = a.id and d.requirement_id = r.id and d.is_current
        )
        or exists (
          select 1 from public.application_documents d
          where d.application_id = a.id and d.requirement_id = r.id and d.is_current
            and d.document_status = 'needs_resubmission'
        )
      )
    from public.permit_applications a
    join public.permit_requirements r on r.permit_type_id = a.permit_type_id and r.id = p_requirement and r.is_active
    where a.id = p_application
      and a.applicant_id = (select auth.uid())
      and public.current_app_role() = 'applicant'
  ), false)
$$;

-- Storage object name -> may the caller create it?
create or replace function public.storage_document_upload_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
begin
  if p_name is null
     or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$' then
    return false;
  end if;
  v_parts := string_to_array(p_name, '/');
  if v_parts[1] <> (select auth.uid())::text then
    return false;
  end if;
  return public.document_upload_allowed(v_parts[2]::uuid, v_parts[3]::uuid);
end;
$$;

create or replace function public.document_object_registered(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.application_documents d where d.storage_path = p_name)
$$;

-- BPLO personnel may read files of non-draft applications.
create or replace function public.staff_can_read_document_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_app_role() = 'bplo_personnel'
    and exists (
      select 1
      from public.application_documents d
      join public.permit_applications a on a.id = d.application_id
      where d.storage_path = p_name and a.application_status <> 'draft'
    )
$$;

-- ---------------------------------------------------------------------------
-- register_application_document: record an object the applicant uploaded.
-- Size and type are read from Storage's own metadata, not from the client.
-- ---------------------------------------------------------------------------
create or replace function public.register_application_document(
  p_application uuid,
  p_requirement uuid,
  p_storage_path text,
  p_original_filename text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_app public.permit_applications%rowtype;
  v_req public.permit_requirements%rowtype;
  v_current public.application_documents%rowtype;
  v_size bigint;
  v_mime text;
  v_name text := btrim(coalesce(p_original_filename, ''));
  v_version integer;
  v_id uuid;
  v_ext text;
begin
  if v_actor is null or public.current_app_role() is distinct from 'applicant' then
    raise exception 'Only applicants can upload documents.' using errcode = '42501';
  end if;

  select * into v_app from public.permit_applications where id = p_application for update;
  if not found or v_app.applicant_id <> v_actor then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;

  select * into v_req from public.permit_requirements where id = p_requirement;
  if not found or v_req.permit_type_id <> v_app.permit_type_id or not v_req.is_active then
    raise exception 'That requirement does not apply to this application.';
  end if;

  if not public.document_upload_allowed(p_application, p_requirement) then
    if v_app.application_status = 'cancelled' then
      raise exception 'This application was cancelled, so documents can no longer be uploaded.';
    end if;
    raise exception 'This document cannot be replaced now. After submission, you can only replace documents the BPLO marked as needing resubmission.';
  end if;

  -- The object must sit in this applicant/application/requirement folder.
  if p_storage_path is null
     or split_part(p_storage_path, '/', 1) <> v_actor::text
     or split_part(p_storage_path, '/', 2) <> p_application::text
     or split_part(p_storage_path, '/', 3) <> p_requirement::text then
    raise exception 'Invalid upload location.' using errcode = '42501';
  end if;

  select (o.metadata ->> 'size')::bigint, lower(o.metadata ->> 'mimetype')
  into v_size, v_mime
  from storage.objects o
  where o.bucket_id = 'permit-documents' and o.name = p_storage_path;
  if not found then
    raise exception 'The uploaded file was not found. Please upload it again.';
  end if;
  if v_mime = 'image/jpg' then v_mime := 'image/jpeg'; end if;

  v_ext := lower(substring(p_storage_path from '\.([a-z]+)$'));
  if v_mime is null or not (v_mime = any (v_req.accepted_file_types))
     or (v_ext = 'pdf' and v_mime <> 'application/pdf')
     or (v_ext = 'jpg' and v_mime <> 'image/jpeg')
     or (v_ext = 'png' and v_mime <> 'image/png') then
    raise exception 'That file type is not accepted for this requirement.';
  end if;
  if v_size is null or v_size < 1 then
    raise exception 'The uploaded file is empty.';
  end if;
  if v_size > v_req.max_file_size then
    raise exception 'The file is larger than the % MB limit for this requirement.', round(v_req.max_file_size / 1048576.0, 1);
  end if;

  if public.document_object_registered(p_storage_path) then
    raise exception 'This file was already recorded.';
  end if;

  -- Keep a safe display name only (no path separators or control characters).
  v_name := regexp_replace(v_name, '[[:cntrl:]/\\]', '_', 'g');
  if v_name = '' then v_name := 'document'; end if;
  v_name := left(v_name, 255);

  select * into v_current from public.application_documents
  where application_id = p_application and requirement_id = p_requirement and is_current
  for update;

  select coalesce(max(submission_version), 0) + 1 into v_version
  from public.application_documents
  where application_id = p_application and requirement_id = p_requirement;

  if v_current.id is not null then
    update public.application_documents set is_current = false where id = v_current.id;
  end if;

  insert into public.application_documents (
    application_id, requirement_id, applicant_id, original_filename, storage_path,
    mime_type, file_size, submission_version, is_current, document_status
  )
  values (
    p_application, p_requirement, v_actor, v_name, p_storage_path,
    v_mime, v_size::integer, v_version, true, 'uploaded'
  )
  returning id into v_id;

  perform public.write_audit_log(v_actor,
    case when v_current.id is null then 'document.uploaded' else 'document.replaced' end,
    'application_document', v_id,
    case when v_current.id is null
      then 'Document uploaded for requirement "' || v_req.name || '" (version ' || v_version || ').'
      else 'Document replaced for requirement "' || v_req.name || '" (version ' || v_version || ').'
    end);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- review_application_document: manual review by BPLO personnel only.
-- ---------------------------------------------------------------------------
create or replace function public.review_application_document(
  p_document uuid,
  p_status text,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_doc public.application_documents%rowtype;
  v_app_status text;
  v_req_name text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_actor is null or public.current_app_role() is distinct from 'bplo_personnel' then
    raise exception 'Only BPLO personnel can review documents.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('under_review', 'accepted', 'needs_resubmission') then
    raise exception 'Invalid review status.' using errcode = '22023';
  end if;
  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'Comments must be 1,000 characters or fewer.' using errcode = '22023';
  end if;
  if p_status = 'needs_resubmission' and v_comment is null then
    raise exception 'Explain what the applicant needs to fix before asking for a resubmission.';
  end if;

  select * into v_doc from public.application_documents where id = p_document for update;
  if not found then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;
  select a.application_status into v_app_status from public.permit_applications a where a.id = v_doc.application_id;
  if v_app_status is distinct from 'submitted' then
    -- Drafts are private; cancelled applications are closed.
    raise exception 'Only documents of submitted applications can be reviewed.';
  end if;
  if not v_doc.is_current then
    raise exception 'This is an older version. Review the current document instead.';
  end if;
  if v_doc.document_status = p_status and v_comment is null then
    raise exception 'The document already has that status.';
  end if;

  update public.application_documents
  set document_status = p_status,
      review_comment = v_comment,
      last_reviewed_by = v_actor,
      last_reviewed_at = now()
  where id = p_document;

  insert into public.document_review_history (application_document_id, reviewed_by, previous_status, new_status, review_comment)
  values (p_document, v_actor, v_doc.document_status, p_status, v_comment);

  select name into v_req_name from public.permit_requirements where id = v_doc.requirement_id;
  perform public.write_audit_log(v_actor,
    case p_status
      when 'needs_resubmission' then 'document.resubmission_requested'
      when 'accepted' then 'document.accepted'
      else 'document.review_started'
    end,
    'application_document', p_document,
    'Document for requirement "' || coalesce(v_req_name, 'unknown') || '" (version ' || v_doc.submission_version
      || ') marked ' || replace(p_status, '_', ' ') || '.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
revoke all on public.permit_requirements from public, anon, authenticated;
revoke all on public.application_documents from public, anon, authenticated;
revoke all on public.document_review_history from public, anon, authenticated;

grant select on public.permit_requirements to authenticated;
grant insert (permit_type_id, name, description, applicant_instructions, is_required, accepted_file_types, max_file_size, display_order, is_active)
  on public.permit_requirements to authenticated;
grant update (name, description, applicant_instructions, is_required, accepted_file_types, max_file_size, display_order, is_active)
  on public.permit_requirements to authenticated;

grant select on public.application_documents to authenticated;
grant select on public.document_review_history to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.allowed_document_mime_types() from public, anon, authenticated;
revoke all on function public.guard_permit_requirement() from public, anon, authenticated;
revoke all on function public.audit_permit_requirement_change() from public, anon, authenticated;
revoke all on function public.guard_document_review_history() from public, anon, authenticated;
revoke all on function public.document_upload_allowed(uuid, uuid) from public, anon, authenticated;
revoke all on function public.storage_document_upload_allowed(text) from public, anon, authenticated;
revoke all on function public.document_object_registered(text) from public, anon, authenticated;
revoke all on function public.staff_can_read_document_object(text) from public, anon, authenticated;
revoke all on function public.register_application_document(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_application_document(uuid, text, text) from public, anon, authenticated;

-- Used by CHECK constraints and policies evaluated for signed-in users.
grant execute on function public.allowed_document_mime_types() to authenticated;
grant execute on function public.document_upload_allowed(uuid, uuid) to authenticated;
grant execute on function public.storage_document_upload_allowed(text) to authenticated;
grant execute on function public.document_object_registered(text) to authenticated;
grant execute on function public.staff_can_read_document_object(text) to authenticated;
-- Callable RPCs (each re-checks the caller inside).
grant execute on function public.register_application_document(uuid, uuid, text, text) to authenticated;
grant execute on function public.review_application_document(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.permit_requirements enable row level security;
alter table public.application_documents enable row level security;
alter table public.document_review_history enable row level security;

-- permit_requirements -------------------------------------------------------
create policy permit_requirements_select_staff
  on public.permit_requirements for select to authenticated
  using ((select public.has_app_role(array['bplo_personnel', 'administrator'])));

-- Applicants: active requirements of permit types they have applications for,
-- plus any requirement they have already uploaded a document for.
create policy permit_requirements_select_applicant
  on public.permit_requirements for select to authenticated
  using (
    (select public.current_app_role()) = 'applicant'
    and (
      (is_active and exists (
        select 1 from public.permit_applications a
        where a.permit_type_id = permit_requirements.permit_type_id and a.applicant_id = (select auth.uid())
      ))
      or exists (
        select 1 from public.application_documents d
        where d.requirement_id = permit_requirements.id and d.applicant_id = (select auth.uid())
      )
    )
  );

create policy permit_requirements_insert_staff
  on public.permit_requirements for insert to authenticated
  with check ((select public.has_app_role(array['bplo_personnel', 'administrator'])));

create policy permit_requirements_update_staff
  on public.permit_requirements for update to authenticated
  using ((select public.has_app_role(array['bplo_personnel', 'administrator'])))
  with check ((select public.has_app_role(array['bplo_personnel', 'administrator'])));

-- application_documents -----------------------------------------------------
create policy application_documents_select_own
  on public.application_documents for select to authenticated
  using (applicant_id = (select auth.uid()));

create policy application_documents_select_bplo
  on public.application_documents for select to authenticated
  using (
    (select public.current_app_role()) = 'bplo_personnel'
    and exists (
      select 1 from public.permit_applications a
      where a.id = application_documents.application_id and a.application_status <> 'draft'
    )
  );

-- document_review_history ---------------------------------------------------
create policy document_review_history_select
  on public.document_review_history for select to authenticated
  using (exists (
    select 1 from public.application_documents d where d.id = document_review_history.application_document_id
  ));

-- ---------------------------------------------------------------------------
-- Storage policies for the existing private 'permit-documents' bucket.
-- Replaces the broad Phase 2 insert policy (any file in the applicant's folder).
-- ---------------------------------------------------------------------------
drop policy if exists "Applicants upload to own folder" on storage.objects;

create policy "Applicants upload allowed application documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'permit-documents'
    and (select public.storage_document_upload_allowed(name))
  );

-- "Applicants read own folder" (Phase 2) stays as is.

create policy "BPLO personnel read submitted application documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'permit-documents'
    and (select public.staff_can_read_document_object(name))
  );

create policy "Applicants remove unregistered uploads"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'permit-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.current_app_role()) = 'applicant'
    and not (select public.document_object_registered(name))
  );
