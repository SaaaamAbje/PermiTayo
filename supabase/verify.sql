-- Permitayo Phase 2: run this AFTER setup-all.sql. Every row's "result" should equal "expected".
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
  from storage.buckets where id = 'permit-documents' and public = false;
