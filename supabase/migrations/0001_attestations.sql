-- =====================================================================
-- KazFoodV2 — attestation projects
-- =====================================================================
-- An "attestation" is a long-lived workplace-attestation project that
-- bundles the state of every per-document form (coding / safety / siz /
-- tension / heaviness / …) inside a single `documents_data` JSON blob.
--
-- The shape intentionally matches what the front-end already keeps in
-- React state: one entry per `DocumentDescriptor.key` whose value is the
-- raw (unparsed) form object.  This way the existing DOCX generators
-- consume the exact same payload as before — the only change is the
-- storage location (Supabase row instead of ephemeral useState).
--
-- `approval_data` and `common_data` are reserved JSON columns for the
-- next iteration (shared customer / approval block lifted out of the
-- per-document schemas).  They default to `{}` so today's UI can ignore
-- them without breaking inserts.
-- =====================================================================

create extension if not exists "pgcrypto";

create table if not exists public.attestations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,

  -- UI-facing identification
  title             text not null default 'Без названия',
  customer_name     text not null default '',
  customer_address  text not null default '',

  -- Reserved for the future shared-fields refactor.  Kept nullable-with-
  -- default so today's writes can omit them.
  approval_data     jsonb not null default '{}'::jsonb,
  common_data       jsonb not null default '{}'::jsonb,

  -- Bundle of per-document form snapshots, keyed by DocumentDescriptor.key.
  -- Example shape: { "coding": { ... }, "safety": { ... }, ... }
  documents_data    jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Listing the user's projects is the single hottest query.  Composite
-- index keeps both the user-scoped filter and the "most-recently
-- changed first" sort cheap.
create index if not exists attestations_user_updated_idx
  on public.attestations (user_id, updated_at desc);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
-- Front-end autosave writes happen on every debounce tick; relying on
-- the client to compute updated_at is brittle (clock skew, missing
-- field on partial updates).  A trigger guarantees the timestamp moves
-- forward on every row mutation regardless of caller.
create or replace function public.attestations_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attestations_touch_updated_at on public.attestations;
create trigger attestations_touch_updated_at
  before update on public.attestations
  for each row execute function public.attestations_touch_updated_at();

-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------
-- Every project belongs to exactly one auth.users row.  RLS enforces
-- isolation server-side so even a leaked anon key cannot read or mutate
-- another user's projects.
alter table public.attestations enable row level security;

drop policy if exists "attestations_select_own" on public.attestations;
create policy "attestations_select_own"
  on public.attestations for select
  using (auth.uid() = user_id);

drop policy if exists "attestations_insert_own" on public.attestations;
create policy "attestations_insert_own"
  on public.attestations for insert
  with check (auth.uid() = user_id);

drop policy if exists "attestations_update_own" on public.attestations;
create policy "attestations_update_own"
  on public.attestations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "attestations_delete_own" on public.attestations;
create policy "attestations_delete_own"
  on public.attestations for delete
  using (auth.uid() = user_id);
