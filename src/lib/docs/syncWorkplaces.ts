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
  if (CLASS_A_KEYS.has(key)) return syncMeasurementPlaces(data, sections);
  if (key === "safety") return syncSafetyRows(data, sections);
  if (key === "siz") return syncSizRows(data, sections);
  if (key === "summary") return syncSummaryPlaces(data, sections);
  if (key === "heaviness") return syncHeavinessWorkplaces(data, sections);
  if (key === "tension") return syncTensionWorkplaces(data, sections);
  return data;
}

// ─── Class A — Measurement protocols ─────────────────────────────────────────

function syncMeasurementPlaces(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const existing = arr(d.places);

  const byName = new Map<string, Record<string, unknown>>();
  for (const p of existing) {
    if (!isObj(p)) continue;
    const place = p as Record<string, unknown>;
    if (typeof place.name === "string") byName.set(place.name, place);
  }

  const codingTitles = new Set(sections.map((s) => s.title));

  // Coding sections in coding order, preserving measurements for matches
  const result: Record<string, unknown>[] = sections.map((section) => {
    const ex = byName.get(section.title);
    return {
      number: section.number,
      name: section.title,
      measurements: ex ? arr(ex.measurements) : [],
    };
  });

  // Orphaned places appended at the end (not deleted)
  for (const p of existing) {
    if (!isObj(p)) continue;
    const place = p as Record<string, unknown>;
    if (typeof place.name === "string" && !codingTitles.has(place.name)) {
      result.push(place);
    }
  }

  return { ...d, places: result };
}

// ─── Class B — Safety ─────────────────────────────────────────────────────────

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
            equipment: "",
            documentation: "",
            result: "",
            nonComplianceReasons: "",
            finalNote: "",
          };
    }),
  }));

  return { ...d, sections: newSections };
}

// ─── Class B — SIZ ───────────────────────────────────────────────────────────

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
            normItems: "",
            issuedFact: "",
            certificate: "",
            assessment: "",
            note: "",
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
    workDescription: "",
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

function syncHeavinessWorkplaces(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const byCode = cardsByCode(d);

  let rowNumber = 1;
  const workplaces: Record<string, unknown>[] = [];
  for (const section of sections) {
    for (const cr of section.rows) {
      const ex = byCode.get(cr.code);
      workplaces.push(
        ex
          ? { ...ex, rowNumber: rowNumber++, code: cr.code, position: cr.name, measurementPlace: section.title }
          : defaultHeaviness(rowNumber++, cr.code, cr.name, section.title),
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
    workDescription: "",
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

function syncTensionWorkplaces(data: unknown, sections: CodingSection[]): unknown {
  if (!isObj(data)) return data;
  const d = data as Record<string, unknown>;
  const byCode = cardsByCode(d);

  let rowNumber = 1;
  const workplaces: Record<string, unknown>[] = [];
  for (const section of sections) {
    for (const cr of section.rows) {
      const ex = byCode.get(cr.code);
      workplaces.push(
        ex
          ? { ...ex, rowNumber: rowNumber++, code: cr.code, position: cr.name, measurementPlace: section.title }
          : defaultTension(rowNumber++, cr.code, cr.name, section.title),
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

function extractCardWorkplaces(data: unknown): Array<{ code: string; name: string }> {
  if (!isObj(data)) return [];
  return arr((data as Record<string, unknown>).workplaces).flatMap((wp) => {
    if (!isObj(wp)) return [];
    const w = wp as Record<string, unknown>;
    if (typeof w.code !== "string") return [];
    return [{ code: w.code, name: typeof w.position === "string" ? w.position : "" }];
  });
}
