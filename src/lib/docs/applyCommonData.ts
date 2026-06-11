import type { CommonData } from "@/types/common";

type Nested = Record<string, unknown>;

function isNested(v: unknown): v is Nested {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

type Mapping = readonly [keyof CommonData, readonly string[]];

/**
 * Nested paths inside protocol data objects that correspond to CommonData
 * keys. A mapping is applied ONLY when the full path already exists in the
 * document (deepSet never creates objects or keys), so shape-specific paths
 * are safe to list here: each document picks up exactly the fields its own
 * schema declares, and no document is polluted with foreign keys.
 *
 * Semantics of the common fields across document shapes:
 *   - customerName / customerAddress — заказчик;
 *   - organizationName               — лаборатория (организация-исполнитель);
 *   - performerFullName / Position   — исполнитель со стороны лаборатории;
 *   - approvalFullName / Position    — утверждающий (руководитель заказчика,
 *                                      блок «УТВЕРЖДАЮ» / левая подпись).
 */
const NESTED_MAPPINGS: readonly Mapping[] = [
  // Standard protocol shape (most documents).
  ["customerName",      ["customer",  "name"]],
  ["customerAddress",   ["customer",  "address"]],
  ["performerFullName", ["performer", "fullName"]],
  ["performerPosition", ["performer", "position"]],
  ["approvalFullName",  ["director",  "fullName"]],
  ["approvalPosition",  ["director",  "position"]],

  // Cover («Обложка»): customer = организация + её руководитель;
  // performer = лаборатория + её подписант.
  ["customerName",      ["customer",  "organization"]],
  ["approvalFullName",  ["customer",  "directorName"]],
  ["organizationName",  ["performer", "organization"]], // также Введение
  ["performerPosition", ["performer", "directorPosition"]],
  ["performerFullName", ["performer", "directorName"]],

  // Coding («Кодировка»): блок «УТВЕРЖДАЮ» — руководитель заказчика.
  ["customerName",      ["approval", "organization"]],
  ["approvalFullName",  ["approval", "fullName"]],
  ["approvalPosition",  ["approval", "position"]],
] as const;

function deepSet(
  obj: Nested,
  path: readonly string[],
  value: string,
  forceOverwrite: boolean,
): Nested {
  const [head, ...tail] = path;
  if (tail.length === 0) {
    // Fill only fields the document's shape actually declares — mappings for
    // other documents' shapes must not add foreign keys here.
    if (!(head in obj)) return obj;
    if (!forceOverwrite && !isEmpty(obj[head])) return obj;
    if (obj[head] === value) return obj;
    return { ...obj, [head]: value };
  }
  // Never create intermediate objects: a missing branch means the document's
  // shape has no such field.
  if (!isNested(obj[head])) return obj;
  const child = obj[head] as Nested;
  const newChild = deepSet(child, tail, value, forceOverwrite);
  if (newChild === child) return obj;
  return { ...obj, [head]: newChild };
}

function applyMappings(
  data: unknown,
  commonData: CommonData,
  forceOverwrite: boolean,
): unknown {
  if (!isNested(data)) return data;
  let result: Nested = data;
  for (const [commonKey, path] of NESTED_MAPPINGS) {
    const val = commonData[commonKey];
    if (!val) continue;
    result = deepSet(result, path, val, forceOverwrite);
  }
  return result;
}

/**
 * Returns a shallow-merged copy of `data` where empty fields are filled
 * from `commonData`. Non-empty document values always win.
 *
 * Used at form render / validation time so inherited values are visible
 * in the form and required-field validation passes without the user having
 * to re-enter data that is already in "Общие данные".
 */
export function applyCommonDefaults(
  data: unknown,
  commonData: CommonData | null | undefined,
): unknown {
  if (!commonData) return data;
  return applyMappings(data, commonData, false);
}

/**
 * Returns a copy of `data` where the mapped shared fields are overwritten
 * with non-empty `commonData` values, regardless of what `data` already holds.
 *
 * Used when seeding a brand-new document slot so the user's customer
 * name/address/performer appear immediately instead of example placeholders.
 */
export function applyCommonToSeed(
  data: unknown,
  commonData: CommonData | null | undefined,
): unknown {
  if (!commonData) return data;
  return applyMappings(data, commonData, true);
}
