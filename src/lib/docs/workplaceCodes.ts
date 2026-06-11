/**
 * Workplace code scheme — the single source of truth for code generation.
 *
 * ┌─ BUSINESS RULE ────────────────────────────────────────────────────────────┐
 * │ A workplace code is a purely POSITIONAL, derived display value:             │
 * │                                                                             │
 * │   "01 SSS RRR"                                                              │
 * │    │   │   └── 1-based ROW position inside the section (resets per section) │
 * │    │   └────── 1-based section position inside the coding document          │
 * │    └────────── constant prefix, never changes                               │
 * │                                                                             │
 * │ The third block is the plain row index — the «Количество» field NEVER       │
 * │ affects the code. Count is restricted to 0 | 1: repeated positions are      │
 * │ entered as SEPARATE rows, so two «Уборщик» rows naturally get e.g. 016      │
 * │ and 017 (distinct codes per physical workplace).                            │
 * │                                                                             │
 * │ The code is recomputed from scratch on EVERY structural change (add /       │
 * │ delete / move row, add / delete section). It must never be treated as       │
 * │ identity: the stable identity of a coding row is its hidden `id` (uuid),    │
 * │ assigned once and never recomputed. All cross-protocol matching             │
 * │ (syncWorkplaces.ts) keys on the id first and falls back to the code only    │
 * │ for legacy rows. Coding is the single source of truth: every coding edit    │
 * │ re-propagates current codes into all linked protocols                       │
 * │ (migrateWorkplaceCodes, wired as the coding descriptor's `propagate`).      │
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
 *   - every `row.code` is recomputed as the plain ROW INDEX inside its
 *     section (1-я строка = 001, 2-я = 002, …) — the «Количество» field
 *     never affects the code.
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
 * the persisted bundle when coding codes are renumbered: every linked row
 * (matched by codingRowId, legacy rows by stored code) receives the current
 * code of its coding row. Травмобезопасность ходит отдельным walker'ом
 * (remapSafetyRows): её коды — построчные номера её СОБСТВЕННОЙ таблицы.
 */
const DEPENDENT_SHAPES: Record<string, readonly [string, string]> = {
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

/** Canonical target of one coding row after renumbering. */
interface RowTarget {
  id: string;
  /** Current positional code of the coding row. */
  code: string;
}

interface CodeMaps {
  /** Stable id → its coding row's canonical target. */
  byId: Map<string, RowTarget>;
  /** Pre-migration code → its row's target. First occurrence wins. */
  byOldCode: Map<string, RowTarget>;
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

        const target: RowTarget = { id, code };
        maps.byId.set(id, target);
        if (oldCode !== "" && !maps.byOldCode.has(oldCode)) {
          maps.byOldCode.set(oldCode, target);
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
  {
    const remapped = remapSafetyRows(documents["safety"], maps);
    if (remapped !== documents["safety"]) {
      next["safety"] = remapped as Json;
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

/**
 * Травмобезопасность: код в таблице — построчный порядковый номер раздела
 * (в легаси-документе клиента он собирался полем Word `SEQ`, т.е. был
 * автонумератором строк), а НЕ базовый код диапазона кодировки. Миграция
 * перешивает codingRowId как обычно, а код проставляет позиционно — колонка
 * читается 001, 002, 003… без дыр уже при загрузке, до всякого синка.
 * Порядок строк не меняется, данные не трогаются.
 */
function remapSafetyRows(doc: unknown, maps: CodeMaps): unknown {
  if (!isObj(doc) || !Array.isArray(doc.sections)) return doc;
  let changed = false;
  const sections = doc.sections.map((sec, si) => {
    if (!isObj(sec) || !Array.isArray(sec.rows)) return sec;
    const sectionNo =
      typeof sec.number === "number" && sec.number >= 1 ? sec.number : si + 1;
    let secChanged = false;
    const rows = sec.rows.map((row, ri) => {
      if (!isObj(row)) return row;
      const code = formatWorkplaceCode(sectionNo, ri + 1);
      const target = resolveTarget(row, maps);
      if (target) {
        if (row.code === code && row.codingRowId === target.id) return row;
        secChanged = true;
        return { ...row, codingRowId: target.id, code };
      }
      if (row.code === code) return row;
      secChanged = true;
      return { ...row, code };
    });
    if (!secChanged) return sec;
    changed = true;
    return { ...sec, rows };
  });
  return changed ? { ...doc, sections } : doc;
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

/** Resolve one dependent row to its coding row: id link first, then code. */
function resolveTarget(
  row: Record<string, unknown>,
  maps: CodeMaps,
): RowTarget | undefined {
  const linkedId =
    typeof row.codingRowId === "string" && row.codingRowId !== ""
      ? row.codingRowId
      : undefined;
  if (linkedId !== undefined) return maps.byId.get(linkedId);
  const oldCode = typeof row.code === "string" ? row.code : "";
  return oldCode !== "" ? maps.byOldCode.get(oldCode) : undefined;
}

/**
 * Stitch one dependent row to its coding row: id link wins (refresh the
 * display code), legacy rows resolve through their stored code and adopt the
 * id. Rows linked to nothing are left untouched — sync surfaces them as
 * orphans / deletions, migration never drops data.
 */
function remapRow(row: unknown, maps: CodeMaps): unknown {
  if (!isObj(row)) return row;
  const target = resolveTarget(row, maps);
  if (!target) return row;
  if (row.code === target.code && row.codingRowId === target.id) return row;
  return { ...row, codingRowId: target.id, code: target.code };
}

