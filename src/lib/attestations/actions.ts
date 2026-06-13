"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAttestation,
  deleteAttestation,
  duplicateAttestation,
  getAttestationUpdatedAt,
  updateAttestation,
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
 * the columns that actually changed. Editing the title no longer re-sends the
 * heavy `documents_data` blob, and editing a document no longer re-sends the
 * header / common-data columns. The whole-`documents_data`-column write is
 * still atomic when a document changes (deleting a tab works), but it is no
 * longer sent on unrelated edits.
 */
export interface SaveAttestationPayload {
  title?: string;
  customer_name?: string;
  customer_address?: string;
  documents_data?: Record<string, Json>;
  common_data?: Json;
}

export async function saveAttestationAction(
  id: string,
  payload: SaveAttestationPayload,
): Promise<{ updated_at: string }> {
  const patch: AttestationUpdate = {};
  if (payload.title !== undefined) patch.title = payload.title;
  if (payload.customer_name !== undefined)
    patch.customer_name = payload.customer_name;
  if (payload.customer_address !== undefined)
    patch.customer_address = payload.customer_address;
  if (payload.documents_data !== undefined)
    patch.documents_data = payload.documents_data;
  if (payload.common_data !== undefined) patch.common_data = payload.common_data;

  // Defensive: an empty patch means nothing changed — skip the UPDATE (an
  // empty PostgREST update would error) and just report the current timestamp.
  if (Object.keys(patch).length === 0) {
    return { updated_at: await getAttestationUpdatedAt(id) };
  }

  const row = await updateAttestation(id, patch);
  // Only invalidate the list view — the editor manages its own state.
  revalidatePath("/attestations");
  return { updated_at: row.updated_at };
}
