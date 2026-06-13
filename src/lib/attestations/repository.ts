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
 * We deliberately copy `documents_data`, `approval_data`, `common_data`,
 * `customer_name` and `customer_address` verbatim — the user can then
 * change only what differs.  The title is suffixed with " (копия)" so
 * the two rows are visually distinct in the list view.
 */
export async function duplicateAttestation(id: string): Promise<AttestationRow> {
  const source = await getAttestation(id);
  if (!source) throw new Error("Attestation not found");
  return createAttestation({
    title: `${source.title} (копия)`,
    customer_name: source.customer_name,
    customer_address: source.customer_address,
    documents_data: source.documents_data,
    approval_data: source.approval_data,
    common_data: source.common_data,
  });
}
