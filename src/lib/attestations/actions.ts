"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
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

export async function saveAttestationAction(
  id: string,
  payload: SaveAttestationPayload,
): Promise<{ updated_at: string }> {
  // 1. Per-document writes.
  let docsChanged = false;
  if (payload.documents) {
    const { upserts, removed } = payload.documents;
    if (Object.keys(upserts).length > 0) {
      await upsertAttestationDocuments(id, upserts);
      docsChanged = true;
    }
    if (removed.length > 0) {
      await deleteAttestationDocuments(id, removed);
      docsChanged = true;
    }
  }

  // 2. Header / common columns on the attestations row.
  const colPatch: AttestationUpdate = {};
  if (payload.title !== undefined) colPatch.title = payload.title;
  if (payload.customer_name !== undefined)
    colPatch.customer_name = payload.customer_name;
  if (payload.customer_address !== undefined)
    colPatch.customer_address = payload.customer_address;
  if (payload.common_data !== undefined) colPatch.common_data = payload.common_data;

  // 3. Resolve the fresh updated_at and revalidate only if something changed.
  let updated_at: string;
  if (Object.keys(colPatch).length > 0) {
    updated_at = (await updateAttestation(id, colPatch)).updated_at;
  } else if (docsChanged) {
    // Document writes don't touch the parent row, so bump it explicitly.
    updated_at = await touchAttestation(id);
  } else {
    return { updated_at: await getAttestationUpdatedAt(id) };
  }

  // Only invalidate the list view — the editor manages its own state.
  revalidatePath("/attestations");
  return { updated_at };
}
