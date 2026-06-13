-- =====================================================================
-- KazFoodV2 — per-document storage
-- =====================================================================
-- Until now every per-document form lived inside a single
-- attestations.documents_data JSONB column, so editing ONE document
-- rewrote the whole blob on every save. This migration introduces a
-- per-document table so a save can touch only the changed document.
--
-- SAFETY — this migration is purely ADDITIVE and REVERSIBLE:
--   * attestations.documents_data is NOT altered or dropped — it stays
--     exactly as it is and acts as a frozen backup snapshot.
--   * the backfill is idempotent (ON CONFLICT DO NOTHING), so running
--     the migration twice never clobbers newer per-document edits.
--   * full rollback (rebuild the column from this table, then drop it)
--     lives in supabase/rollback/0002_attestation_documents_rollback.sql
--     and loses no data.
-- =====================================================================

create table if not exists public.attestation_documents (
  attestation_id uuid        not null
    references public.attestations (id) on delete cascade,
  -- DocumentDescriptor.key — "coding" | "safety" | "lighting" | …
  key            text        not null,
  -- The raw (unparsed) form snapshot for this one document.
  data           jsonb       not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  primary key (attestation_id, key)
);

-- Loading a project fetches all its document rows by attestation_id.
create index if not exists attestation_documents_attestation_idx
  on public.attestation_documents (attestation_id);

-- NOTE: unlike `attestations`, this table has no updated_at trigger. The
-- column defaults to now() on insert and the application sets it explicitly
-- on every upsert, so a PL/pgSQL trigger (whose `$$`-quoted body trips the
-- statement-splitting SQL editor) is unnecessary here.

-- Table-level privileges. RLS restricts WHICH rows each user sees, but the
-- API roles still need base GRANTs to touch the table at all — without these
-- the app gets "42501 insufficient_privilege". (Tables created via the SQL
-- editor do not always inherit the default privileges, so grant explicitly.)
grant select, insert, update, delete
  on public.attestation_documents to anon, authenticated;

-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------
-- A document row is visible/mutable iff the parent attestation belongs
-- to the caller. We check ownership via the parent row's user_id so a
-- leaked anon key cannot reach another user's documents.
alter table public.attestation_documents enable row level security;

drop policy if exists "attestation_documents_select_own"
  on public.attestation_documents;
create policy "attestation_documents_select_own"
  on public.attestation_documents for select
  using (
    exists (
      select 1 from public.attestations a
      where a.id = attestation_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "attestation_documents_insert_own"
  on public.attestation_documents;
create policy "attestation_documents_insert_own"
  on public.attestation_documents for insert
  with check (
    exists (
      select 1 from public.attestations a
      where a.id = attestation_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "attestation_documents_update_own"
  on public.attestation_documents;
create policy "attestation_documents_update_own"
  on public.attestation_documents for update
  using (
    exists (
      select 1 from public.attestations a
      where a.id = attestation_id and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.attestations a
      where a.id = attestation_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "attestation_documents_delete_own"
  on public.attestation_documents;
create policy "attestation_documents_delete_own"
  on public.attestation_documents for delete
  using (
    exists (
      select 1 from public.attestations a
      where a.id = attestation_id and a.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Backfill from the existing monolithic column
-- ---------------------------------------------------------------------
-- Expand each attestation's documents_data object into one row per key.
-- Idempotent: ON CONFLICT DO NOTHING means an already-migrated project
-- (whose rows may already be newer than the frozen column) is left
-- untouched, so re-running this migration is always safe.
insert into public.attestation_documents (attestation_id, key, data)
select a.id, kv.key, kv.value
from public.attestations a,
     lateral jsonb_each(coalesce(a.documents_data, '{}'::jsonb)) as kv
on conflict (attestation_id, key) do nothing;
