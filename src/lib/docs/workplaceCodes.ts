/**
 * Workplace code scheme — the single source of truth for code generation.
 *
 * ┌─ BUSINESS RULE ────────────────────────────────────────────────────────────┐
 * │ A workplace code is a purely POSITIONAL, derived display value:             │
 * │                                                                             │
 * │   "01 SSS RRR"                                                              │
 * │    │   │   └── 1-based row position inside its section (resets per section) │
 * │    │   └────── 1-based section position inside the coding document          │
 * │    └────────── constant prefix, never changes                               │
 * │                                                                             │
 * │ The code is recomputed from scratch on EVERY structural change (add /       │
 * │ delete / move). It must never be treated as identity: the stable identity   │
 * │ of a coding row is its hidden `id` (uuid), assigned once and never          │
 * │ recomputed. All cross-protocol matching (syncWorkplaces.ts) keys on the id  │
 * │ first and falls back to the code only for legacy rows that predate ids.     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { Json } from "@/types/database";

export const WORKPLACE_CODE_PREFIX = "01";

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** "01 002 014" for section 2, row 14. Positions are 1-based. */
export function formatWorkplaceCode(sectionNo: number, rowNo: number): string {
  return `${WORKPLACE_CODE_PREFIX} ${pad3(sectionNo)} ${pad3(rowNo)}`;
}

/** Matches a canonical code: constant prefix + 3-digit section + 3-digit row. */
export const WORKPLACE_CODE_PATTERN = /^01 \d{3} \d{3}$/;

/**
 * Stable identity for one coding row. crypto.randomUUID is available in every
 * supported runtime (browser + Node ≥ 20); the fallback only guards exotic
 * embedders so normalisation can never hard-crash.
 */
export function newCodingRowId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Normalisation (coding document) ─────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function rowId(row: Record<string, unknown>): string | undefined {
  return typeof row.id === "string" && row.id !== "" ? row.id : undefined;
}

/**
 * Bring a raw coding document into canonical form:
 *   - every row gets a stable `id` if it does not have one yet;
 *   - `section.number` is recomputed to the section's 1-based position;
 *   - every `row.code` is recomputed positionally via formatWorkplaceCode.
 *
 * Pure and idempotent. Unknown fields are preserved; malformed nodes are
 * passed through untouched (zod validation reports them, we never drop data).
 * Returns the input reference when nothing changed, so callers can use a
 * strict `!==` check to decide whether a re-save is needed.
 */
export function normalizeCodingDocument(data: unknown): unknown {
  if (!isObj(data) || !Array.isArray(data.sections)) return data;

  let changed = false;
  const sections = data.sections.map((s, si) => {
    if (!isObj(s)) return s;
    const number = si + 1;

    let rows = s.rows;
    if (Array.isArray(s.rows)) {
      let rowsChanged = false;
      const nextRows = s.rows.map((r, ri) => {
        if (!isObj(r)) return r;
        const code = formatWorkplaceCode(number, ri + 1);
        const id = rowId(r);
        if (id && r.code === code) return r;
        rowsChanged = true;
        return { ...r, id: id ?? newCodingRowId(), code };
      });
      if (rowsChanged) rows = nextRows;
    }

    if (s.number === number && rows === s.rows) return s;
    changed = true;
    return { ...s, number, rows };
  });

  return changed ? { ...data, sections } : data;
}

// ─── Bundle migration (whole attestation) ────────────────────────────────────

/**
 * Where coding-linked rows live inside each dependent document. Used to walk
 * the persisted bundle when codes are renumbered.
 */
const DEPENDENT_SHAPES: Record<string, readonly [string, string]> = {
  safety: ["sections", "rows"],
  siz: ["sections", "rows"],
  summary: ["places", "workplaces"],
  lighting: ["places", "measurements"],
  emp: ["places", "measurements"],
  noise: ["places", "measurements"],
  meteo: ["places", "measurements"],
};

/** heaviness / tension keep their rows in a flat top-level array. */
const FLAT_DEPENDENTS: Record<string, string> = {
  heaviness: "workplaces",
  tension: "workplaces",
};

interface CodeMaps {
  /** Stable id → current canonical code (refreshes stale display codes). */
  byId: Map<string, string>;
  /** Pre-migration code → its row's identity. First occurrence wins. */
  byOldCode: Map<string, { id: string; code: string }>;
}

/**
 * Atomic, idempotent migration of one attestation's `documents_data` bundle
 * to the positional code scheme:
 *
 *   1. The coding document is normalised (ids assigned, codes renumbered),
 *      while a map from each row's PREVIOUS code to its `{id, newCode}` is
 *      collected in the same pass — so dependents can be remapped even though
 *      their stored codes predate the renumbering.
 *   2. Every dependent protocol row is stitched to its coding row: rows that
 *      already carry `codingRowId` get their display `code` refreshed by id;
 *      legacy rows are resolved through the old code and adopt the id.
 *
 * Must always run on the WHOLE bundle: renumbering coding without remapping
 * dependents would break every cross-protocol link. Returns the input
 * reference when nothing changed.
 */
export function migrateWorkplaceCodes(
  documents: Record<string, Json>,
): Record<string, Json> {
  const coding = documents["coding"];
  if (!isObj(coding) || !Array.isArray(coding.sections)) return documents;

  // Pass 1 — normalise coding and collect identity maps in the same walk
  // (ids assigned here must be the ids the dependents adopt).
  const maps: CodeMaps = { byId: new Map(), byOldCode: new Map() };
  let codingChanged = false;

  const sections = coding.sections.map((s, si) => {
    if (!isObj(s)) return s;
    const number = si + 1;

    let rows = s.rows;
    if (Array.isArray(s.rows)) {
      let rowsChanged = false;
      const nextRows = s.rows.map((r, ri) => {
        if (!isObj(r)) return r;
        const code = formatWorkplaceCode(number, ri + 1);
        const id = rowId(r) ?? newCodingRowId();
        const oldCode = typeof r.code === "string" ? r.code : "";

        maps.byId.set(id, code);
        if (oldCode !== "" && !maps.byOldCode.has(oldCode)) {
          maps.byOldCode.set(oldCode, { id, code });
        }

        if (rowId(r) === id && r.code === code) return r;
        rowsChanged = true;
        return { ...r, id, code };
      });
      if (rowsChanged) rows = nextRows;
    }

    if (s.number === number && rows === s.rows) return s;
    codingChanged = true;
    return { ...s, number, rows };
  });

  // Pass 2 — stitch every dependent protocol to the (possibly renumbered)
  // coding rows.
  let bundleChanged = codingChanged;
  const next: Record<string, Json> = { ...documents };
  if (codingChanged) next["coding"] = { ...coding, sections } as Json;

  for (const [key, [outerKey, innerKey]] of Object.entries(DEPENDENT_SHAPES)) {
    const remapped = remapNested(documents[key], outerKey, innerKey, maps);
    if (remapped !== documents[key]) {
      next[key] = remapped as Json;
      bundleChanged = true;
    }
  }
  for (const [key, listKey] of Object.entries(FLAT_DEPENDENTS)) {
    const remapped = remapFlat(documents[key], listKey, maps);
    if (remapped !== documents[key]) {
      next[key] = remapped as Json;
      bundleChanged = true;
    }
  }

  return bundleChanged ? next : documents;
}

/** Remap rows nested two levels deep (sections→rows / places→workplaces…). */
function remapNested(
  doc: unknown,
  outerKey: string,
  innerKey: string,
  maps: CodeMaps,
): unknown {
  if (!isObj(doc) || !Array.isArray(doc[outerKey])) return doc;
  let changed = false;
  const outer = (doc[outerKey] as unknown[]).map((group) => {
    if (!isObj(group) || !Array.isArray(group[innerKey])) return group;
    let groupChanged = false;
    const inner = (group[innerKey] as unknown[]).map((row) => {
      const remapped = remapRow(row, maps);
      if (remapped !== row) groupChanged = true;
      return remapped;
    });
    if (!groupChanged) return group;
    changed = true;
    return { ...group, [innerKey]: inner };
  });
  return changed ? { ...doc, [outerKey]: outer } : doc;
}

/** Remap rows in a flat top-level list (heaviness/tension workplaces). */
function remapFlat(doc: unknown, listKey: string, maps: CodeMaps): unknown {
  if (!isObj(doc) || !Array.isArray(doc[listKey])) return doc;
  let changed = false;
  const list = (doc[listKey] as unknown[]).map((row) => {
    const remapped = remapRow(row, maps);
    if (remapped !== row) changed = true;
    return remapped;
  });
  return changed ? { ...doc, [listKey]: list } : doc;
}

/**
 * Stitch one dependent row to its coding row: id link wins (refresh the
 * display code), legacy rows resolve through their stored code and adopt the
 * id. Rows linked to nothing are left untouched — sync surfaces them as
 * orphans / deletions, migration never drops data.
 */
function remapRow(row: unknown, maps: CodeMaps): unknown {
  if (!isObj(row)) return row;
  const linkedId =
    typeof row.codingRowId === "string" && row.codingRowId !== ""
      ? row.codingRowId
      : undefined;

  if (linkedId !== undefined) {
    const code = maps.byId.get(linkedId);
    if (code === undefined || row.code === code) return row;
    return { ...row, code };
  }

  const oldCode = typeof row.code === "string" ? row.code : "";
  if (oldCode === "") return row;
  const target = maps.byOldCode.get(oldCode);
  if (!target) return row;
  if (row.code === target.code && row.codingRowId === target.id) return row;
  return { ...row, codingRowId: target.id, code: target.code };
}
