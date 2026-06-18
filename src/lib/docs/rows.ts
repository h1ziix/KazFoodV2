/**
 * Helpers for flattening hierarchical protocol data into a single
 * sequential row stream for docxtemplater loops.
 *
 * docxtemplater 3.x has no parent-scope inside loops, so multi-level
 * trees (place → measurement, section → row, place → workplace →
 * factor) are typically pre-flattened into one array where the FIRST
 * row of each new section carries a marker (`showPlace` / `showSection`)
 * plus the section's title/number, and subsequent rows have empty
 * leading cells.
 *
 * Three repeated patterns from the original generators are captured:
 *
 *   flattenPlacesMeasurements  — used by noise + meteo
 *   flattenSectionsRows        — used by safety + siz
 *   flattenWorkplaceFactors    — used by summary
 *
 * Each existing generator will be migrated to use these helpers in
 * later refactor steps; for now the module is additive.
 */

// ---------- noise / meteo ----------

export interface PlaceWithMeasurements<M> {
  number: number | string;
  name: string;
  measurements: M[];
}

/**
 * For each (place, measurement) pair emit a row carrying:
 *   - all keys produced by `mapMeasurement(m)`;
 *   - `showPlace: true` for the FIRST measurement of each place,
 *     `false` for the rest;
 *   - `placeNumber` / `placeName` denormalised onto every row.
 */
export function flattenPlacesMeasurements<M>(
  places: PlaceWithMeasurements<M>[],
  mapMeasurement: (m: M) => Record<string, unknown>,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const place of places) {
    place.measurements.forEach((m, idx) => {
      rows.push({
        ...mapMeasurement(m),
        showPlace: idx === 0,
        placeNumber: place.number,
        placeName: place.name,
      });
    });
  }
  return rows;
}

// ---------- safety / siz ----------

export interface SectionWithRows<R> {
  number: number | string;
  title: string;
  rows: R[];
}

/**
 * Build a `sections` array shaped exactly like the original safety/siz
 * generators expected: every section spreads `rootFlat`, exposes its
 * own `section_number` / `section_title`, and contains a `rows` array
 * where each row again carries `rootFlat`, the section title fields,
 * and the row mapper output.
 */
export function flattenSectionsRows<R>(
  sections: SectionWithRows<R>[],
  mapRow: (r: R) => Record<string, unknown>,
  rootFlat: Record<string, unknown>,
): Record<string, unknown>[] {
  return sections.map((section) => ({
    ...rootFlat,
    section_number: section.number,
    section_title: section.title,
    rows: section.rows.map((r) => ({
      ...rootFlat,
      section_number: section.number,
      section_title: section.title,
      ...mapRow(r),
    })),
  }));
}

// ---------- summary ----------

export interface SummaryWorkplaceLike<F> {
  code: string;
  profession: string;
  count: number | string;
  factors: F[];
}

export interface SummaryPlaceLike<F> {
  number: number | string;
  name: string;
  workplaces: SummaryWorkplaceLike<F>[];
}

/**
 * Single-pass three-level flatten used by the summary protocol.
 *
 * For each (place, workplace, factor) tuple emit one row. The very
 * first row of every NEW place carries `showSection: true` together
 * with `placeNumber` / `placeName`; the very first row of every
 * workplace carries `firstFactor: true` plus `code` / `profession` /
 * `count`; subsequent factor rows in the same workplace carry
 * `firstFactor: false` and empty leading columns so vertical-merge
 * cells in the template render their continuation form.
 *
 * A workplace with NO factors (a new position synced before it has any
 * measurements) still emits ONE row so the profession appears in the table
 * with empty factor columns. Pass `emptyFactor` to supply the blank cell
 * values for that row; without it such a workplace is skipped entirely (and
 * would drop the place's section header if it were the first workplace).
 */
export function flattenWorkplaceFactors<F>(
  places: SummaryPlaceLike<F>[],
  mapFactor: (f: F) => Record<string, unknown>,
  emptyFactor?: F,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const place of places) {
    let firstWorkplace = true;
    for (const wp of place.workplaces) {
      const factors =
        wp.factors.length > 0
          ? wp.factors
          : emptyFactor !== undefined
            ? [emptyFactor]
            : [];
      let firstFactor = true;
      for (const factor of factors) {
        rows.push({
          showSection: firstWorkplace && firstFactor,
          firstFactor,
          notFirstFactor: !firstFactor,
          placeNumber: place.number,
          placeName: place.name,
          code: firstFactor ? wp.code : "",
          profession: firstFactor ? wp.profession : "",
          count: firstFactor ? String(wp.count) : "",
          ...mapFactor(factor),
        });
        firstFactor = false;
      }
      firstWorkplace = false;
    }
  }
  return rows;
}
