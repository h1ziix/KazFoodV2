/**
 * Single source of truth for the `flatten()` utility used by every
 * generate<Name>Docx.ts buildTemplateContext implementation.
 *
 * docxtemplater 3.x does NOT interpret a dot inside a tag as a path —
 * `{protocol.number}` looks up the literal key "protocol.number".  Therefore
 * nested objects in the protocol model are flattened into dotted keys.
 *
 * Two historical variants existed:
 *
 *   flatten(value, skipKeys[], prefix, out)   // lighting, emp, noise, meteo, summary
 *   flatten(value, prefix, out)               // heaviness, tension, safety, siz
 *
 * Both are unified here through an options object.  Callers that omit
 * `skipKeys` get the "no-skip" behaviour automatically.
 */
export interface FlattenOptions {
  /**
   * Top-level keys to drop from the output (arrays passed through the
   * outer loop, for example, are skipped so they can be re-attached
   * unflattened by the caller).
   */
  skipKeys?: string[];
}

export function flatten(
  value: unknown,
  options: FlattenOptions = {},
): Record<string, unknown> {
  const skipKeys = options.skipKeys ?? [];
  return flattenInto(value, skipKeys, "", {});
}

function flattenInto(
  value: unknown,
  skipKeys: string[],
  prefix: string,
  out: Record<string, unknown>,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!prefix && skipKeys.includes(k)) continue;
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flattenInto(v, skipKeys, nextKey, out);
    } else {
      out[nextKey] = v;
    }
  }
  return out;
}
