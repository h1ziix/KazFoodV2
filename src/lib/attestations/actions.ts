"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  claimAttestationVersion,
  createAttestation,
  deleteAttestation,
  deleteAttestationDocuments,
  duplicateAttestation,
  getAttestationUpdatedAt,
  touchAttestation,
  updateAttestation,
  upsertAttestationDocuments,
} from "./repository";
import type { AttestationUpdate, Json } from "@/types/database";

/**
 * Server Action: create an empty attestation and jump straight into
 * its editor.  Used by the "Новая аттестация" button on the list page.
 *
 * `redirect()` throws a special control-flow error so the call site
 * never returns; revalidation of the list happens implicitly because
 * the editor route is a sibling segment under /attestations.
 */
export async function createAttestationAction(formData: FormData) {
  const title =
    (formData.get("title")?.toString().trim() || undefined) ?? undefined;
  const row = await createAttestation({ title });
  revalidatePath("/attestations");
  redirect(`/attestations/${row.id}`);
}

export async function deleteAttestationAction(id: string) {
  await deleteAttestation(id);
  revalidatePath("/attestations");
}

export async function duplicateAttestationAction(id: string) {
  const copy = await duplicateAttestation(id);
  revalidatePath("/attestations");
  return copy.id;
}

/**
 * Autosave entry point. Every field is optional: the browser-side editor
 * diffs the current snapshot against what was last persisted and sends ONLY
 * what changed. Header / common columns go to the attestations row; documents
 * are written PER KEY to attestation_documents (upserts for changed docs,
 * removed for dropped tabs) — so editing one document no longer rewrites the
 * whole project, and editing the header no longer touches the documents.
 */
export interface SaveAttestationPayload {
  title?: string;
  customer_name?: string;
  customer_address?: string;
  common_data?: Json;
  documents?: {
    upserts: Record<string, Json>;
    removed: string[];
  };
}

/**
 * Save outcome. `conflict` means another tab/device saved since this client
 * last loaded (`expectedUpdatedAt` no longer matches); nothing was written, so
 * the client must reload rather than silently overwrite the other version.
 */
export type SaveAttestationResult =
  | { updated_at: string }
  | { conflict: true; updated_at: string };

export async function saveAttestationAction(
  id: string,
  payload: SaveAttestationPayload,
  expectedUpdatedAt: string,
): Promise<SaveAttestationResult> {
  // Header / common columns destined for the attestations row.
  const colPatch: AttestationUpdate = {};
  if (payload.title !== undefined) colPatch.title = payload.title;
  if (payload.customer_name !== undefined)
    colPatch.customer_name = payload.customer_name;
  if (payload.customer_address !== undefined)
    colPatch.customer_address = payload.customer_address;
  if (payload.common_data !== undefined) colPatch.common_data = payload.common_data;
  const hasCols = Object.keys(colPatch).length > 0;

  const upserts = payload.documents?.upserts ?? {};
  const removed = payload.documents?.removed ?? [];
  const hasDocs = Object.keys(upserts).length > 0 || removed.length > 0;

  // Nothing actually changed → no write, no conflict possible.
  if (!hasCols && !hasDocs) {
    return { updated_at: await getAttestationUpdatedAt(id) };
  }

  // Optimistic-concurrency claim FIRST: atomically apply the column changes
  // and bump the version, but only if our expected version is still current.
  // Once claimed, no other stale save can succeed, so the per-document writes
  // below are safe.
  let updated_at = await claimAttestationVersion(id, expectedUpdatedAt, colPatch);
  if (updated_at === null) {
    const current = await getAttestationUpdatedAt(id);
    // Distinguish a real concurrent edit from a spurious timestamp-format miss
    // by comparing instants: only a genuinely different version is a conflict.
    if (new Date(current).getTime() !== new Date(expectedUpdatedAt).getTime()) {
      return { conflict: true, updated_at: current };
    }
    // Same instant — the equality filter just didn't match the string form;
    // the version is unchanged, so apply unconditionally.
    updated_at = hasCols
      ? (await updateAttestation(id, colPatch)).updated_at
      : await touchAttestation(id);
  }

  // Per-document writes (version already claimed above).
  if (Object.keys(upserts).length > 0) await upsertAttestationDocuments(id, upserts);
  if (removed.length > 0) await deleteAttestationDocuments(id, removed);

  // Only invalidate the list view — the editor manages its own state.
  revalidatePath("/attestations");
  return { updated_at };
}
