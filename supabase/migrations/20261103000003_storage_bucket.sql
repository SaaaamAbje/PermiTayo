-- Permitayo, Phase 2: Storage configuration for FUTURE document uploads.
-- No upload UI exists yet. Limits below are provisional and can be changed in
-- a later phase once the real requirement formats are confirmed.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'permit-documents',
  'permit-documents',
  false,                                              -- private: never publicly readable
  10485760,                                           -- 10 MB (provisional)
  array['application/pdf', 'image/jpeg', 'image/png'] -- provisional
)
on conflict (id) do nothing;

-- Applicants may add and read files only inside a folder named after their own
-- user id: permit-documents/<user-id>/<file>. There are no update or delete
-- policies, so uploaded evidence cannot be altered or removed by the owner.
-- Staff access is added in the phase that introduces permit applications.
create policy "Applicants upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'permit-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.current_app_role()) = 'applicant'
  );

create policy "Applicants read own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'permit-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.current_app_role()) = 'applicant'
  );
