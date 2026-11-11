-- Permitayo, Phase 3: initial application types.
--
-- These are configurable records, not encoded procedures. No eligibility rule,
-- fee or requirement list is attached to them. Administrators can rename,
-- describe, deactivate or add types (UI for this arrives in a later phase; the
-- table already allows administrator writes under RLS).

insert into public.permit_types (name, description, application_code, is_active, sort_order)
values
  ('New Business Permit', 'Application for a business that does not yet hold a business permit from the municipality.', 'NEW', true, 10),
  ('Business Permit Renewal', 'Renewal of an existing business permit.', 'RENEWAL', true, 20),
  ('Business Information Amendment', 'Request to update information on record for an existing business permit.', 'AMENDMENT', true, 30)
on conflict (application_code) do nothing;
