/**
 * Generic class-indicator helpers shared by Heaviness and Tension
 * (and conceptually by Summary, which uses a six-class variant).
 *
 * An "indicator" is `{ value, class }` where `class` is one of a fixed
 * enum.  In the DOCX templates each indicator is rendered as several
 * placeholders:
 *
 *   {prefix}_value  – the textual measured value
 *   {prefix}_<sfx>  – "+" if indicator.class matches that class, else ""
 *
 * Historically Heaviness and Tension had IDENTICAL local
 * `expandIndicator()` + `classMark()` implementations parameterised only
 * by their (structurally equal) class union.  They are unified here.
 */

export interface ClassIndicator<C extends string> {
  value: string;
  class: C;
}

/**
 * Default suffix map for the four-class scale used by Heaviness
 * and Tension protocols: "1" | "2" | "3.1" | "3.2".
 */
export const FOUR_CLASS_SUFFIXES = {
  "1": "c1",
  "2": "c2",
  "3.1": "c31",
  "3.2": "c32",
} as const;

export type FourClass = keyof typeof FOUR_CLASS_SUFFIXES;

export function classMark<C extends string>(actual: C, expected: C): string {
  return actual === expected ? "+" : "";
}

/**
 * Expand one indicator into `{prefix}_value` plus one `{prefix}_<suffix>`
 * key per class.  The class whose value matches `indicator.class` gets
 * "+", the others get "".
 *
 * Generic over the class enum and its suffix mapping so it can serve
 * both four-class (Heaviness/Tension) and any future N-class scale.
 */
export function expandIndicator<C extends string>(
  prefix: string,
  indicator: ClassIndicator<C>,
  suffixes: Readonly<Record<C, string>> = FOUR_CLASS_SUFFIXES as unknown as Readonly<
    Record<C, string>
  >,
): Record<string, string> {
  const out: Record<string, string> = {
    [`${prefix}_value`]: indicator.value,
  };
  for (const cls of Object.keys(suffixes) as C[]) {
    out[`${prefix}_${suffixes[cls]}`] = classMark(indicator.class, cls);
  }
  return out;
}

/**
 * Six-class scale used by Summary and Conclusion protocols:
 *   "2" – допустимый
 *   "3.1", "3.2", "3.3", "3.4" – вредный
 *   "4" – опасный
 * Empty string ("") is a valid "no class assigned" marker — all
 * resulting cells stay blank.
 */
export const SIX_CLASS_SUFFIXES = {
  "2": "c2",
  "3.1": "c31",
  "3.2": "c32",
  "3.3": "c33",
  "3.4": "c34",
  "4": "c4",
} as const;

export type SixClass = keyof typeof SIX_CLASS_SUFFIXES;

/**
 * Distribute a single textual `display` value into one of N class
 * columns according to `classValue`. The matching column receives
 * `display`; every other column receives `blank` (default "").
 *
 * Used by sum-style tables where one column out of several is filled
 * per row (Summary's factor row, Conclusion's factor count). Generic
 * over the class enum and its suffix mapping so it serves both
 * four-class and six-class scales, plus any future N-class scale.
 *
 * `classValue === ""` is treated as "no class" — all cells stay blank.
 */
export function expandClassCount<C extends string>(
  prefix: string,
  classValue: C | "",
  display: string,
  suffixes: Readonly<Record<C, string>> = SIX_CLASS_SUFFIXES as unknown as Readonly<
    Record<C, string>
  >,
  blank = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cls of Object.keys(suffixes) as C[]) {
    const key = prefix ? `${prefix}_${suffixes[cls]}` : suffixes[cls];
    out[key] = classValue === cls ? display : blank;
  }
  return out;
}
