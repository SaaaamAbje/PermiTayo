-- Permitayo, Phase 2: proposed departments.
--
-- These offices are PROPOSED. They are inserted INACTIVE because it has not been
-- confirmed which offices take part in Rosario's permit process. An administrator
-- activates the ones that do (Dashboard > Admin > Departments) and can rename,
-- add or deactivate others at any time.

insert into public.departments (department_name, department_code, description, is_active)
values
  ('Business Permits and Licensing Office', 'BPLO', 'Proposed participating office. Confirm before activating.', false),
  ('Municipal Treasurer''s Office', 'MTO', 'Proposed participating office. Confirm before activating.', false),
  ('Municipal Planning and Development Office', 'MPDO', 'Proposed participating office. Confirm before activating.', false),
  ('Municipal Engineering Office', 'MEO', 'Proposed participating office. Confirm before activating.', false),
  ('Municipal Health Office', 'MHO', 'Proposed participating office. Confirm before activating.', false),
  ('Bureau of Fire Protection', 'BFP', 'Proposed participating office. Confirm before activating.', false)
on conflict (department_code) do nothing;
