-- Permitayo, Phase 4: SAMPLE requirements.
--
-- These are placeholders, NOT the official requirements of the Municipality of
-- Rosario. They are inserted INACTIVE, so applicants do not see them. BPLO
-- personnel should replace the names and instructions with the official list
-- (Dashboard > BPLO > Permit Requirements), then activate them, or add new ones.

insert into public.permit_requirements
  (permit_type_id, name, description, applicant_instructions, is_required, accepted_file_types, max_file_size, display_order, is_active)
select t.id, s.name, s.description, s.instructions, s.is_required,
       array['application/pdf', 'image/jpeg', 'image/png']::text[], 5242880, s.display_order, false
from public.permit_types t
join (values
  ('NEW', 'Sample: Proof of business name registration',
   'Placeholder. Replace with the official BPLO requirement before activating.',
   'Upload a clear scan or photo of the whole document.', true, 10),
  ('NEW', 'Sample: Valid government-issued ID of the owner',
   'Placeholder. Replace with the official BPLO requirement before activating.',
   'Upload the front and back on one page if possible.', true, 20),
  ('NEW', 'Sample: Proof of business location',
   'Placeholder. Replace with the official BPLO requirement before activating.',
   'For example, a lease contract or proof of ownership, if this applies to your business.', false, 30),
  ('RENEWAL', 'Sample: Previous business permit',
   'Placeholder. Replace with the official BPLO requirement before activating.',
   'Upload a clear scan or photo of your most recent permit.', true, 10),
  ('RENEWAL', 'Sample: Valid government-issued ID of the owner',
   'Placeholder. Replace with the official BPLO requirement before activating.',
   'Upload the front and back on one page if possible.', true, 20),
  ('AMENDMENT', 'Sample: Supporting document for the requested change',
   'Placeholder. Replace with the official BPLO requirement before activating.',
   'Upload the document that shows the new information.', true, 10)
) as s(code, name, description, instructions, is_required, display_order)
  on s.code = t.application_code
on conflict do nothing;
