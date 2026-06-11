/**
 * Explicit workplace synchronisation from the Coding protocol.
 *
 * Class A (Lighting, EMP, Noise, Meteo) — places match coding sections and
 *   measurement rows are pruned to coding: a row whose position was removed
 *   from the section, or a repetition beyond the coding row's count, is
 *   deleted on sync (clean result, no orphan warnings). A whole section
 *   absent from coding is still kept in-place and surfaced via
 *   `getOrphanedPlaces` (renaming a section must not silently wipe its data).
 *
 * Class B (Safety, SIZ) / Class C (Summary) / Class D (Heaviness, Tension) —
 *   full structural replacement: rows / workplaces absent from coding are
 *   deleted; existing rows whose coding row still exists have their identity
 *   fields updated and their protocol-specific data preserved.
 *
 * ┌─ IDENTITY MODEL ───────────────────────────────────────────────────────────┐
 * │ The stable identity of a coding row is its hidden `id` (CodingRow.id),      │
 * │ mirrored on dependent rows as `codingRowId`. The CODE is a derived,         │
 * │ positional display value ("01" + section + row, see workplaceCodes.ts) and  │
 * │ is renumbered whenever rows are added / deleted / moved — so it must NEVER  │
 * │ be the primary matching key.                                                │
 * │                                                                             │
 * │ All matching here is two-pass (claimByIdentity): id first, then code only   │
 * │ among rows not claimed by an id. The code fallback exists solely for        │
 * │ legacy rows persisted before ids were introduced. On every sync the         │
 * │ display `code` of matched rows is refreshed from coding and `codingRowId`   │
 * │ is adopted, so legacy data converges to id-linking after one pass.          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { CodingRow, CodingSection } from "@/types/coding";
import { formatWorkplaceCode } from "@/lib/docs/workplaceCodes";
import {
  computeSummaryValuesDiff,
  mergeSummaryValues,
} from "@/lib/docs/syncSummaryValues";
import {
  HEAVINESS_WORK_DESCRIPTION,
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
  /**
   * Summary only: actual / norm cells that will be filled or overwritten
   * from the measurement protocols (lighting / emp / noise / meteo).
   */
  valuesToUpdate?: number;
  /** Summary only: factor rows that will be created from the protocols. */
  factorsToAdd?: number;
}

export interface OrphanedPlace {
  name: string;
  measurementCount: number;
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
        const id =
          typeof row.id === "string" && row.id !== "" ? row.id : undefined;
        rows.push(
          id !== undefined
            ? { id, code: row.code, name: row.name, count: row.count }
            : { code: row.code, name: row.name, count: row.count },
        );
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
  bundle?: Record<string, unknown> | null,
): SyncDiff {
  if (CLASS_A_KEYS.has(key)) return diffClassA(data, sections);
  if (key === "safety" || key === "siz") return diffFlatSections(data, sections);
  if (key === "summary") {
    const structural = diffSummary(data, sections);
    if (!bundle) return structural;
    // Values are merged AFTER the structural sync, so the honest count is
    // computed against the structurally-synced result (new workplaces from
    // coding receive their values in the same confirmed action).
    const afterStructural =
      sections.length > 0 ? syncSummaryPlaces(data, sections) : data;
    const values = computeSummaryValuesDiff(afterStructural, bundle);
    return { ...structural, ...values };
  }
  if (key === "heaviness" || key === "tension") return diffCardWorkplaces(data, sections);
  return { toAdd: 0, toUpdate: 0, toDelete: [] };
}

function diffClassA(data: unknown, sections: CodingSection[]): SyncDiff {
  const existing = new Set(extractPlaceNames(data));
  const toAdd = sections.filter((s) => !existing.has(s.title)).length;
  const toUpdate = sections.filter((s) => existing.has(s.title)).length;
  return { toAdd, toUpdate, toDelete: [] };
}

/** Shared diff for one flat list of existing rows matched via claimByIdentity. */
function diffByIdentity(
  sections: CodingSection[],
  existing: Record<string, unknown>[],
  nameKey: "position" | "profession",
): SyncDiff {
  const { byRow, unclaimed } = claimByIdentity(sections, existing, nameKey);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  return {
    toAdd: total - byRow.size,
    toUpdate: byRow.size,
    toDelete: unclaimed.map((r) => ({
      code: codeOf(r),
      name: typeof r[nameKey] === "string" ? (r[nameKey] as string) : "",
    })),
  };
}

function diffFlatSections(data: unknown, sections: CodingSection[]): SyncDiff {
  return diffByIdentity(sections, extractFlatSectionRows(data), "position");
}

function diffSummary(data: unknown, sections: CodingSection[]): SyncDiff {
  return diffByIdentity(sections, extractSummaryWorkplaceRows(data), "profession");
}

function diffCardWorkplaces(data: unknown, sections: CodingSection[]): SyncDiff {
  return diffByIdentity(sections, extractWorkplaceCards(data), "position");
}

// ─── Sync dispatcher ──────────────────────────────────────────────────────────

export function syncProtocolFromCoding(
  key: string,
  data: unknown,
  sections: CodingSection[],
  bundle?: Record<string, unknown> | null,
): unknown {
  if (sections.length === 0) return data;
  if (CLASS_A_KEYS.has(key)) return syncMeasurementPlaces(key, data, sections);
  if (key === "safety") return syncSafetyRows(data, sections);
  if (key === "siz") return syncSizRows(data, sections);
  if (key === "summary") {
    // Phase 1 — structure from coding; phase 2 — measured values from the
    // lighting / emp / noise / meteo slots of the same attestation bundle.
    const structural = syncSummaryPlaces(data, sections);
    return bundle ? mergeSummaryValues(structural, bundle) : structural;
  }
  if (key === "heaviness") return syncHeavinessWorkplaces(data, sections);
  if (key === "tension") return syncTensionWorkplaces(data, sections);
  return data;
}

// ─── Class A — Measurement protocols ─────────────────────────────────────────

/**
 * Unified Class A synchronisation. One algorithm, identical for every
 * position — no position-specific special cases.
 *
 * Identity (Q1): the coding row's stable `id`, persisted on every measurement
 *   as `codingRowId`. Legacy rows are resolved by display code, then by
 *   position name within the same section, and adopt the id on first sync.
 *   After that the id is authoritative: codes can be renumbered and positions
 *   renamed in coding without losing data, and the same name in two sections
 *   never collides (different ids).
 *
 * Existing rows (Q2 = destructive cleanup): stored measurements are regrouped
 *   into CODING ORDER and pruned to coding — rows of one coding row stay
 *   together in stored relative order up to its count; repetitions beyond the
 *   count and rows whose position was removed from the section are dropped.
 *   The sync result therefore always matches coding exactly, with no orphans.
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

    // Resolution maps for this section: stable id first, then display code,
    // then position name (both fallbacks serve rows that predate ids).
    const resolve = buildSectionResolver(section);

    // Carry stored rows forward, bucketed by coding row — DESTRUCTIVELY:
    // coding is the single source of truth, so rows that no longer map to it
    // are dropped on sync (no orphans, no warnings). Two cases are pruned:
    //   • a position removed from the section → its row is dropped;
    //   • a repetition beyond the coding row's count → dropped (codes are
    //     plain row indexes; «Количество» 0|1 governs how many rows survive).
    // Kept rows adopt the coding row's id and CURRENT code.
    const rowsByCr = new Map<CodingRow, Record<string, unknown>[]>();
    let sectionTemplate: Record<string, unknown> | undefined;
    if (ex) {
      for (const m of arr(ex.measurements)) {
        if (!isObj(m)) continue;
        const row = m as Record<string, unknown>;
        // Any stored row can seed section-level conditions for new rows,
        // even one that is about to be pruned (it still carries the right
        // workCategory / measured baseline for the section).
        if (!sectionTemplate) sectionTemplate = row;
        const cr = resolve(row);
        if (!cr) continue; // position removed from coding → drop
        const bucket = rowsByCr.get(cr) ?? [];
        if (bucket.length >= cr.count) continue; // surplus repetition → drop
        bucket.push({ ...row, codingRowId: cr.id ?? "", code: cr.code });
        rowsByCr.set(cr, bucket);
      }
    }

    // Rebuild the table in CODING ORDER: each coding row's surviving stored
    // measurements (relative order preserved) followed by rows created for
    // the remaining count — so the code column reads 001, 002, 003… down
    // the table and a new section always starts at 001. A coding row with
    // count = 0 is present in coding but not measured — no measurement row
    // is created for it. Pruned rows (removed positions / surplus) are gone.
    //
    // rowNumber / pointNumber are assigned by the global renumbering pass
    // after the whole result is built, so the value passed here (0) is just a
    // placeholder and is never read.
    const merged: Record<string, unknown>[] = [];
    for (const cr of section.rows) {
      const bucket = rowsByCr.get(cr) ?? [];
      merged.push(...bucket);
      const sameWorkplace = bucket[0];
      for (let i = bucket.length; i < cr.count; i++) {
        const code = cr.code;
        let built: Record<string, unknown>;
        if (sameWorkplace) {
          // Repetition of an existing workplace → full clone incl. measured.
          built = buildRow(key, sameWorkplace, 0, code, cr.name, true);
        } else if (sectionTemplate) {
          // Position new to a populated section → inherit the first row of
          // THIS section, including its measured reading (positions in one
          // section share the same category/conditions, e.g. all АУП = А-1).
          built = buildRow(key, sectionTemplate, 0, code, cr.name, true);
        } else {
          // Empty section → blank default, nothing to inherit from.
          built = buildRow(key, undefined, 0, code, cr.name, false);
        }
        // The id must always be stamped explicitly: templates are clones of
        // OTHER rows and would otherwise leak their own codingRowId.
        merged.push({ ...built, codingRowId: cr.id ?? "" });
      }
    }

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

/**
 * Травмобезопасность — ИСКЛЮЧЕНИЕ из модели кодов-диапазонов: код в этой
 * таблице — построчный порядковый номер раздела ("01" + раздел + № строки),
 * БЕЗ резервирования номеров под count. В легаси-документе клиента
 * («12. Травма…») код собирался полем Word `SEQ` — сквозным автонумератором
 * строк, поэтому колонка обязана читаться 001, 002, 003… без дыр, даже когда
 * у должности count > 1 (повторы здесь свёрнуты в одну строку с количеством).
 * Идентичность строк по-прежнему codingRowId; позиционный код — display-only.
 */
function syncSafetyRows(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const { byRow } = claimByIdentity(sections, extractFlatSectionRows(d));

  const newSections = sections.map((section) => ({
    number: section.number,
    title: `${section.number}. ${section.title}`,
    rows: section.rows.map((cr, i) => {
      // Построчный код перекрывает базовый код кодировки из linkFields.
      const code = formatWorkplaceCode(section.number, i + 1);
      const ex = byRow.get(cr);
      return ex
        ? { ...ex, ...linkFields(cr), code, position: cr.name, count: cr.count }
        : {
            ...linkFields(cr),
            code,
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
  const { byRow } = claimByIdentity(sections, extractFlatSectionRows(d));

  const newSections = sections.map((section) => ({
    number: section.number,
    title: `${section.number}. ${section.title}`,
    rows: section.rows.map((cr) => {
      const ex = byRow.get(cr);
      return ex
        ? { ...ex, ...linkFields(cr), position: cr.name, count: cr.count }
        : {
            ...linkFields(cr),
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
  const { byRow } = claimByIdentity(
    sections,
    extractSummaryWorkplaceRows(d),
    "profession",
  );

  const newPlaces = sections.map((section) => ({
    number: section.number,
    name: section.title,
    workplaces: section.rows.map((cr) => {
      const ex = byRow.get(cr);
      return ex
        ? { ...ex, ...linkFields(cr), profession: cr.name, count: cr.count }
        : { ...linkFields(cr), profession: cr.name, count: cr.count, factors: [] };
    }),
  }));

  return { ...d, places: newPlaces };
}

// ─── Class D — Heaviness ──────────────────────────────────────────────────────

/**
 * ┌─ BUSINESS RULE — DO NOT BREAK ─────────────────────────────────────────────┐
 * │ The coding row's stable `id` (mirrored as `codingRowId`) is the single      │
 * │ source of truth for a position in the Heaviness (and Tension) protocol.     │
 * │                                                                             │
 * │ • The CODE is a derived, positional display value ("01" + section + row,    │
 * │   see workplaceCodes.ts). It is renumbered when rows are added / deleted /  │
 * │   moved, so matching by code would shift user data onto neighbouring        │
 * │   positions after any structural edit. Code matching exists ONLY as the     │
 * │   legacy fallback inside claimByIdentity for cards that predate ids.        │
 * │ • The position NAME is display data, NOT a key. Names repeat across the     │
 * │   coding (e.g. «Технолог оператор» exists in both АУП and production), so   │
 * │   matching by name would silently cross-contaminate cards.                  │
 * │ • Normative templates are keyed by section+position name                    │
 * │   (`resolveHeavinessNormativeByPosition`) — they may not be keyed by code,  │
 * │   because positional codes are client-specific and unstable by design.     │
 * │                                                                             │
 * │ If you add new matching logic here, key it on `codingRowId` (exact match).  │
 * │ Never make `position`/`name`/`code` the primary key.                        │
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
 * IDENTITY IS THE CODING-ROW ID (see the BUSINESS RULE block above). Cards are
 * matched to coding rows via claimByIdentity — id first, legacy code fallback.
 * `code` / `position` / `measurementPlace` are refreshed from coding as
 * display data only.
 *
 * The normative part (workDescription, finalAssessment, 17 indicators) of a NEW
 * card is filled, in priority order:
 *   1. existing card claimed by the same coding row → preserved verbatim
 *      (user's data);
 *   2. a normative pinned to the POSITION (section-aware: «секция+должность»
 *      first, then plain position name) → applied, beating generic sibling
 *      inheritance. Section-aware keys disambiguate same-named positions in
 *      different sections (e.g. «Технолог оператор» АУП ≠ производство);
 *   3. an already-filled sibling card in the same section → inherited (so the
 *      user fills one position and the rest of the section follows on re-sync);
 *   4. a predefined normative by section → applied;
 *   5. otherwise a blank default (no template exists — empty is allowed).
 */
function syncHeavinessWorkplaces(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const { byRow } = claimByIdentity(sections, extractWorkplaceCards(d));
  const siblingBySection = firstCardBySection(d);

  let rowNumber = 1;
  const workplaces: Record<string, unknown>[] = [];
  for (const section of sections) {
    const sibling = siblingBySection.get(normalizePlaceName(section.title));
    for (const cr of section.rows) {
      const n = rowNumber++;
      const ex = byRow.get(cr);
      if (ex) {
        workplaces.push({ ...ex, rowNumber: n, ...linkFields(cr), position: cr.name, measurementPlace: section.title });
        continue;
      }
      const normative =
        resolveHeavinessNormativeByPosition(cr.name, section.title) ??
        sibling ??
        resolveHeavinessNormativeBySection(section.title);
      workplaces.push(
        normative
          ? { ...cloneCard(normative), rowNumber: n, ...linkFields(cr), position: cr.name, measurementPlace: section.title }
          : { ...defaultHeaviness(n, cr.code, cr.name, section.title), ...linkFields(cr) },
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
 * IDENTITY IS THE CODING-ROW ID (same rule as heaviness): existing cards are
 * matched via claimByIdentity — id first, legacy code fallback. `code` /
 * `position` / `measurementPlace` are refreshed from coding as display data.
 *
 * The normative part of a NEW card is filled, in priority order:
 *   1. existing card claimed by the same coding row → preserved verbatim;
 *   2. a normative pinned to the POSITION (section-aware: «секция+должность»
 *      first, then plain position name) → applied. Section+position is used
 *      because tension profiles differ per profession (a whole section is NOT
 *      one profile), and positional codes are client-specific and unstable so
 *      they can't pin the reference profiles;
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
  const { byRow } = claimByIdentity(sections, extractWorkplaceCards(d));
  const siblingBySection = firstCardBySection(d);

  let rowNumber = 1;
  const workplaces: Record<string, unknown>[] = [];
  for (const section of sections) {
    const sibling = siblingBySection.get(normalizePlaceName(section.title));
    for (const cr of section.rows) {
      const n = rowNumber++;
      const ex = byRow.get(cr);
      if (ex) {
        workplaces.push({ ...ex, rowNumber: n, ...linkFields(cr), position: cr.name, measurementPlace: section.title });
        continue;
      }
      const normative =
        resolveTensionNormativeByPosition(cr.name, section.title) ??
        sibling ??
        resolveTensionNormativeBySection(section.title);
      workplaces.push(
        normative
          ? { ...cloneCard(normative), rowNumber: n, ...linkFields(cr), position: cr.name, measurementPlace: section.title }
          : { ...defaultTension(n, cr.code, cr.name, section.title), ...linkFields(cr) },
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

/** Existing row's coding-row link (codingRowId), "" when absent. */
function linkIdOf(row: Record<string, unknown>): string {
  return typeof row.codingRowId === "string" ? row.codingRowId : "";
}

/** Existing row's display code, "" when absent. */
function codeOf(row: Record<string, unknown>): string {
  return typeof row.code === "string" ? row.code : "";
}

/** Identity fields stamped from a coding row onto a dependent row. */
function linkFields(cr: CodingRow): Record<string, unknown> {
  return cr.id !== undefined
    ? { codingRowId: cr.id, code: cr.code }
    : { code: cr.code };
}

/**
 * Two-pass matching of existing protocol rows to coding rows.
 *
 * Pass 1 — stable identity: a row whose `codingRowId` equals a coding row's
 *   `id` belongs to that coding row regardless of its display code. This is
 *   what keeps user data pinned to its position when codes are renumbered:
 *   deleting or moving a coding row never shifts neighbours' data.
 * Pass 2 — code fallback for rows without a live id link (legacy rows, or
 *   rows whose ids point to a re-created coding). The fallback is guarded by
 *   the position NAME: positional codes are reassigned to neighbours after a
 *   deletion, so a bare code match could hand one position's data to another.
 *   A code match with a different name is rejected. Duplicate codes pair
 *   positionally (Nth ↔ Nth).
 *
 * Returns the per-coding-row claim map plus the unclaimed leftovers (the
 * delete candidates for Class B/C/D).
 */
function claimByIdentity(
  sections: readonly CodingSection[],
  existing: readonly Record<string, unknown>[],
  nameKey: "position" | "profession" = "position",
): {
  byRow: Map<CodingRow, Record<string, unknown>>;
  unclaimed: Record<string, unknown>[];
} {
  const crs = sections.flatMap((s) => s.rows);
  const byRow = new Map<CodingRow, Record<string, unknown>>();
  const claimed = new Set<Record<string, unknown>>();

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of existing) {
    const id = linkIdOf(item);
    if (id !== "" && !byId.has(id)) byId.set(id, item);
  }
  for (const cr of crs) {
    if (cr.id === undefined) continue;
    const item = byId.get(cr.id);
    if (item !== undefined && !claimed.has(item)) {
      byRow.set(cr, item);
      claimed.add(item);
    }
  }

  const byCode = new Map<string, Record<string, unknown>[]>();
  for (const item of existing) {
    if (claimed.has(item)) continue;
    const code = codeOf(item);
    if (code === "") continue;
    const bucket = byCode.get(code);
    if (bucket) bucket.push(item);
    else byCode.set(code, [item]);
  }
  for (const cr of crs) {
    if (byRow.has(cr)) continue;
    const bucket = byCode.get(cr.code);
    if (!bucket) continue;
    const crName = normalizePlaceName(cr.name);
    const idx = bucket.findIndex((item) => {
      const name = item[nameKey];
      // Malformed rows without a name are accepted by code alone.
      if (typeof name !== "string" || name === "") return true;
      return normalizePlaceName(name) === crName;
    });
    if (idx === -1) continue;
    const [item] = bucket.splice(idx, 1);
    byRow.set(cr, item);
    claimed.add(item);
  }

  return { byRow, unclaimed: existing.filter((i) => !claimed.has(i)) };
}

/**
 * Per-section resolver for Class A measurement rows: stable id first, then
 * code+name, then position name alone (the fallbacks serve rows without a
 * live id link). The code fallback is name-guarded for the same reason as in
 * claimByIdentity: positional codes migrate to neighbouring rows after a
 * deletion, so a bare code match would attribute an orphaned measurement to
 * whichever position inherited its code. The name fallback is
 * OCCURRENCE-AWARE: repeated positions are separate coding rows now, so the
 * n-th id-less row named X binds to the n-th coding row named X instead of
 * piling every repetition onto the first one. Returns the coding row a
 * measurement belongs to, if any.
 */
function buildSectionResolver(
  section: CodingSection,
): (row: Record<string, unknown>) => CodingRow | undefined {
  const byId = new Map<string, CodingRow>();
  const byCodeAndName = new Map<string, CodingRow>();
  const byName = new Map<string, CodingRow[]>();
  for (const cr of section.rows) {
    if (cr.id !== undefined && !byId.has(cr.id)) byId.set(cr.id, cr);
    const nk = normalizePlaceName(cr.name);
    const ck = `${cr.code}|${nk}`;
    if (!byCodeAndName.has(ck)) byCodeAndName.set(ck, cr);
    const bucket = byName.get(nk);
    if (bucket) bucket.push(cr);
    else byName.set(nk, [cr]);
  }
  const nameSeen = new Map<string, number>();
  return (row) => {
    const id = linkIdOf(row);
    if (id !== "") {
      const cr = byId.get(id);
      if (cr) return cr;
    }
    const nk = normalizePlaceName(String(row.place ?? ""));
    const code = codeOf(row);
    if (code !== "") {
      const cr = byCodeAndName.get(`${code}|${nk}`);
      if (cr) return cr;
    }
    const bucket = byName.get(nk);
    if (!bucket) return undefined;
    const n = nameSeen.get(nk) ?? 0;
    nameSeen.set(nk, n + 1);
    return bucket[Math.min(n, bucket.length - 1)];
  };
}

/** All safety / siz rows as one flat list of raw row objects. */
function extractFlatSectionRows(data: unknown): Record<string, unknown>[] {
  if (!isObj(data)) return [];
  return arr((data as Record<string, unknown>).sections).flatMap((sec) => {
    if (!isObj(sec)) return [];
    return arr((sec as Record<string, unknown>).rows).flatMap((row) =>
      isObj(row) ? [row as Record<string, unknown>] : [],
    );
  });
}

/** All summary workplaces as one flat list of raw row objects. */
function extractSummaryWorkplaceRows(data: unknown): Record<string, unknown>[] {
  if (!isObj(data)) return [];
  return arr((data as Record<string, unknown>).places).flatMap((pl) => {
    if (!isObj(pl)) return [];
    return arr((pl as Record<string, unknown>).workplaces).flatMap((wp) =>
      isObj(wp) ? [wp as Record<string, unknown>] : [],
    );
  });
}

/** All heaviness / tension cards as one flat list of raw card objects. */
function extractWorkplaceCards(data: unknown): Record<string, unknown>[] {
  if (!isObj(data)) return [];
  return arr((data as Record<string, unknown>).workplaces).flatMap((wp) =>
    isObj(wp) ? [wp as Record<string, unknown>] : [],
  );
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
