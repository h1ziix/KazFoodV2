"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAttestation,
  deleteAttestation,
  duplicateAttestation,
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
 * Autosave entry point.  The browser-side editor debounces calls and
 * sends the **full** snapshot every time — partial diffs would force us
 * to merge JSON server-side and we'd lose the ability to delete a
 * document tab.  Bandwidth cost is irrelevant given the payload size
 * (a few KB per document).
 */
export interface SaveAttestationPayload {
  title: string;
  customer_name: string;
  customer_address: string;
  documents_data: Record<string, Json>;
}

export async function saveAttestationAction(
  id: string,
  payload: SaveAttestationPayload,
): Promise<{ updated_at: string }> {
  const patch: AttestationUpdate = {
    title: payload.title,
    customer_name: payload.customer_name,
    customer_address: payload.customer_address,
    documents_data: payload.documents_data,
  };
  const row = await updateAttestation(id, patch);
  // Only invalidate the list view — the editor manages its own state.
  revalidatePath("/attestations");
  return { updated_at: row.updated_at };
}
