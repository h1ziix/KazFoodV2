import { notFound } from "next/navigation";
import {
  getAttestation,
  getAttestationDocuments,
} from "@/lib/attestations/repository";
import { AttestationShell } from "@/components/attestations/AttestationShell";
import { parseCommonData } from "@/lib/parseCommonData";
import { migrateWorkplaceCodes } from "@/lib/docs/workplaceCodes";
import type { DocumentsData } from "@/components/attestations/AttestationEditor";

/**
 * Editor page for a single attestation.
 *
 * Server-renders the row once, then hands all the state to a client
 * shell that owns the autosave loop.  We deliberately fetch eagerly
 * (not via a client effect) so that the initial paint already shows
 * the user's data and we never flash an empty form.
 */
export default async function AttestationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getAttestation(id);
  if (!row) notFound();

  // Documents now live in the per-document table (source of truth since the
  // 0002 migration). Fall back to the frozen documents_data column only for a
  // project that somehow has no rows yet (both yield {} for an empty project).
  const stored = await getAttestationDocuments(id);
  const rawDocuments = (
    Object.keys(stored).length > 0 ? stored : (row.documents_data ?? {})
  ) as DocumentsData;

  // migrateWorkplaceCodes runs on the WHOLE bundle before it reaches the
  // client: coding rows get stable ids and positional codes, and every
  // dependent protocol is re-stitched to them in the same pass. Idempotent —
  // canonical data passes through unchanged (same references).
  const documents = migrateWorkplaceCodes(rawDocuments) as DocumentsData;
  const commonData = parseCommonData(row.common_data);

  return (
    <AttestationShell
      id={row.id}
      initialTitle={row.title}
      initialCustomerName={row.customer_name}
      initialCustomerAddress={row.customer_address}
      initialDocuments={documents}
      // Baseline for the save-diff = what is actually persisted (pre-migration
      // codes). For canonical data this equals `documents` (same refs) so no
      // spurious save; for legacy data any migration fix-up is persisted
      // per-document on the first real edit.
      initialDocumentsBaseline={rawDocuments}
      initialUpdatedAt={row.updated_at}
      initialCommonData={commonData}
    />
  );
}
