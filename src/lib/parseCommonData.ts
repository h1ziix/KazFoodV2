import type { Json } from "@/types/database";
import { type CommonData, EMPTY_COMMON_DATA } from "@/types/common";

/**
 * Migration-safe parser: converts the raw `common_data` Json blob
 * from the DB into a well-typed `CommonData` object.
 *
 * Old attestations have `common_data: {}` (or null) — they deserialize
 * to all-empty strings, which causes no injection at render time.
 */
export function parseCommonData(raw: Json | null | undefined): CommonData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_COMMON_DATA };
  }
  const d = raw as Record<string, unknown>;
  return {
    customerName: typeof d["customerName"] === "string" ? d["customerName"] : "",
    customerAddress: typeof d["customerAddress"] === "string" ? d["customerAddress"] : "",
    organizationName: typeof d["organizationName"] === "string" ? d["organizationName"] : "",
    performerFullName: typeof d["performerFullName"] === "string" ? d["performerFullName"] : "",
    performerPosition: typeof d["performerPosition"] === "string" ? d["performerPosition"] : "",
    approvalFullName: typeof d["approvalFullName"] === "string" ? d["approvalFullName"] : "",
    approvalPosition: typeof d["approvalPosition"] === "string" ? d["approvalPosition"] : "",
    protocolDate: typeof d["protocolDate"] === "string" ? d["protocolDate"] : "",
  };
}
