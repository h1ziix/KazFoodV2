/**
 * Value synchronisation for the Summary protocol («Сводный протокол»).
 *
 * Pulls measured values from the four measurement protocols of the same
 * attestation bundle — Lighting, EMP, Noise, Meteo — into the summary's
 * factor rows. Runs as the second phase of the summary's «Синхронизировать»
 * action, after the structural sync from coding (syncWorkplaces.ts).
 *
 * Rules (agreed with the client):
 *   - the measurement protocols are the source of truth: non-empty source
 *     values OVERWRITE `actual` / `norm` in the summary;
 *   - empty source values never wipe already-filled summary values;
 *   - `classValue` is never computed or touched (expert judgement);
 *   - missing factor rows are created (canonical name + ГОСТ method, empty
 *     class), existing rows are updated in place;
 *   - workplace ↔ measurement matching follows the identity discipline of
 *     syncWorkplaces.ts: stable codingRowId first, then code+name fallback
 *     for legacy rows; with count > 1 the FIRST measurement of a coding row
 *     wins (repetitions share one summary row).
 *
 * The module is pure and idempotent; object identity is preserved when
 * nothing changes so callers can use `!==` to detect modifications.
 */

// ─── Canonical factor registry ────────────────────────────────────────────────

type FactorKey =
  | "light"
  | "temp"
  | "humidity"
  | "noise"
  | "ep1"
  | "ep2"
  | "mp1"
  | "mp2";

interface FactorSpec {
  key: FactorKey;
  /** Canonical row name as in the reference DOCX / example data. */
  name: string;
  /** Measurement-method ГОСТ stamped on newly created rows. */
  method: string;
  /** Normalised name prefixes that recognise an existing factor row. */
  aliases: readonly string[];
}

/** Canonical creation order — mirrors officeFactors in the example data. */
const FACTOR_SPECS: readonly FactorSpec[] = [
  {
    key: "light",
    name: "Освещение, лк",
    method: "ГОСТ 24940-96",
    aliases: ["освещение", "освещенность"],
  },
  {
    key: "temp",
    name: "Температура, ºС",
    method: "ГОСТ 12.1.005-88",
    aliases: ["температура"],
  },
  {
    key: "humidity",
    name: "Влажность, %",
    method: "ГОСТ 12.1.005-88",
    aliases: ["влажность"],
  },
  {
    key: "noise",
    name: "Шум, дБа",
    method: "ГОСТ ISO 9612-2016",
    aliases: ["шум"],
  },
  {
    key: "ep1",
    name: "ЭП диапазон 1, В/м",
    method: "ГОСТ 12.1006-84",
    aliases: ["эп диапазон 1"],
  },
  {
    key: "ep2",
    name: "ЭП диапазон 2, В/м",
    method: "ГОСТ 12.1006-84",
    aliases: ["эп диапазон 2"],
  },
  {
    key: "mp1",
    name: "МП диапазон 1, мкТл",
    method: "ГОСТ 12.1006-84",
    aliases: ["мп диапазон 1"],
  },
  {
    key: "mp2",
    name: "МП диапазон 2, нТл",
    method: "ГОСТ 12.1006-84",
    aliases: ["мп диапазон 2"],
  },
];

/** Source value for one factor of one workplace. Empty strings = no data. */
interface FactorValue {
  actual: string;
  norm: string;
}

type FactorValues = Partial<Record<FactorKey, FactorValue>>;

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SummaryValuesDiff {
  /** actual / norm cells that will receive a different value. */
  valuesToUpdate: number;
  /** Factor rows that will be created. */
  factorsToAdd: number;
}

/**
 * Merge measured values from the bundle's lighting / emp / noise / meteo
 * slots into the summary document. Returns the input reference when nothing
 * changes.
 */
export function mergeSummaryValues(
  summaryData: unknown,
  bundle: Record<string, unknown> | null | undefined,
): unknown {
  return runMerge(summaryData, bundle).result;
}

/** Dry-run counterpart of mergeSummaryValues for the confirm panel. */
export function computeSummaryValuesDiff(
  summaryData: unknown,
  bundle: Record<string, unknown> | null | undefined,
): SummaryValuesDiff {
  const { valuesToUpdate, factorsToAdd } = runMerge(summaryData, bundle);
  return { valuesToUpdate, factorsToAdd };
}

// ─── Merge core ───────────────────────────────────────────────────────────────

interface MergeOutcome extends SummaryValuesDiff {
  result: unknown;
}

function runMerge(
  summaryData: unknown,
  bundle: Record<string, unknown> | null | undefined,
): MergeOutcome {
  const noop: MergeOutcome = {
    result: summaryData,
    valuesToUpdate: 0,
    factorsToAdd: 0,
  };
  if (!isObj(summaryData) || !bundle) return noop;
  const places = summaryData.places;
  if (!Array.isArray(places)) return noop;

  const sources = collectSources(bundle);
  if (sources.byId.size === 0 && sources.byCodeAndName.size === 0) return noop;

  let valuesToUpdate = 0;
  let factorsToAdd = 0;
  let changed = false;

  const newPlaces = places.map((place) => {
    if (!isObj(place) || !Array.isArray(place.workplaces)) return place;
    let placeChanged = false;
    const workplaces = place.workplaces.map((wp) => {
      if (!isObj(wp)) return wp;
      const values = lookupValues(wp, sources);
      if (!values) return wp;
      const outcome = upsertFactors(wp, values);
      valuesToUpdate += outcome.valuesToUpdate;
      factorsToAdd += outcome.factorsToAdd;
      if (outcome.workplace !== wp) placeChanged = true;
      return outcome.workplace;
    });
    if (!placeChanged) return place;
    changed = true;
    return { ...place, workplaces };
  });

  return {
    result: changed ? { ...summaryData, places: newPlaces } : summaryData,
    valuesToUpdate,
    factorsToAdd,
  };
}

/**
 * Update / create the factor rows of one workplace from the source values.
 * Existing rows are recognised by normalised name prefix; missing rows are
 * appended in canonical FACTOR_SPECS order. Per cell: a non-empty source
 * value overwrites, an empty one never wipes existing data.
 */
function upsertFactors(
  wp: Record<string, unknown>,
  values: FactorValues,
): { workplace: Record<string, unknown>; valuesToUpdate: number; factorsToAdd: number } {
  const factors = Array.isArray(wp.factors) ? wp.factors : [];
  const consumed = new Set<FactorKey>();
  let valuesToUpdate = 0;
  let rowsChanged = false;

  const updated = factors.map((row) => {
    if (!isObj(row) || typeof row.name !== "string") return row;
    const spec = recogniseFactor(row.name);
    if (!spec || consumed.has(spec.key)) return row;
    const src = values[spec.key];
    if (!src) return row;
    consumed.add(spec.key);

    const oldActual = typeof row.actual === "string" ? row.actual : "";
    const oldNorm = typeof row.norm === "string" ? row.norm : "";
    const nextActual = src.actual !== "" ? src.actual : oldActual;
    const nextNorm = src.norm !== "" ? src.norm : oldNorm;
    if (nextActual === oldActual && nextNorm === oldNorm) return row;

    if (nextActual !== oldActual) valuesToUpdate += 1;
    if (nextNorm !== oldNorm) valuesToUpdate += 1;
    rowsChanged = true;
    return { ...row, actual: nextActual, norm: nextNorm };
  });

  const appended: Record<string, unknown>[] = [];
  for (const spec of FACTOR_SPECS) {
    if (consumed.has(spec.key)) continue;
    const src = values[spec.key];
    if (!src || (src.actual === "" && src.norm === "")) continue;
    appended.push({
      name: spec.name,
      method: spec.method,
      norm: src.norm,
      actual: src.actual,
      classValue: "",
    });
  }

  if (!rowsChanged && appended.length === 0) {
    return { workplace: wp, valuesToUpdate: 0, factorsToAdd: 0 };
  }
  return {
    workplace: { ...wp, factors: [...updated, ...appended] },
    valuesToUpdate,
    factorsToAdd: appended.length,
  };
}

// ─── Source extraction (lighting / emp / noise / meteo) ──────────────────────

interface SourceIndexes {
  /** codingRowId → merged factor values of the FIRST measurement per row. */
  byId: Map<string, FactorValues>;
  /** "code|normalised place name" → values, legacy fallback (name-guarded). */
  byCodeAndName: Map<string, FactorValues>;
}

function collectSources(bundle: Record<string, unknown>): SourceIndexes {
  const byId = new Map<string, FactorValues>();
  const byCodeAndName = new Map<string, FactorValues>();

  const add = (
    m: Record<string, unknown>,
    values: FactorValues,
  ): void => {
    if (Object.keys(values).length === 0) return;
    const id = typeof m.codingRowId === "string" ? m.codingRowId : "";
    const code = typeof m.code === "string" ? m.code : "";
    const place = typeof m.place === "string" ? m.place : "";
    // First measurement of a coding row wins (count > 1 repetitions share
    // one summary row) — later occurrences only fill keys still missing.
    if (id !== "") mergeInto(byId, id, values);
    if (code !== "" && place !== "") {
      mergeInto(byCodeAndName, `${code}|${normalizeName(place)}`, values);
    }
  };

  forEachMeasurement(bundle["lighting"], (m) => add(m, lightingValues(m)));
  forEachMeasurement(bundle["noise"], (m) => add(m, noiseValues(m)));
  forEachMeasurement(bundle["meteo"], (m) => add(m, meteoValues(m)));
  forEachMeasurement(bundle["emp"], (m) => add(m, empValues(m)));

  return { byId, byCodeAndName };
}

/**
 * First-wins merge per factor key: an already-recorded key is kept, so the
 * first measurement of a coding row stays authoritative while measurements
 * from OTHER protocols still contribute their own keys.
 */
function mergeInto(
  map: Map<string, FactorValues>,
  key: string,
  values: FactorValues,
): void {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...values });
    return;
  }
  for (const [k, v] of Object.entries(values) as [FactorKey, FactorValue][]) {
    if (!existing[k]) existing[k] = v;
  }
}

/** Walk places[].measurements[] of one Class A protocol slot. */
function forEachMeasurement(
  doc: unknown,
  visit: (m: Record<string, unknown>) => void,
): void {
  if (!isObj(doc) || !Array.isArray(doc.places)) return;
  for (const place of doc.places) {
    if (!isObj(place) || !Array.isArray(place.measurements)) continue;
    for (const m of place.measurements) {
      if (isObj(m)) visit(m);
    }
  }
}

function lightingValues(m: Record<string, unknown>): FactorValues {
  const actual = numStr(m.measured);
  const norm = numStr(m.allowed);
  if (actual === "" && norm === "") return {};
  return { light: { actual, norm } };
}

function noiseValues(m: Record<string, unknown>): FactorValues {
  const actual = str(m.measured);
  const norm = str(m.allowed);
  if (actual === "" && norm === "") return {};
  return { noise: { actual, norm } };
}

function meteoValues(m: Record<string, unknown>): FactorValues {
  const out: FactorValues = {};
  const temp: FactorValue = { actual: str(m.tempMeasured), norm: str(m.tempAllowed) };
  const hum: FactorValue = {
    actual: str(m.humidityMeasured),
    norm: str(m.humidityAllowed),
  };
  if (temp.actual !== "" || temp.norm !== "") out.temp = temp;
  if (hum.actual !== "" || hum.norm !== "") out.humidity = hum;
  return out;
}

function empValues(m: Record<string, unknown>): FactorValues {
  const out: FactorValues = {};
  const ranges: Array<[unknown, FactorKey, FactorKey]> = [
    [m.range1, "ep1", "mp1"],
    [m.range2, "ep2", "mp2"],
  ];
  for (const [range, epKey, mpKey] of ranges) {
    if (!isObj(range)) continue;
    const ep: FactorValue = {
      actual: str(range.electricMeasured),
      norm: str(range.electricAllowed),
    };
    const mp: FactorValue = {
      actual: str(range.magneticMeasured),
      norm: str(range.magneticAllowed),
    };
    if (ep.actual !== "" || ep.norm !== "") out[epKey] = ep;
    if (mp.actual !== "" || mp.norm !== "") out[mpKey] = mp;
  }
  return out;
}

// ─── Workplace lookup ─────────────────────────────────────────────────────────

/**
 * Same identity discipline as syncWorkplaces.claimByIdentity: stable
 * codingRowId first; the code fallback is guarded by the profession name so
 * renumbered positional codes can never attribute another position's
 * measurements to this workplace.
 */
function lookupValues(
  wp: Record<string, unknown>,
  sources: SourceIndexes,
): FactorValues | undefined {
  const id = typeof wp.codingRowId === "string" ? wp.codingRowId : "";
  if (id !== "") {
    const hit = sources.byId.get(id);
    if (hit) return hit;
  }
  const code = typeof wp.code === "string" ? wp.code : "";
  const profession = typeof wp.profession === "string" ? wp.profession : "";
  if (code === "" || profession === "") return undefined;
  return sources.byCodeAndName.get(`${code}|${normalizeName(profession)}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Lighting stores numbers; 0 is the blank-row placeholder (a 0-lux reading
 * is not a meaningful measurement), so it is treated as "no data".
 */
function numStr(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v) && v !== 0) return String(v);
  return str(v);
}

/**
 * Local copy of the name normalisation used across the sync layer (kept
 * local to avoid an import cycle with syncWorkplaces.ts).
 */
function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-–—]/g, "-");
}

function recogniseFactor(name: string): FactorSpec | undefined {
  const n = normalizeName(name);
  return FACTOR_SPECS.find((spec) =>
    spec.aliases.some((alias) => n.startsWith(alias)),
  );
}
