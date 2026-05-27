/**
 * Shared aggregation helpers for protocol generators.
 *
 * Several documents need section/grand totals derived from row arrays
 * (например, «Кодировка»: «Раздел 1 — N р/м», «Итого: M р/м»).
 *
 * `sumBy` is intentionally tiny — it removes the inline
 * `arr.reduce((acc, x) => acc + x.count, 0)` snippet that otherwise
 * proliferates across buildTemplateContext implementations and keeps
 * аggregation in one well-documented place.
 *
 * Adding it here (instead of duplicating per-document) lets future
 * descriptors (summary totals, weighted averages, etc.) reuse the same
 * primitive without rebuilding the wheel.
 */

export function sumBy<T>(items: readonly T[], getter: (item: T) => number): number {
  let acc = 0;
  for (const item of items) acc += getter(item);
  return acc;
}
