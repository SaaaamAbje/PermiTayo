-- Permitayo, Phase 5: AI-assisted document verification.
--
-- Advisory only. A verification result never changes application_documents.document_status:
-- the official decision stays with BPLO personnel through review_application_document() (Phase 4).
--
-- Flow
--   1. A new document version is uploaded -> a 'queued' verification is created by trigger.
--   2. BPLO personnel run the check from the review page (their own session reads the file
--      under existing Storage RLS; the app holds no service-role key). start_ -> complete_/fail_.
--   3. Re-running creates a NEW attempt; earlier attempts (including failures) are kept.
--
-- Tables: document_verification_results, document_extracted_text (sensitive, BPLO only).
-- No separate history table: every attempt is its own row, and events go to audit_logs.

-- ---------------------------------------------------------------------------
-- document_verification_results
-- ---------------------------------------------------------------------------
create table public.document_verification_results (
  id uuid primary key default gen_random_uuid(),
  application_document_id uuid not null references public.application_documents (id) on delete restrict,
  attempt_number integer not null
    constraint verification_attempt_positive check (attempt_number >= 1),
  processing_status text not null default 'queued'
    constraint verification_processing_status_allowed check (processing_status in ('queued', 'processing', 'completed', 'failed')),
  overall_result text
    constraint verification_overall_result_allowed check (
      overall_result is null or overall_result in ('passed', 'needs_review', 'failed', 'inconclusive')
    ),
  detected_document_type text
    constraint verification_detected_type_length check (detected_document_type is null or char_length(detected_document_type) <= 200),
  expected_document_type text
    constraint verification_expected_type_length check (expected_document_type is null or char_length(expected_document_type) <= 200),
  classification_match boolean,
  confidence_score numeric(4, 3)
    constraint verification_confidence_range check (confidence_score is null or confidence_score between 0 and 1),
  extracted_fields jsonb not null default '[]'::jsonb
    constraint verification_fields_array check (jsonb_typeof(extracted_fields) = 'array'),
  findings jsonb not null default '[]'::jsonb
    constraint verification_findings_array check (jsonb_typeof(findings) = 'array'),
  quality jsonb not null default '{}'::jsonb
    constraint verification_quality_object check (jsonb_typeof(quality) = 'object'),
  summary text
    constraint verification_summary_length check (summary is null or char_length(summary) <= 2000),
  extraction_method text
    constraint verification_extraction_method_allowed check (
      extraction_method is null or extraction_method in ('pdf_text', 'ocr', 'pdf_text_and_ocr', 'none')
    ),
  page_count integer
    constraint verification_page_count_range check (page_count is null or page_count between 0 and 10000),
  ai_provider text
    constraint verification_provider_length check (ai_provider is null or char_length(ai_provider) <= 60),
  ai_model text
    constraint verification_model_length check (ai_model is null or char_length(ai_model) <= 100),
  error_code text
    constraint verification_error_code_format check (error_code is null or error_code ~ '^[a-z_]{2,40}$'),
  error_message text
    constraint verification_error_message_length check (error_message is null or char_length(error_message) <= 500),
  -- NULL means queued automatically on upload.
  requested_by uuid references public.profiles (id) on delete set null,
  processed_by uuid references public.profiles (id) on delete set null,
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_attempt_key unique (application_document_id, attempt_number),
  constraint verification_completed_has_result check (processing_status <> 'completed' or overall_result is not null),
  constraint verification_failed_has_error check (processing_status <> 'failed' or error_code is not null)
);

-- At most one queued or running attempt per document version (no duplicate processing).
create unique index verification_one_active_idx
  on public.document_verification_results (application_document_id)
  where processing_status in ('queued', 'processing');
create index verification_document_idx on public.document_verification_results (application_document_id, attempt_number desc);
create index verification_status_idx on public.document_verification_results (processing_status, created_at);

create trigger document_verification_results_set_updated_at
  before update on public.document_verification_results
  for each row execute function public.set_updated_at();

comment on table public.document_verification_results is
  'Advisory OCR/AI verification attempts per document version. Never an official acceptance or rejection.';

-- ---------------------------------------------------------------------------
-- document_extracted_text: raw extracted text (sensitive). BPLO personnel only.
-- ---------------------------------------------------------------------------
create table public.document_extracted_text (
  verification_result_id uuid primary key references public.document_verification_results (id) on delete restrict,
  -- [{ "page": 1, "text": "...", "source": "pdf_text" | "ocr" }]
  pages jsonb not null default '[]'::jsonb
    constraint extracted_text_pages_array check (jsonb_typeof(pages) = 'array'),
  character_count integer not null default 0
    constraint extracted_text_count_range check (character_count >= 0),
  created_at timestamptz not null default now()
);

comment on table public.document_extracted_text is
  'Text extracted from uploaded documents. Sensitive: readable only by BPLO personnel; never shown to applicants.';

-- ---------------------------------------------------------------------------
-- Queue a check automatically for every new document version.
-- ---------------------------------------------------------------------------
create or replace function public.queue_verification_on_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.document_verification_results (application_document_id, attempt_number, processing_status)
  values (new.id, 1, 'queued');
  return new;
end;
$$;

create trigger application_documents_queue_verification
  after insert on public.application_documents
  for each row execute function public.queue_verification_on_upload();

-- Queue an attempt for every document that already existed before Phase 5.
insert into public.document_verification_results (application_document_id, attempt_number, processing_status)
select d.id, 1, 'queued'
from public.application_documents d
where not exists (select 1 from public.document_verification_results v where v.application_document_id = d.id);

-- ---------------------------------------------------------------------------
-- Helper: may the caller process this document? (BPLO, document of a submitted application)
-- ---------------------------------------------------------------------------
create or replace function public.verification_document_context(p_document uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.application_status
  from public.application_documents d
  join public.permit_applications a on a.id = d.application_id
  where d.id = p_document
$$;

-- Request a (re)check. Returns the queued or running attempt; never creates a duplicate.
create or replace function public.request_document_verification(p_document uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_status text;
  v_active public.document_verification_results%rowtype;
  v_attempt integer;
  v_id uuid;
begin
  if v_actor is null or public.current_app_role() is distinct from 'bplo_personnel' then
    raise exception 'Only BPLO personnel can run document checks.' using errcode = '42501';
  end if;
  v_status := public.verification_document_context(p_document);
  if v_status is null then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;
  if v_status <> 'submitted' then
    raise exception 'Only documents of submitted applications can be checked.';
  end if;

  perform 1 from public.application_documents where id = p_document for update;

  select * into v_active from public.document_verification_results
  where application_document_id = p_document and processing_status in ('queued', 'processing');
  if found then
    return v_active.id;
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt
  from public.document_verification_results where application_document_id = p_document;

  insert into public.document_verification_results (application_document_id, attempt_number, processing_status, requested_by)
  values (p_document, v_attempt, 'queued', v_actor)
  returning id into v_id;

  perform public.write_audit_log(v_actor, 'verification.requested', 'application_document', p_document,
    'Automated document check requested (attempt ' || v_attempt || ').');
  return v_id;
end;
$$;

-- Claim a queued attempt. A 'processing' attempt older than 10 minutes is treated as
-- abandoned (the request that ran it ended) and may be claimed again.
create or replace function public.start_document_verification(p_verification uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row public.document_verification_results%rowtype;
  v_status text;
begin
  if v_actor is null or public.current_app_role() is distinct from 'bplo_personnel' then
    raise exception 'Only BPLO personnel can run document checks.' using errcode = '42501';
  end if;
  select * into v_row from public.document_verification_results where id = p_verification for update;
  if not found then
    raise exception 'Check not found.' using errcode = 'P0002';
  end if;
  v_status := public.verification_document_context(v_row.application_document_id);
  if v_status is distinct from 'submitted' then
    raise exception 'Only documents of submitted applications can be checked.';
  end if;
  if v_row.processing_status = 'processing' and v_row.processing_started_at > now() - interval '10 minutes' then
    raise exception 'This document is already being checked.';
  end if;
  if v_row.processing_status in ('completed', 'failed') then
    raise exception 'This check has finished. Request a new check to run it again.';
  end if;

  update public.document_verification_results
  set processing_status = 'processing', processing_started_at = now(), processed_by = v_actor,
      error_code = null, error_message = null
  where id = p_verification;
end;
$$;

-- Store a finished check. Shape is validated again here; values were validated by the app (Zod).
create or replace function public.complete_document_verification(
  p_verification uuid,
  p_result jsonb,
  p_pages jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row public.document_verification_results%rowtype;
  v_chars integer;
begin
  if v_actor is null or public.current_app_role() is distinct from 'bplo_personnel' then
    raise exception 'Only BPLO personnel can run document checks.' using errcode = '42501';
  end if;
  select * into v_row from public.document_verification_results where id = p_verification for update;
  if not found or v_row.processing_status <> 'processing' or v_row.processed_by is distinct from v_actor then
    raise exception 'This check is not running.' using errcode = 'P0002';
  end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or (p_result ->> 'overall_result') not in ('passed', 'needs_review', 'failed', 'inconclusive')
     or jsonb_typeof(coalesce(p_result -> 'findings', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_result -> 'extracted_fields', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_pages, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid verification result.' using errcode = '22023';
  end if;

  update public.document_verification_results
  set processing_status = 'completed',
      overall_result = p_result ->> 'overall_result',
      detected_document_type = left(p_result ->> 'detected_document_type', 200),
      expected_document_type = left(p_result ->> 'expected_document_type', 200),
      classification_match = (p_result ->> 'classification_match')::boolean,
      confidence_score = (p_result ->> 'confidence_score')::numeric,
      extracted_fields = coalesce(p_result -> 'extracted_fields', '[]'::jsonb),
      findings = coalesce(p_result -> 'findings', '[]'::jsonb),
      quality = coalesce(p_result -> 'quality', '{}'::jsonb),
      summary = left(p_result ->> 'summary', 2000),
      extraction_method = p_result ->> 'extraction_method',
      page_count = (p_result ->> 'page_count')::integer,
      ai_provider = left(p_result ->> 'ai_provider', 60),
      ai_model = left(p_result ->> 'ai_model', 100),
      processed_at = now()
  where id = p_verification;

  select coalesce(sum(char_length(coalesce(e ->> 'text', ''))), 0)::integer into v_chars
  from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) e;

  insert into public.document_extracted_text (verification_result_id, pages, character_count)
  values (p_verification, coalesce(p_pages, '[]'::jsonb), v_chars);

  perform public.write_audit_log(v_actor, 'verification.completed', 'application_document', v_row.application_document_id,
    'Automated document check completed (attempt ' || v_row.attempt_number || '): '
      || replace(p_result ->> 'overall_result', '_', ' ') || '. Advisory only.');
end;
$$;

-- Record a processing failure (provider error, timeout, invalid AI output). Kept for troubleshooting.
create or replace function public.fail_document_verification(p_verification uuid, p_error_code text, p_error_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row public.document_verification_results%rowtype;
begin
  if v_actor is null or public.current_app_role() is distinct from 'bplo_personnel' then
    raise exception 'Only BPLO personnel can run document checks.' using errcode = '42501';
  end if;
  select * into v_row from public.document_verification_results where id = p_verification for update;
  if not found or v_row.processing_status <> 'processing' or v_row.processed_by is distinct from v_actor then
    raise exception 'This check is not running.' using errcode = 'P0002';
  end if;
  if p_error_code is null or p_error_code !~ '^[a-z_]{2,40}$' then
    raise exception 'Invalid error code.' using errcode = '22023';
  end if;

  update public.document_verification_results
  set processing_status = 'failed', error_code = p_error_code, error_message = left(p_error_message, 500), processed_at = now()
  where id = p_verification;

  perform public.write_audit_log(v_actor, 'verification.failed', 'application_document', v_row.application_document_id,
    'Automated document check failed (attempt ' || v_row.attempt_number || '): ' || p_error_code || '.');
end;
$$;

-- Applicants: simplified processing status of the latest attempt for each of their documents.
-- No results, findings, text or reviewer data are returned.
create or replace function public.applicant_document_checks(p_application uuid)
returns table (application_document_id uuid, processing_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (v.application_document_id) v.application_document_id, v.processing_status
  from public.document_verification_results v
  join public.application_documents d on d.id = v.application_document_id
  where d.application_id = p_application
    and d.applicant_id = (select auth.uid())
    and public.current_app_role() = 'applicant'
  order by v.application_document_id, v.attempt_number desc
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.document_verification_results from public, anon, authenticated;
revoke all on public.document_extracted_text from public, anon, authenticated;
grant select on public.document_verification_results to authenticated;
grant select on public.document_extracted_text to authenticated;

revoke all on function public.queue_verification_on_upload() from public, anon, authenticated;
revoke all on function public.verification_document_context(uuid) from public, anon, authenticated;
revoke all on function public.request_document_verification(uuid) from public, anon, authenticated;
revoke all on function public.start_document_verification(uuid) from public, anon, authenticated;
revoke all on function public.complete_document_verification(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_document_verification(uuid, text, text) from public, anon, authenticated;
revoke all on function public.applicant_document_checks(uuid) from public, anon, authenticated;

grant execute on function public.request_document_verification(uuid) to authenticated;
grant execute on function public.start_document_verification(uuid) to authenticated;
grant execute on function public.complete_document_verification(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.fail_document_verification(uuid, text, text) to authenticated;
grant execute on function public.applicant_document_checks(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: detailed results and text are for BPLO personnel only,
-- and only for non-draft applications.
-- ---------------------------------------------------------------------------
alter table public.document_verification_results enable row level security;
alter table public.document_extracted_text enable row level security;

create policy verification_results_select_bplo
  on public.document_verification_results for select to authenticated
  using (
    (select public.current_app_role()) = 'bplo_personnel'
    and exists (
      select 1 from public.application_documents d
      join public.permit_applications a on a.id = d.application_id
      where d.id = document_verification_results.application_document_id and a.application_status <> 'draft'
    )
  );

create policy extracted_text_select_bplo
  on public.document_extracted_text for select to authenticated
  using (
    (select public.current_app_role()) = 'bplo_personnel'
    and exists (select 1 from public.document_verification_results v where v.id = document_extracted_text.verification_result_id)
  );
