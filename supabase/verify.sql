-- Permitayo: run this AFTER setup-all.sql (or after phase3-upgrade.sql). Every row's "result" should equal "expected".
select 'tables created' as check, count(*)::text as result, '4' as expected
  from information_schema.tables
  where table_schema = 'public' and table_name in ('profiles', 'departments', 'department_members', 'audit_logs')
union all
select 'tables with row level security on', count(*)::text, '4'
  from pg_tables
  where schemaname = 'public' and rowsecurity and tablename in ('profiles', 'departments', 'department_members', 'audit_logs')
union all
select 'proposed departments seeded', count(*)::text, '6' from public.departments
union all
select 'signup trigger present', count(*)::text, '1'
  from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
union all
select 'administrator functions present', count(*)::text, '4'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('admin_set_user_role', 'admin_set_account_status', 'admin_assign_department', 'admin_remove_department_assignment')
union all
select 'private documents bucket', count(*)::text, '1'
  from storage.buckets where id = 'permit-documents' and public = false
union all
select 'phase 3 tables created', count(*)::text, '5'
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('reference_counters', 'permit_types', 'business_establishments', 'permit_applications', 'application_status_history')
union all
select 'phase 3 tables with row level security on', count(*)::text, '5'
  from pg_tables
  where schemaname = 'public' and rowsecurity
    and tablename in ('reference_counters', 'permit_types', 'business_establishments', 'permit_applications', 'application_status_history')
union all
select 'permit types seeded', count(*)::text, '3'
  from public.permit_types where application_code in ('NEW', 'RENEWAL', 'AMENDMENT')
union all
select 'application functions present', count(*)::text, '4'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('submit_permit_application', 'cancel_permit_application', 'set_business_record_status', 'next_reference_number')
union all
select 'application guard and history triggers present', count(*)::text, '5'
  from pg_trigger
  where not tgisinternal
    and tgname in ('permit_applications_guard_insert', 'permit_applications_guard_update', 'permit_applications_guard_delete',
                   'permit_applications_record_status', 'business_establishments_guard_protected_columns')
union all
select 'phase 4 tables with row level security on', count(*)::text, '3'
  from pg_tables
  where schemaname = 'public' and rowsecurity
    and tablename in ('permit_requirements', 'application_documents', 'document_review_history')
union all
select 'document functions present', count(*)::text, '3'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('register_application_document', 'review_application_document', 'document_upload_allowed')
union all
select 'sample requirements seeded (inactive)', count(*)::text, '6'
  from public.permit_requirements where name like 'Sample:%' and not is_active
union all
select 'document storage policies present', count(*)::text, '4'
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('Applicants upload allowed application documents', 'Applicants read own folder',
                       'BPLO personnel read submitted application documents', 'Applicants remove unregistered uploads')
union all
select 'old broad upload policy removed', count(*)::text, '0'
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'Applicants upload to own folder';
