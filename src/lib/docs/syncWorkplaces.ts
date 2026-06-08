/**
 * Explicit workplace synchronisation from the Coding protocol.
 *
 * Class A (Lighting, EMP, Noise, Meteo) — additive, non-destructive:
 *   Places are added / reordered to match coding sections. Places present in
 *   the protocol but absent from coding (orphaned) are kept in-place and
 *   surfaced to the user via `getOrphanedPlaces` for manual removal.
 *   Measurements inside every place are always preserved.
 *
 * Class B (Safety, SIZ) / Class C (Summary) / Class D (Heaviness, Tension) —
 *   full structural replacement: rows / workplaces absent from coding are
 *   deleted; existing rows whose code still exists have their identity fields
 *   updated and their protocol-specific data preserved.
 */

import type { CodingRow, CodingSection } from "@/types/coding";
import {
  HEAVINESS_WORK_DESCRIPTION,
  resolveHeavinessNormativeByCode,
  resolveHeavinessNormativeByPosition,
  resolveHeavinessNormativeBySection,
} from "@/lib/heavinessTemplates";
import {
  TENSION_WORK_DESCRIPTION,
  resolveTensionNormativeByPosition,
  resolveTensionNormativeBySection,
} from "@/lib/tensionTemplates";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DeletedItem {
  code: string;
  name: string;
}

export interface SyncDiff {
  toAdd: number;
  toUpdate: number;
  /** Class A: always []. Class B/C/D: rows that will be permanently removed. */
  toDelete: DeletedItem[];
}

export interface OrphanedPlace {
  name: string;
  measurementCount: number;
}

/**
 * A single measurement row that is no longer backed by the coding: either its
 * position was removed from the section ("removed"), or its count was reduced
 * and this is a surplus repetition ("surplus"). Class A sync keeps such rows
 * (non-destructive); this surfaces them so the user can delete them manually.
 */
export interface OrphanedMeasurement {
  /** Place (section title) the row lives in. */
  placeName: string;
  /** rowNumber — unique within the place; used as the removal handle. */
  rowNumber: number;
  pointNumber: string;
  /** The measurement's own position name. */
  position: string;
  reason: "removed" | "surplus";
}

// ─── Protocol classification ──────────────────────────────────────────────────

export const CLASS_A_KEYS = new Set(["lighting", "emp", "noise", "meteo"]);

export const SYNCABLE_KEYS = new Set([
  "lighting",
  "emp",
  "noise",
  "meteo",
  "safety",
  "siz",
  "summary",
  "heaviness",
  "tension",
]);

// ─── Section extraction ───────────────────────────────────────────────────────

/**
 * Safely extracts CodingSection[] from raw JSONB stored in documents["coding"].
 * Returns [] when the data is absent, malformed, or has no valid sections.
 */
export function extractCodingSections(rawCoding: unknown): CodingSection[] {
  if (!isObj(rawCoding)) return [];
  const d = rawCoding as Record<string, unknown>;
  if (!Array.isArray(d.sections)) return [];

  const result: CodingSection[] = [];
  for (const s of d.sections) {
    if (!isObj(s)) continue;
    const sec = s as Record<string, unknown>;
    if (typeof sec.number !== "number" || typeof sec.title !== "string") continue;
    if (!Array.isArray(sec.rows)) continue;

    const rows: CodingRow[] = [];
    for (const r of sec.rows) {
      if (!isObj(r)) continue;
      const row = r as Record<string, unknown>;
      if (
        typeof row.code === "string" &&
        typeof row.name === "string" &&
        typeof row.count === "number"
      ) {
        rows.push({ code: row.code, name: row.name, count: row.count });
      }
    }
    result.push({ number: sec.number, title: sec.title, rows });
  }
  return result;
}

// ─── Diff computation ─────────────────────────────────────────────────────────

export function computeSyncDiff(
  key: string,
  data: unknown,
  sections: CodingSection[],
): SyncDiff {
  if (CLASS_A_KEYS.has(key)) return diffClassA(data, sections);
  if (key === "safety" || key === "siz") return diffFlatSections(data, sections);
  if (key === "summary") return diffSummary(data, sections);
  if (key === "heaviness" || key === "tension") return diffCardWorkplaces(data, sections);
  return { toAdd: 0, toUpdate: 0, toDelete: [] };
}

function diffClassA(data: unknown, sections: CodingSection[]): SyncDiff {
  const existing = new Set(extractPlaceNames(data));
  const toAdd = sections.filter((s) => !existing.has(s.title)).length;
  const toUpdate = sections.filter((s) => existing.has(s.title)).length;
  return { toAdd, toUpdate, toDelete: [] };
}

function diffFlatSections(data: unknown, sections: CodingSection[]): SyncDiff {
  const existingRows = extractSectionRows(data);
  const codingCodes = new Set(sections.flatMap((s) => s.rows.map((r) => r.code)));
  const existingCodes = new Set(existingRows.map((r) => r.code));

  const toAdd = sections.flatMap((s) => s.rows).filter((r) => !existingCodes.has(r.code)).length;
  const toUpdate = sections.flatMap((s) => s.rows).filter((r) => existingCodes.has(r.code)).length;
  const toDelete = existingRows
    .filter((r) => !codingCodes.has(r.code))
    .map((r) => ({ code: r.code, name: r.name }));

  return { toAdd, toUpdate, toDelete };
}

function diffSummary(data: unknown, sections: CodingSection[]): SyncDiff {
  const existingWp = extractSummaryWorkplaces(data);
  const codingCodes = new Set(sections.flatMap((s) => s.rows.map((r) => r.code)));
  const existingCodes = new Set(existingWp.map((w) => w.code));

  const toAdd = sections.flatMap((s) => s.rows).filter((r) => !existingCodes.has(r.code)).length;
  const toUpdate = sections.flatMap((s) => s.rows).filter((r) => existingCodes.has(r.code)).length;
  const toDelete = existingWp
    .filter((w) => !codingCodes.has(w.code))
    .map((w) => ({ code: w.code, name: w.name }));

  return { toAdd, toUpdate, toDelete };
}

function diffCardWorkplaces(data: unknown, sections: CodingSection[]): SyncDiff {
  const existingCards = extractCardWorkplaces(data);
  const codingCodes = new Set(sections.flatMap((s) => s.rows.map((r) => r.code)));
  const existingCodes = new Set(existingCards.map((c) => c.code));

  const toAdd = sections.flatMap((s) => s.rows).filter((r) => !existingCodes.has(r.code)).length;
  const toUpdate = sections.flatMap((s) => s.rows).filter((r) => existingCodes.has(r.code)).length;
  const toDelete = existingCards
    .filter((c) => !codingCodes.has(c.code))
    .map((c) => ({ code: c.code, name: c.name }));

  return { toAdd, toUpdate, toDelete };
}

// ─── Sync dispatcher ──────────────────────────────────────────────────────────

export function syncProtocolFromCoding(
  key: string,
  data: unknown,
  sections: CodingSection[],
): unknown {
  if (sections.length === 0) return data;
  if (CLASS_A_KEYS.has(key)) return syncMeasurementPlaces(key, data, sections);
  if (key === "safety") return syncSafetyRows(data, sections);
  if (key === "siz") return syncSizRows(data, sections);
  if (key === "summary") return syncSummaryPlaces(data, sections);
  if (key === "heaviness") return syncHeavinessWorkplaces(data, sections);
  if (key === "tension") return syncTensionWorkplaces(data, sections);
  return data;
}

// ─── Class A — Measurement protocols ─────────────────────────────────────────

/**
 * Unified Class A synchronisation. One algorithm, identical for every
 * position — no position-specific special cases.
 *
 * Identity (Q1): the coding `code`, persisted on every measurement. Existing
 *   rows that predate this scheme are backfilled by matching their position
 *   name to a coding row within the same section. After backfill the code is
 *   authoritative, so a position can be renamed in coding without losing the
 *   data, and the same name in two sections never collides (different codes).
 *
 * Existing rows (Q2 = non-destructive): every stored measurement is kept,
 *   in order. Reducing a count or deleting a position never removes data;
 *   such surplus rows are surfaced separately via getOrphanedMeasurements.
 *
 * New rows: created only where a coding row's count exceeds the number of
 *   stored rows for that code. Norms are inherited strictly within the
 *   section (never crossing А-1 ↔ Б-2):
 *     1. another row of the SAME code → full clone incl. measured value
 *        (it is the same workplace repeated);
 *     2. else the first row of the same section → inherit its values
 *        INCLUDING the measured reading (positions in one section share the
 *        same category/conditions, e.g. all АУП = А-1), keeping only the new
 *        position's own name/code;
 *     3. else a blank default row (the section has no rows to inherit from).
 *
 * Numbering: rowNumber / pointNumber are derived data, not identity, and are
 *   never inherited. After the whole result is built they are recomputed from
 *   scratch in one global pass: every row across every place, in display
 *   order, forms a single continuous 1..N sequence (1т..Nт).
 */
function syncMeasurementPlaces(
  key: string,
  data: unknown,
  sections: CodingSection[],
): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const existing = arr(d.places);

  // Stored places grouped by name (section title). Duplicate titles are
  // paired positionally with their coding sections (Nth ↔ Nth).
  const byName = new Map<string, Record<string, unknown>[]>();
  for (const p of existing) {
    if (!isObj(p)) continue;
    const place = p as Record<string, unknown>;
    if (typeof place.name === "string") {
      const bucket = byName.get(place.name) ?? [];
      bucket.push(place);
      byName.set(place.name, bucket);
    }
  }

  const codingTitles = new Set(sections.map((s) => s.title));
  const sectionOccurrence = new Map<string, number>();

  const result: Record<string, unknown>[] = sections.map((section) => {
    const occurrence = sectionOccurrence.get(section.title) ?? 0;
    sectionOccurrence.set(section.title, occurrence + 1);
    const ex = (byName.get(section.title) ?? [])[occurrence];

    // code ← position name, for backfilling rows that predate code identity.
    const codeByName = new Map<string, string>();
    for (const cr of section.rows) {
      const nk = normalizePlaceName(cr.name);
      if (!codeByName.has(nk)) codeByName.set(nk, cr.code);
    }

    // Carry every stored row forward (non-destructive), backfilling code.
    const existingMeasurements: Record<string, unknown>[] = [];
    if (ex) {
      for (const m of arr(ex.measurements)) {
        if (!isObj(m)) continue;
        const row = { ...(m as Record<string, unknown>) };
        if (typeof row.code !== "string" || row.code === "") {
          const inferred = codeByName.get(
            normalizePlaceName(String(row.place ?? "")),
          );
          if (inferred) row.code = inferred;
        }
        existingMeasurements.push(row);
      }
    }

    // Per-code tally + first row as same-code template; first row of the
    // section as the fallback (section-level) template.
    const haveByCode = new Map<string, number>();
    const firstByCode = new Map<string, Record<string, unknown>>();
    let sectionTemplate: Record<string, unknown> | undefined;
    for (const row of existingMeasurements) {
      const code = typeof row.code === "string" ? row.code : "";
      if (code) {
        haveByCode.set(code, (haveByCode.get(code) ?? 0) + 1);
        if (!firstByCode.has(code)) firstByCode.set(code, row);
      }
      if (!sectionTemplate) sectionTemplate = row;
    }

    // rowNumber / pointNumber are assigned by the global renumbering pass
    // after the whole result is built, so the value passed here (0) is just a
    // placeholder and is never read.
    const additional: Record<string, unknown>[] = [];
    for (const cr of section.rows) {
      const have = haveByCode.get(cr.code) ?? 0;
      const sameCode = firstByCode.get(cr.code);
      for (let i = have; i < cr.count; i++) {
        if (sameCode) {
          // Repetition of an existing workplace → full clone incl. measured.
          additional.push(buildRow(key, sameCode, 0, cr.code, cr.name, true));
        } else if (sectionTemplate) {
          // Position new to a populated section → inherit the first row of
          // THIS section, including its measured reading (positions in one
          // section share the same category/conditions, e.g. all АУП = А-1).
          additional.push(buildRow(key, sectionTemplate, 0, cr.code, cr.name, true));
        } else {
          // Empty section → blank default, nothing to inherit from.
          additional.push(buildRow(key, undefined, 0, cr.code, cr.name, false));
        }
      }
    }

    const merged =
      additional.length > 0
        ? [...existingMeasurements, ...additional]
        : existingMeasurements;

    return { number: section.number, name: section.title, measurements: merged };
  });

  // Orphaned places (whole section gone from coding) appended, not deleted.
  for (const p of existing) {
    if (!isObj(p)) continue;
    const place = p as Record<string, unknown>;
    if (typeof place.name === "string" && !codingTitles.has(place.name)) {
      result.push(place);
    }
  }

  // Global renumbering pass: every row across every place, in display order,
  // forms one continuous 1..N sequence. Old rowNumber / pointNumber values are
  // ignored entirely — they are derived data, never identity — and recomputed
  // from scratch on every sync.
  let globalCounter = 1;
  const renumbered = result.map((place) => {
    if (!isObj(place)) return place;
    const pl = place as Record<string, unknown>;
    const measurements = arr(pl.measurements).map((m) => {
      if (!isObj(m)) return m;
      const n = globalCounter++;
      return { ...(m as Record<string, unknown>), rowNumber: n, pointNumber: `${n}т` };
    });
    return { ...pl, measurements };
  });

  return { ...d, places: renumbered };
}

// ─── Default measurement factories (Class A) ─────────────────────────────────

function defaultMeasurement(
  key: string,
  rowNumber: number,
  placeName: string,
): Record<string, unknown> {
  const pointNumber = `${rowNumber}т`;
  switch (key) {
    case "lighting":
      return defaultLightingMeasurement(rowNumber, pointNumber, placeName);
    case "noise":
      return defaultNoiseMeasurement(rowNumber, pointNumber, placeName);
    case "emp":
      return defaultEmpMeasurement(rowNumber, pointNumber, placeName);
    case "meteo":
      return defaultMeteoMeasurement(rowNumber, pointNumber, placeName);
    default:
      return { rowNumber, pointNumber, place: placeName };
  }
}

/**
 * Build one measurement row for the sync algorithm.
 *
 * Every row produced here is stamped with its coding `code` (identity) and
 * the canonical position name `placeName`, then numbered with `rowNumber` /
 * `${rowNumber}т`.
 *
 * - `template` undefined → a blank default row (empty section).
 * - `inheritMeasured` true → full clone of the template, INCLUDING the
 *   measured value (a repetition of the same workplace, same `code`).
 * - `inheritMeasured` false → inherit only normative / reference fields
 *   (workCategory, allowed, range names, …) and leave the measured value
 *   blank (a position that is new to the section but shares its norms).
 */
function buildRow(
  key: string,
  template: Record<string, unknown> | undefined,
  rowNumber: number,
  code: string,
  placeName: string,
  inheritMeasured: boolean,
): Record<string, unknown> {
  const pointNumber = `${rowNumber}т`;

  if (!template) {
    return { ...defaultMeasurement(key, rowNumber, placeName), code };
  }

  switch (key) {
    case "lighting": {
      return {
        code,
        rowNumber,
        pointNumber,
        place: placeName,
        workCategory: template.workCategory ?? "",
        lightingSystem: template.lightingSystem ?? "Искусственное, общее, равномерное",
        lightingType: template.lightingType ?? "Светодиодное",
        keo: template.keo ?? "-",
        allowed: template.allowed ?? 0,
        measured: inheritMeasured ? template.measured ?? 0 : 0,
      };
    }
    case "noise": {
      const base: Record<string, unknown> = { ...template, code, rowNumber, pointNumber, place: placeName };
      return inheritMeasured ? base : { ...base, measured: "" };
    }
    case "emp": {
      const base: Record<string, unknown> = { ...template, code, rowNumber, pointNumber, place: placeName };
      if (inheritMeasured) return base;
      const r1 = isObj(base.range1)
        ? { ...(base.range1 as Record<string, unknown>), electricMeasured: "", magneticMeasured: "" }
        : base.range1;
      const r2 = isObj(base.range2)
        ? { ...(base.range2 as Record<string, unknown>), electricMeasured: "", magneticMeasured: "" }
        : base.range2;
      return { ...base, range1: r1, range2: r2 };
    }
    case "meteo": {
      const base: Record<string, unknown> = { ...template, code, rowNumber, pointNumber, place: placeName };
      return inheritMeasured ? base : { ...base, tempMeasured: "", humidityMeasured: "" };
    }
    default: {
      return { ...template, code, rowNumber, pointNumber, place: placeName };
    }
  }
}

function defaultLightingMeasurement(
  rowNumber: number,
  pointNumber: string,
  place: string,
): Record<string, unknown> {
  return {
    rowNumber,
    pointNumber,
    place,
    workCategory: "",
    lightingSystem: "Искусственное, общее, равномерное",
    lightingType: "Светодиодное",
    measured: 0,
    keo: "-",
    allowed: 0,
  };
}

function defaultNoiseMeasurement(
  rowNumber: number,
  pointNumber: string,
  place: string,
): Record<string, unknown> {
  return {
    rowNumber,
    pointNumber,
    place,
    time: "7-8",
    ppePresent: "+",
    ppeAbsent: "",
    sourceStationary: "+",
    sourceNonStationary: "",
    octaves: {
      hz31: "", hz63: "", hz125: "", hz250: "",
      hz500: "", hz1000: "", hz2000: "", hz4000: "",
    },
    character: {
      broadStationary: "", broadNonStationary: "",
      broadOscillating: "", broadImpulse: "",
      tonalStationary: "", tonalNonStationary: "",
      tonalOscillating: "", tonalImpulse: "",
    },
    measured: "",
    allowed: "",
  };
}

function defaultEmpMeasurement(
  rowNumber: number,
  pointNumber: string,
  place: string,
): Record<string, unknown> {
  const baseRange = { distance: "0,5", height: "1,5", time: "8" };
  return {
    rowNumber,
    pointNumber,
    place,
    range1: {
      name: "5 Гц – 2 кГц",
      ...baseRange,
      electricMeasured: "",
      electricAllowed: "25",
      magneticMeasured: "",
      magneticAllowed: "250",
    },
    range2: {
      name: "2 кГц – 400 кГц",
      ...baseRange,
      electricMeasured: "",
      electricAllowed: "2,5",
      magneticMeasured: "",
      magneticAllowed: "25",
    },
  };
}

function defaultMeteoMeasurement(
  rowNumber: number,
  pointNumber: string,
  place: string,
): Record<string, unknown> {
  return {
    rowNumber,
    pointNumber,
    place,
    workCategory: "",
    timeOfDay: "день",
    tempMeasured: "",
    tempAllowed: "",
    humidityMeasured: "",
    humidityAllowed: "",
    airSpeedMeasured: "-",
    airSpeedAllowed: "-",
    pressure: "",
  };
}

// ─── Class B — Safety ─────────────────────────────────────────────────────────

/**
 * Значения по умолчанию для НОВОЙ строки травмобезопасности (всё, кроме полей
 * идентичности code/position/count, которые приходят из кодировки). Заполняются
 * при Sync, чтобы новая строка сразу проходила валидацию без ручного ввода —
 * КРОМЕ `equipment`: оборудование пользователь вписывает сам, поэтому оно
 * остаётся пустым (и подсвечивается валидацией как требующее заполнения).
 *
 * Существующие строки эти дефолты НЕ затрагивают: при повторном Sync строка с
 * тем же кодом проходит по ветке `ex` (сохраняется как есть, обновляются лишь
 * code/position/count), поэтому отредактированные пользователем значения не
 * перезаписываются.
 */
const SAFETY_NEW_ROW_DEFAULTS = {
  equipment: "", // заполняется вручную пользователем — НЕ автозаполняем
  documentation: "в наличии",
  result: "соответствует",
  nonComplianceReasons: "отсутствуют",
  finalNote: "соответствует стандартам",
} as const;

function syncSafetyRows(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const byCode = flattenSectionRowsByCode(d);

  const newSections = sections.map((section) => ({
    number: section.number,
    title: `${section.number}. ${section.title}`,
    rows: section.rows.map((cr) => {
      const ex = byCode.get(cr.code);
      return ex
        ? { ...ex, code: cr.code, position: cr.name, count: cr.count }
        : {
            code: cr.code,
            position: cr.name,
            count: cr.count,
            ...SAFETY_NEW_ROW_DEFAULTS,
          };
    }),
  }));

  return { ...d, sections: newSections };
}

// ─── Class B — SIZ ───────────────────────────────────────────────────────────

/**
 * Значения по умолчанию для НОВОЙ строки СИЗ (всё, кроме идентичности
 * code/position/count из кодировки). Заполняются при Sync, чтобы новая строка
 * сразу проходила валидацию без ручного ввода — КРОМЕ `normItems`
 * («Нормированный перечень»): его пользователь вписывает сам, поэтому остаётся
 * пустым (поле необязательное, см. sizSchema).
 *
 * Существующие строки эти дефолты НЕ затрагивают: при повторном Sync строка с
 * тем же кодом идёт по ветке `ex` (обновляются лишь code/position/count),
 * поэтому отредактированные пользователем значения не перезаписываются.
 */
const SIZ_NEW_ROW_DEFAULTS = {
  normItems: "", // заполняется вручную пользователем — НЕ автозаполняем
  issuedFact: "да",
  certificate: "в наличии",
  assessment: "обеспечен",
  note: "-",
} as const;

function syncSizRows(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const byCode = flattenSectionRowsByCode(d);

  const newSections = sections.map((section) => ({
    number: section.number,
    title: `${section.number}. ${section.title}`,
    rows: section.rows.map((cr) => {
      const ex = byCode.get(cr.code);
      return ex
        ? { ...ex, code: cr.code, position: cr.name, count: cr.count }
        : {
            code: cr.code,
            position: cr.name,
            count: cr.count,
            ...SIZ_NEW_ROW_DEFAULTS,
          };
    }),
  }));

  return { ...d, sections: newSections };
}

// ─── Class C — Summary ────────────────────────────────────────────────────────

function syncSummaryPlaces(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const byCode = new Map<string, Record<string, unknown>>();
  for (const pl of arr(d.places)) {
    if (!isObj(pl)) continue;
    for (const wp of arr((pl as Record<string, unknown>).workplaces)) {
      if (!isObj(wp)) continue;
      const w = wp as Record<string, unknown>;
      if (typeof w.code === "string") byCode.set(w.code, w);
    }
  }

  const newPlaces = sections.map((section) => ({
    number: section.number,
    name: section.title,
    workplaces: section.rows.map((cr) => {
      const ex = byCode.get(cr.code);
      return ex
        ? { ...ex, code: cr.code, profession: cr.name, count: cr.count }
        : { code: cr.code, profession: cr.name, count: cr.count, factors: [] };
    }),
  }));

  return { ...d, places: newPlaces };
}

// ─── Class D — Heaviness ──────────────────────────────────────────────────────

/**
 * ┌─ BUSINESS RULE — DO NOT BREAK ─────────────────────────────────────────────┐
 * │ The workplace CODE is the single source of truth for a position in the      │
 * │ Heaviness (and Tension) protocol. It is the ONLY stable identifier.         │
 * │                                                                             │
 * │ • The code comes verbatim from Coding in the format "XX XXX XXX"            │
 * │   (e.g. "01 001 015"). It is opaque input data: it is NEVER generated,      │
 * │   computed from rowNumber, derived from position order, or built from       │
 * │   ranges. Whatever Coding sends is carried through unchanged.               │
 * │ • The position NAME is display data, NOT a key. Names repeat across the      │
 * │   coding (e.g. «Технолог оператор» exists as both 01 001 013 and            │
 * │   01 001 014), so matching by name would silently cross-contaminate cards.  │
 * │ • Therefore ALL sync matching is by code: existing cards are paired via     │
 * │   `cardsByCode`, and the normative template is looked up by exact code      │
 * │   FIRST (`resolveHeavinessNormativeByCode`) before any name/section         │
 * │   fallback. Registry keys are the real codes from Coding.                   │
 * │                                                                             │
 * │ If you add new matching logic here, key it on `code` (exact match). Never    │
 * │ make `position`/`name` the primary key, and never synthesise a code.        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

const DH = { value: "", class: "1" } as const;

function defaultHeaviness(
  rowNumber: number,
  code: string,
  position: string,
  measurementPlace: string,
): Record<string, unknown> {
  return {
    rowNumber,
    code,
    position,
    measurementPlace,
    workDescription: HEAVINESS_WORK_DESCRIPTION,
    finalAssessment: "",
    p1_1_regional: { ...DH },
    p1_2_general_1to5: { ...DH },
    p1_2_general_over5: { ...DH },
    p2_1_alternating: { ...DH },
    p2_2_constant: { ...DH },
    p2_3_fromSurface: { ...DH },
    p2_3_fromFloor: { ...DH },
    p3_1_local: { ...DH },
    p3_2_regional: { ...DH },
    p4_1_oneHand: { ...DH },
    p4_2_twoHands: { ...DH },
    p4_3_bodyAndLegs: { ...DH },
    p5_pose: { ...DH },
    p6_bends: { ...DH },
    p7_1_horizontal: { ...DH },
    p7_2_vertical: { ...DH },
  };
}

/**
 * Heaviness sync with normative inheritance.
 *
 * IDENTITY IS THE CODE (see the BUSINESS RULE block above). Cards are matched to
 * coding rows strictly by `code` — never by position name. `position` /
 * `measurementPlace` are refreshed from coding as display data only.
 *
 * The normative part (workDescription, finalAssessment, 17 indicators) of a NEW
 * card is filled, in priority order — code first, fallbacks after:
 *   1. existing card with the same CODE → preserved verbatim (user's data);
 *   2. a CODE-pinned normative from the registry → applied automatically and
 *      beats everything below (the value is tied to that exact coding row);
 *   3. a normative pinned to the POSITION name → applied to every card of that
 *      profession, beating generic sibling inheritance;
 *   4. an already-filled sibling card in the same section → inherited (so the
 *      user fills one position and the rest of the section follows on re-sync);
 *   5. a predefined normative by section → applied;
 *   6. otherwise a blank default (no template exists — empty is allowed).
 */
function syncHeavinessWorkplaces(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const byCode = cardsByCode(d);
  const siblingBySection = firstCardBySection(d);

  let rowNumber = 1;
  const workplaces: Record<string, unknown>[] = [];
  for (const section of sections) {
    const sibling = siblingBySection.get(normalizePlaceName(section.title));
    for (const cr of section.rows) {
      const n = rowNumber++;
      const ex = byCode.get(cr.code);
      if (ex) {
        workplaces.push({ ...ex, rowNumber: n, code: cr.code, position: cr.name, measurementPlace: section.title });
        continue;
      }
      const normative =
        resolveHeavinessNormativeByCode(cr.code) ??
        resolveHeavinessNormativeByPosition(cr.name) ??
        sibling ??
        resolveHeavinessNormativeBySection(section.title);
      workplaces.push(
        normative
          ? { ...cloneCard(normative), rowNumber: n, code: cr.code, position: cr.name, measurementPlace: section.title }
          : defaultHeaviness(n, cr.code, cr.name, section.title),
      );
    }
  }

  return { ...d, workplaces };
}

// ─── Class D — Tension ────────────────────────────────────────────────────────

const DT = { value: "", class: "1" } as const;

function defaultTension(
  rowNumber: number,
  code: string,
  position: string,
  measurementPlace: string,
): Record<string, unknown> {
  return {
    rowNumber,
    code,
    position,
    measurementPlace,
    // Единый текст описания (как в heaviness). finalAssessment оставляем пустым:
    // если профессии нет ни в одном реестре нормативов, пустая итоговая оценка
    // подсветит карточку как требующую внимания, а не проставит «Допустимый».
    workDescription: TENSION_WORK_DESCRIPTION,
    finalAssessment: "",
    p1_1_content: { ...DT },
    p1_2_signals: { ...DT },
    p1_3_distribution: { ...DT },
    p1_4_character: { ...DT },
    p2_1_duration: { ...DT },
    p2_2_density: { ...DT },
    p2_3_objects: { ...DT },
    p2_4_sizeLong: { ...DT },
    p2_5_optical: { ...DT },
    p2_6_videoTerminal: { ...DT },
    p2_7_voiceLoad: { ...DT },
    p2_8_speakLoad: { ...DT },
    p3_1_responsibility: { ...DT },
    p3_2_risk: { ...DT },
    p3_3_othersRisk: { ...DT },
    p4_1_elements: { ...DT },
    p4_2_duration: { ...DT },
    p4_3_active: { ...DT },
    p4_4_passive: { ...DT },
    p5_1_duration: { ...DT },
    p5_2_shift: { ...DT },
    p5_3_breaks: { ...DT },
  };
}

/**
 * Tension sync with normative inheritance.
 *
 * IDENTITY IS THE CODE (same rule as heaviness): existing cards are matched to
 * coding rows strictly by `code`; `position` / `measurementPlace` are refreshed
 * from coding as display data only.
 *
 * The normative part of a NEW card is filled, in priority order:
 *   1. existing card with the same CODE → preserved verbatim (user's data);
 *   2. a normative pinned to the POSITION (section-aware: «секция+должность»
 *      first, then plain position name) → applied. Unlike heaviness this uses
 *      section+position instead of code, because tension profiles differ per
 *      profession (a whole section is NOT one profile), and coding codes are
 *      client-specific so they can't pin the reference profiles;
 *   3. an already-filled sibling card in the same section → inherited;
 *   4. a normative by section → applied;
 *   5. otherwise a blank default (finalAssessment empty → flags for attention).
 *
 * Note the position-normative beats the sibling (step 2 before 3): positions in
 * one section have DIFFERENT profiles (e.g. АУП has 13 distinct ones), so
 * copying the first filled neighbour would mis-fill — the registry must win.
 */
function syncTensionWorkplaces(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const byCode = cardsByCode(d);
  const siblingBySection = firstCardBySection(d);

  let rowNumber = 1;
  const workplaces: Record<string, unknown>[] = [];
  for (const section of sections) {
    const sibling = siblingBySection.get(normalizePlaceName(section.title));
    for (const cr of section.rows) {
      const n = rowNumber++;
      const ex = byCode.get(cr.code);
      if (ex) {
        workplaces.push({ ...ex, rowNumber: n, code: cr.code, position: cr.name, measurementPlace: section.title });
        continue;
      }
      const normative =
        resolveTensionNormativeByPosition(cr.name, section.title) ??
        sibling ??
        resolveTensionNormativeBySection(section.title);
      workplaces.push(
        normative
          ? { ...cloneCard(normative), rowNumber: n, code: cr.code, position: cr.name, measurementPlace: section.title }
          : defaultTension(n, cr.code, cr.name, section.title),
      );
    }
  }

  return { ...d, workplaces };
}

// ─── Orphaned place helpers (Class A) ─────────────────────────────────────────

export function getOrphanedPlaces(
  data: unknown,
  sections: CodingSection[],
): OrphanedPlace[] {
  if (!isObj(data)) return [];
  const codingTitles = new Set(sections.map((s) => s.title));
  return arr((data as Record<string, unknown>).places).flatMap((p) => {
    if (!isObj(p)) return [];
    const place = p as Record<string, unknown>;
    if (typeof place.name !== "string") return [];
    if (codingTitles.has(place.name)) return [];
    return [{ name: place.name, measurementCount: arr(place.measurements).length }];
  });
}

export function removeOrphanedPlace(data: unknown, placeName: string): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const places = arr(d.places);
  const filtered = places.filter(
    (p) => !isObj(p) || (p as Record<string, unknown>).name !== placeName,
  );
  if (filtered.length === places.length) return data;
  return { ...d, places: filtered };
}

/**
 * Row-level orphans inside places that DO still exist in the coding: a
 * position dropped from a section, or a repetition left over after its count
 * was reduced. (Whole-section orphans are reported by getOrphanedPlaces.)
 */
export function getOrphanedMeasurements(
  data: unknown,
  sections: CodingSection[],
): OrphanedMeasurement[] {
  if (!isObj(data)) return [];
  const existing = arr((data as Record<string, unknown>).places);

  // Sections grouped by title for positional pairing with duplicate titles.
  const sectionsByTitle = new Map<string, CodingSection[]>();
  for (const s of sections) {
    const bucket = sectionsByTitle.get(s.title) ?? [];
    bucket.push(s);
    sectionsByTitle.set(s.title, bucket);
  }

  const occurrence = new Map<string, number>();
  const out: OrphanedMeasurement[] = [];

  for (const p of existing) {
    if (!isObj(p)) continue;
    const place = p as Record<string, unknown>;
    if (typeof place.name !== "string") continue;
    const title = place.name;
    const idx = occurrence.get(title) ?? 0;
    occurrence.set(title, idx + 1);
    const section = (sectionsByTitle.get(title) ?? [])[idx];
    if (!section) continue; // whole-place orphan — reported elsewhere

    const requiredByCode = new Map<string, number>();
    const codeByName = new Map<string, string>();
    for (const cr of section.rows) {
      requiredByCode.set(cr.code, cr.count);
      const nk = normalizePlaceName(cr.name);
      if (!codeByName.has(nk)) codeByName.set(nk, cr.code);
    }

    const seenByCode = new Map<string, number>();
    for (const m of arr(place.measurements)) {
      if (!isObj(m)) continue;
      const row = m as Record<string, unknown>;
      let code = typeof row.code === "string" ? row.code : "";
      if (!code) {
        code = codeByName.get(normalizePlaceName(String(row.place ?? ""))) ?? "";
      }
      const required = requiredByCode.get(code);
      const n = (seenByCode.get(code) ?? 0) + 1;
      seenByCode.set(code, n);

      const reason: OrphanedMeasurement["reason"] | null =
        required === undefined ? "removed" : n > required ? "surplus" : null;
      if (!reason) continue;

      out.push({
        placeName: title,
        rowNumber: typeof row.rowNumber === "number" ? row.rowNumber : 0,
        pointNumber: typeof row.pointNumber === "string" ? row.pointNumber : "",
        position: typeof row.place === "string" ? row.place : "",
        reason,
      });
    }
  }

  return out;
}

export function removeOrphanedMeasurement(
  data: unknown,
  placeName: string,
  rowNumber: number,
): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  let changed = false;

  const newPlaces = arr(d.places).map((p) => {
    if (!isObj(p)) return p;
    const place = p as Record<string, unknown>;
    if (place.name !== placeName) return p;
    const filtered = arr(place.measurements).filter((m) => {
      if (!isObj(m)) return true;
      const drop = (m as Record<string, unknown>).rowNumber === rowNumber;
      if (drop) changed = true;
      return !drop;
    });
    return { ...place, measurements: filtered };
  });

  return changed ? { ...d, places: newPlaces } : data;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function isObj(v: unknown): v is object {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function extractPlaceNames(data: unknown): string[] {
  if (!isObj(data)) return [];
  return arr((data as Record<string, unknown>).places).flatMap((p) => {
    if (!isObj(p)) return [];
    const place = p as Record<string, unknown>;
    return typeof place.name === "string" ? [place.name] : [];
  });
}

function flattenSectionRowsByCode(
  d: Record<string, unknown>,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const sec of arr(d.sections)) {
    if (!isObj(sec)) continue;
    for (const row of arr((sec as Record<string, unknown>).rows)) {
      if (!isObj(row)) continue;
      const r = row as Record<string, unknown>;
      if (typeof r.code === "string") map.set(r.code, r);
    }
  }
  return map;
}

function extractSectionRows(data: unknown): Array<{ code: string; name: string }> {
  if (!isObj(data)) return [];
  return arr((data as Record<string, unknown>).sections).flatMap((sec) => {
    if (!isObj(sec)) return [];
    return arr((sec as Record<string, unknown>).rows).flatMap((row) => {
      if (!isObj(row)) return [];
      const r = row as Record<string, unknown>;
      if (typeof r.code !== "string") return [];
      return [{ code: r.code, name: typeof r.position === "string" ? r.position : "" }];
    });
  });
}

function extractSummaryWorkplaces(data: unknown): Array<{ code: string; name: string }> {
  if (!isObj(data)) return [];
  return arr((data as Record<string, unknown>).places).flatMap((pl) => {
    if (!isObj(pl)) return [];
    return arr((pl as Record<string, unknown>).workplaces).flatMap((wp) => {
      if (!isObj(wp)) return [];
      const w = wp as Record<string, unknown>;
      if (typeof w.code !== "string") return [];
      return [{ code: w.code, name: typeof w.profession === "string" ? w.profession : "" }];
    });
  });
}

function cardsByCode(d: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const wp of arr(d.workplaces)) {
    if (!isObj(wp)) continue;
    const w = wp as Record<string, unknown>;
    if (typeof w.code === "string") map.set(w.code, w);
  }
  return map;
}

/**
 * First existing card per section (keyed by normalised measurementPlace), used
 * as the section-level normative template for newly added positions — the
 * Class-D analogue of Class A's sectionTemplate. The user fills one card of a
 * section and every other position in it inherits on the next sync.
 */
function firstCardBySection(
  d: Record<string, unknown>,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const wp of arr(d.workplaces)) {
    if (!isObj(wp)) continue;
    const w = wp as Record<string, unknown>;
    if (typeof w.measurementPlace !== "string") continue;
    const key = normalizePlaceName(w.measurementPlace);
    if (!map.has(key)) map.set(key, w);
  }
  return map;
}

/**
 * Deep clone of a normative/template object so cloned cards never share nested
 * indicator objects — important because registry templates are module-level
 * singletons that would otherwise be mutated through the editor.
 */
function cloneCard(source: object): Record<string, unknown> {
  return structuredClone(source) as Record<string, unknown>;
}

function extractCardWorkplaces(data: unknown): Array<{ code: string; name: string }> {
  if (!isObj(data)) return [];
  return arr((data as Record<string, unknown>).workplaces).flatMap((wp) => {
    if (!isObj(wp)) return [];
    const w = wp as Record<string, unknown>;
    if (typeof w.code !== "string") return [];
    return [{ code: w.code, name: typeof w.position === "string" ? w.position : "" }];
  });
}

/**
 * Normalise a place/position name so that minor formatting differences
 * between what was typed in Coding and what is stored in measurement.place
 * (trailing spaces, dash variants, mixed case) do not break template lookup.
 */
function normalizePlaceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-–—]/g, "-");
}
