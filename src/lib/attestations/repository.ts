/**
 * Repository for attestation projects.
 *
 * Every function in this module runs server-side (Server Components,
 * Route Handlers, Server Actions) and relies on the per-request
 * Supabase client.  RLS guarantees a row is only ever visible to its
 * `user_id`; we still pass `user_id` explicitly on writes because
 * Supabase requires the value to be present in the INSERT payload (the
 * policy only *enforces* equality, it does not auto-fill the column).
 */
import type {
  AttestationRow,
  AttestationUpdate,
  Json,
} from "@/types/database";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AttestationSummary = Pick<
  AttestationRow,
  | "id"
  | "title"
  | "customer_name"
  | "customer_address"
  | "created_at"
  | "updated_at"
>;

/** Columns returned by the list view — avoid pulling heavy JSON blobs. */
const SUMMARY_COLUMNS =
  "id,title,customer_name,customer_address,created_at,updated_at" as const;

async function requireUserId(): Promise<{
  userId: string;
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
}> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { userId: user.id, supabase };
}

export async function listAttestations(): Promise<AttestationSummary[]> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("attestations")
    .select(SUMMARY_COLUMNS)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAttestation(id: string): Promise<AttestationRow | null> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("attestations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Cheap timestamp read used by autosave when a save is requested but no
 * column actually changed — avoids an empty UPDATE while still returning a
 * coherent `updated_at` for the save badge.
 */
export async function getAttestationUpdatedAt(id: string): Promise<string> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("attestations")
    .select("updated_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.updated_at;
}

// ─── Per-document storage (attestation_documents) ────────────────────────────

/**
 * Load every document of a project as a { key: data } bundle — the same
 * shape the editor and DOCX generators expect. Source of truth since the
 * 0002 migration (the monolithic documents_data column is kept frozen as a
 * backup).
 */
export async function getAttestationDocuments(
  id: string,
): Promise<Record<string, Json>> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("attestation_documents")
    .select("key,data")
    .eq("attestation_id", id);
  if (error) throw error;
  const out: Record<string, Json> = {};
  for (const row of data ?? []) out[row.key] = row.data;
  return out;
}

/** Upsert the given document keys (only the ones that changed). */
export async function upsertAttestationDocuments(
  id: string,
  upserts: Record<string, Json>,
): Promise<void> {
  const keys = Object.keys(upserts);
  if (keys.length === 0) return;
  const { supabase } = await requireUserId();
  const now = new Date().toISOString();
  const rows = keys.map((key) => ({
    attestation_id: id,
    key,
    data: upserts[key],
    updated_at: now,
  }));
  const { error } = await supabase
    .from("attestation_documents")
    .upsert(rows, { onConflict: "attestation_id,key" });
  if (error) throw error;
}

/** Delete document keys removed from the bundle (e.g. a dropped tab). */
export async function deleteAttestationDocuments(
  id: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const { supabase } = await requireUserId();
  const { error } = await supabase
    .from("attestation_documents")
    .delete()
    .eq("attestation_id", id)
    .in("key", keys);
  if (error) throw error;
}

/**
 * Bump the parent row's updated_at when only document rows changed (those
 * writes don't touch the attestations row, so its trigger wouldn't fire).
 * Returns the fresh timestamp for the save badge / list ordering.
 */
export async function touchAttestation(id: string): Promise<string> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("attestations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("updated_at")
    .single();
  if (error) throw error;
  return data.updated_at;
}

/**
 * Optimistic-concurrency claim: apply the header/common columns AND bump the
 * version, but ONLY if the row's current `updated_at` still equals
 * `expectedUpdatedAt`. Returns the new `updated_at` on success, or null when
 * the version no longer matches (another device/tab saved in between) — the
 * caller treats null as a conflict and writes nothing further.
 *
 * The match is an instant comparison done by Postgres (the column is
 * timestamptz), so the round-tripped ISO string compares correctly. The
 * before-update trigger sets updated_at = now(); the WHERE clause is evaluated
 * against the pre-update value, so the gate is exact and atomic.
 */
export async function claimAttestationVersion(
  id: string,
  expectedUpdatedAt: string,
  colPatch: AttestationUpdate,
): Promise<string | null> {
  const { supabase } = await requireUserId();
  const { updated_at: _ignored, ...safe } = colPatch;
  void _ignored;
  const { data, error } = await supabase
    .from("attestations")
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? null;
}

export interface CreateAttestationInput {
  title?: string;
  customer_name?: string;
  customer_address?: string;
  documents_data?: Record<string, Json>;
  approval_data?: Json;
  common_data?: Json;
}

export async function createAttestation(
  input: CreateAttestationInput = {},
): Promise<AttestationRow> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("attestations")
    .insert({
      user_id: userId,
      title: input.title ?? "Новая аттестация",
      customer_name: input.customer_name ?? "",
      customer_address: input.customer_address ?? "",
      documents_data: input.documents_data ?? {},
      approval_data: input.approval_data ?? {},
      common_data: input.common_data ?? {},
    })
    .select("*")
    .single();
  if (error) {
    console.error("SUPABASE ERROR FULL:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    
    throw error;
  }
  return data;
}

export async function updateAttestation(
  id: string,
  patch: AttestationUpdate,
): Promise<AttestationRow> {
  const { supabase } = await requireUserId();
  // `updated_at` is touched server-side by the trigger; never trust the
  // client value.  Strip it defensively so a stale autosave payload
  // can't roll the timestamp backwards.
  const { updated_at: _ignored, ...safePatch } = patch;
  void _ignored;
  const { data, error } = await supabase
    .from("attestations")
    .update(safePatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAttestation(id: string): Promise<void> {
  const { supabase } = await requireUserId();
  const { error } = await supabase.from("attestations").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Deep-copy a project under a new id.  Used by the "Создать копию"
 * button when a customer has multiple branches (eg. Magnum #1 →
 * Magnum #2) that share most of the data and only differ in a few
 * fields the user then edits in the duplicate.
 *
 * Header / common / approval fields are copied verbatim; the per-document
 * forms are copied from the `attestation_documents` rows (the source of
 * truth — the frozen `documents_data` column is NOT used). The title is
 * suffixed with " (копия)" so the two rows are visually distinct.
 */
export async function duplicateAttestation(id: string): Promise<AttestationRow> {
  const source = await getAttestation(id);
  if (!source) throw new Error("Attestation not found");
  const documents = await getAttestationDocuments(id);
  const copy = await createAttestation({
    title: `${source.title} (копия)`,
    customer_name: source.customer_name,
    customer_address: source.customer_address,
    approval_data: source.approval_data,
    common_data: source.common_data,
  });
  await upsertAttestationDocuments(copy.id, documents);
  return copy;
}
