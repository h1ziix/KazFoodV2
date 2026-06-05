import type { CommonData } from "@/types/common";

/**
 * Mapping from CommonData field names to the dotted context keys produced
 * by flatten() inside each protocol's buildTemplateContext().
 *
 * The injector ONLY fills a context key when that key is absent, null,
 * undefined, or an empty string — document-specific values always win.
 */
const FIELD_MAP: ReadonlyArray<readonly [keyof CommonData, string]> = [
  ["customerName",      "customer.name"],
  ["customerAddress",   "customer.address"],
  ["organizationName",  "organizationName"],
  ["performerFullName", "performer.fullName"],
  ["performerPosition", "performer.position"],
  ["approvalFullName",  "director.fullName"],
  ["approvalPosition",  "director.position"],
  ["protocolDate",      "protocolDate"],
] as const;

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/**
 * Return a shallow copy of `ctx` with CommonData values injected for
 * every context key whose current value is empty.  Non-empty document
 * values are never overwritten.
 *
 * Also injects every CommonData field under its original camelCase name
 * (e.g. `commonData.performerFullName` → context key `performerFullName`)
 * so templates can reference common values directly by name when needed.
 */
export function injectCommonData(
  ctx: Record<string, unknown>,
  commonData: CommonData | null | undefined,
): Record<string, unknown> {
  if (!commonData) return ctx;

  const merged: Record<string, unknown> = { ...ctx };

  // Primary mapping: common → standard protocol context keys.
  for (const [commonKey, ctxKey] of FIELD_MAP) {
    const val = commonData[commonKey];
    if (val && isEmptyValue(merged[ctxKey])) {
      merged[ctxKey] = val;
    }
  }

  // Secondary: expose every CommonData field under its own name so
  // templates can use e.g. {protocolDate} or {organizationName} directly.
  for (const key of Object.keys(commonData) as Array<keyof CommonData>) {
    const val = commonData[key];
    if (val && isEmptyValue(merged[key])) {
      merged[key] = val;
    }
  }

  return merged;
}
