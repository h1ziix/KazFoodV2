-- =====================================================================
-- ROLLBACK for 0002_attestation_documents.sql
-- =====================================================================
-- Run this ONLY to undo the per-document storage migration. It loses no
-- data: it first rebuilds attestations.documents_data from the
-- per-document rows (which became the source of truth after the app
-- switched over), THEN drops the per-document table.
--
-- After running this, revert the application code that reads/writes
-- attestation_documents (git revert of the corresponding commit) so the
-- app reads attestations.documents_data again.
--
-- Apply with:  npx supabase db execute --file supabase/rollback/0002_attestation_documents_rollback.sql
--   (or paste into the Supabase Dashboard SQL editor)
-- =====================================================================

-- 1. Fold every per-document row back into the monolithic JSONB column,
--    so documents_data is fully up to date again.
update public.attestations a
set documents_data = coalesce(
  (
    select jsonb_object_agg(d.key, d.data)
    from public.attestation_documents d
    where d.attestation_id = a.id
  ),
  '{}'::jsonb
)
where exists (
  select 1 from public.attestation_documents d where d.attestation_id = a.id
);

-- 2. Remove the per-document table (cascade drops its policies).
drop table if exists public.attestation_documents;
