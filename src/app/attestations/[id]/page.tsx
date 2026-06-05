import { notFound } from "next/navigation";
import { getAttestation } from "@/lib/attestations/repository";
import { AttestationShell } from "@/components/attestations/AttestationShell";
import { parseCommonData } from "@/lib/parseCommonData";
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

  // documents_data is typed as `Record<string, Json>` in the DB layer;
  // the editor uses a structurally-identical alias.  A direct cast is
  // safe because the column default is `{}` and the trigger never
  // touches the field.
  const documents = (row.documents_data ?? {}) as DocumentsData;
  const commonData = parseCommonData(row.common_data);

  return (
    <AttestationShell
      id={row.id}
      initialTitle={row.title}
      initialCustomerName={row.customer_name}
      initialCustomerAddress={row.customer_address}
      initialDocuments={documents}
      initialUpdatedAt={row.updated_at}
      initialCommonData={commonData}
    />
  );
}
