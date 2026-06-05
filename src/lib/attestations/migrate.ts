/**
 * One-time migration shims for persisted document blobs whose shape
 * changed between schema versions.
 *
 * Each function detects the old shape by the presence of a top-level
 * key that no longer exists in the current schema, converts the data
 * in-place, and returns the new shape.  If the data is already in the
 * current shape the function returns the original reference unchanged
 * (identity), so callers can use a strict `!==` check to decide whether
 * a re-save is needed.
 */

type PlainObject = Record<string, unknown>;

function isObject(v: unknown): v is PlainObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ── Lighting ─────────────────────────────────────────────────────────

/**
 * v1 shape: `{ places: [{number, name}], lighting_measurements: [...] }`
 * v2 shape: `{ places: [{number, name, measurements: [...]}] }`
 *
 * Uses the "13т" boundary heuristic (same logic the old generator used)
 * to assign admin measurements to place[0] and production measurements
 * to place[1].  Any place with zero measurements after the split is
 * dropped to satisfy the schema's min(1) requirement.
 */
export function migrateLighting(data: unknown): unknown {
  if (!isObject(data)) return data;
  if (!Array.isArray(data["lighting_measurements"])) return data;

  const flat = data["lighting_measurements"] as PlainObject[];
  const places = Array.isArray(data["places"])
    ? (data["places"] as PlainObject[])
    : [];

  const admin: PlainObject[] = [];
  const production: PlainObject[] = [];
  let crossedBoundary = false;
  for (const row of flat) {
    if (!crossedBoundary) {
      admin.push(row);
      if (String(row["pointNumber"] ?? "").trim() === "13т") {
        crossedBoundary = true;
      }
    } else {
      production.push(row);
    }
  }

  const newPlaces: PlainObject[] = [];
  if (admin.length > 0) {
    const meta = places[0] ?? { number: 1, name: "Административно – управленческий персонал" };
    newPlaces.push({ ...meta, measurements: admin });
  }
  if (production.length > 0) {
    const meta = places[1] ?? { number: 2, name: "Производственный персонал" };
    newPlaces.push({ ...meta, measurements: production });
  }
  if (newPlaces.length === 0 && flat.length > 0) {
    const meta = places[0] ?? { number: 1, name: "Рабочие места" };
    newPlaces.push({ ...meta, measurements: flat });
  }

  const result = { ...data };
  delete result["lighting_measurements"];
  result["places"] = newPlaces;
  return result;
}

// ── EMP ──────────────────────────────────────────────────────────────

/**
 * v1 shape: `{ places: [{number, name}], emp_measurements: [...] }`
 * v2 shape: `{ places: [{number, name, measurements: [...]}] }`
 *
 * The old EMP template had no dynamic section split — all measurements
 * were rendered under a single static "1. АУП" header.  Migration
 * therefore puts all measurements into the first place entry.
 */
export function migrateEmp(data: unknown): unknown {
  if (!isObject(data)) return data;
  if (!Array.isArray(data["emp_measurements"])) return data;

  const flat = data["emp_measurements"] as PlainObject[];
  const places = Array.isArray(data["places"])
    ? (data["places"] as PlainObject[])
    : [];

  const meta = places[0] ?? { number: 1, name: "Административно – управленческий персонал" };

  const result = { ...data };
  delete result["emp_measurements"];
  result["places"] = [{ ...meta, measurements: flat }];
  return result;
}

// ── Dispatcher ───────────────────────────────────────────────────────

/**
 * Route a persisted document blob through the correct migration
 * function based on the document key.  Returns the original reference
 * if no migration is needed for this key or the data is already
 * in the current shape.
 */
export function migrateDocumentData(key: string, data: unknown): unknown {
  if (key === "lighting") return migrateLighting(data);
  if (key === "emp") return migrateEmp(data);
  return data;
}
