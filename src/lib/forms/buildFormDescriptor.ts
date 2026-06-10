import { z, type ZodTypeAny } from "zod";
import type {
  ArrayField,
  FormField,
  GroupField,
  NumberField,
  SelectField,
  SelectOption,
  TextField,
} from "./types";

/**
 * Convert a zod schema into a FormField tree.
 *
 * The function walks `_def` instead of using `instanceof` so that
 * wrappers (Optional, Default, Effects, Nullable) are transparently
 * peeled. Anything it cannot classify falls back to a plain text input
 * — the runtime zod validator still has the final word on what is
 * acceptable, so the worst case is a less ergonomic input, never a
 * broken document.
 *
 * @param opts.skipKeys  Key names whose corresponding fields are hidden
 *   from the form UI but remain in data and in `defaultItem` for new
 *   array rows.  Matched by key name at every level of the schema tree.
 * @param opts.readOnlyKeys  Key names rendered as non-editable computed
 *   values (data stays, typing is blocked).  Same matching semantics as
 *   `skipKeys`.
 */
export function buildFormDescriptor(
  schema: ZodTypeAny,
  opts?: { skipKeys?: readonly string[]; readOnlyKeys?: readonly string[] },
): FormField {
  const ctx: BuildCtx = {
    skipKeys: opts?.skipKeys ?? [],
    readOnlyKeys: opts?.readOnlyKeys ?? [],
  };
  return toField("root", schema, /* requiredFromParent */ true, ctx);
}

/* ------------------------------------------------------------------ */
/* internal                                                            */
/* ------------------------------------------------------------------ */

interface BuildCtx {
  readonly skipKeys: readonly string[];
  readonly readOnlyKeys: readonly string[];
}

interface ZodDef {
  typeName: string;
  // Unknown shapes are accessed via index signature on a narrowed cast.
  [k: string]: unknown;
}

function defOf(s: ZodTypeAny): ZodDef {
  return (s as unknown as { _def: ZodDef })._def;
}

interface Unwrapped {
  inner: ZodTypeAny;
  optional: boolean;
  /** Value extracted from a `z.string().default(…)` wrapper, or undefined. */
  defaultValue: unknown;
  hasDefault: boolean;
}

/** Peel Optional / Nullable / Default / Effects wrappers. */
function unwrap(schema: ZodTypeAny): Unwrapped {
  let current: ZodTypeAny = schema;
  let optional = false;
  let defaultValue: unknown = undefined;
  let hasDefault = false;

  // Hard cap: pathological nesting should never occur with hand-written
  // schemas, but the cap avoids any chance of an infinite loop.
  for (let i = 0; i < 16; i += 1) {
    const d = defOf(current);
    switch (d.typeName) {
      case "ZodOptional":
      case "ZodNullable":
        optional = true;
        current = d.innerType as ZodTypeAny;
        continue;
      case "ZodDefault":
        // Capture the default value on first encounter only.
        if (!hasDefault) {
          try {
            const raw = d.defaultValue;
            defaultValue =
              typeof raw === "function" ? (raw as () => unknown)() : raw;
            hasDefault = true;
          } catch {
            // Ignore an unparseable default — field gets the generic fallback.
          }
        }
        current = d.innerType as ZodTypeAny;
        continue;
      case "ZodEffects":
        current = d.schema as ZodTypeAny;
        continue;
      default:
        return { inner: current, optional, defaultValue, hasDefault };
    }
  }
  return { inner: current, optional, defaultValue, hasDefault };
}

function humanise(key: string): string {
  if (!key) return "";
  // camelCase / snake_case → spaced words, first letter upper.
  const spaced = key
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-zа-я0-9])([A-ZА-Я])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toField(
  key: string,
  schema: ZodTypeAny,
  requiredFromParent: boolean,
  ctx: BuildCtx,
): FormField {
  const { inner, optional, defaultValue, hasDefault } = unwrap(schema);
  const required = requiredFromParent && !optional;
  const d = defOf(inner);
  const label = humanise(key);
  const dv = hasDefault ? defaultValue : undefined;

  switch (d.typeName) {
    case "ZodObject":
      return buildGroup(key, label, required, inner, ctx);
    case "ZodArray":
      return buildArray(key, label, required, inner, ctx);
    case "ZodEnum":
      return buildEnum(key, label, required, d, dv);
    case "ZodNativeEnum":
      return buildNativeEnum(key, label, required, d, dv);
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return buildUnion(key, label, required, d, dv);
    case "ZodLiteral": {
      const value = d.value as unknown;
      const opt: SelectOption = {
        value: String(value),
        label: String(value),
      };
      const field: SelectField = {
        kind: "select",
        key,
        label,
        required,
        options: [opt],
        defaultValue: dv,
      };
      return field;
    }
    case "ZodNumber":
      return buildNumber(key, label, required, d, /* allowEmpty */ false, dv);
    case "ZodBoolean":
    case "ZodString":
    default:
      return buildText(key, label, required, d, dv);
  }
}

function buildGroup(
  key: string,
  label: string,
  required: boolean,
  inner: ZodTypeAny,
  ctx: BuildCtx,
): GroupField {
  const shapeFn = defOf(inner).shape as () => Record<string, ZodTypeAny>;
  const shape = shapeFn();
  const children: FormField[] = Object.entries(shape).map(([k, child]) => {
    let field = toField(k, child, true, ctx);
    // Mark as hidden without removing from the descriptor tree so that
    // defaultFor() still includes it in defaultItem for new array rows.
    if (ctx.skipKeys.includes(k)) field = { ...field, hidden: true };
    if (ctx.readOnlyKeys.includes(k)) field = { ...field, readOnly: true };
    return field;
  });
  return { kind: "group", key, label, required, children };
}

function buildArray(
  key: string,
  label: string,
  required: boolean,
  inner: ZodTypeAny,
  ctx: BuildCtx,
): ArrayField {
  const elem = defOf(inner).type as ZodTypeAny;
  const minLen = defOf(inner).minLength as { value: number } | null;
  const item = toField("item", elem, true, ctx);
  const defaultItem = defaultFor(item);
  return {
    kind: "array",
    key,
    label,
    required,
    item,
    defaultItem,
    minItems: minLen?.value ?? 0,
    tabular: isTabular(item),
  };
}

function buildEnum(
  key: string,
  label: string,
  required: boolean,
  d: ZodDef,
  defaultValue: unknown,
): SelectField {
  const values = (d.values as readonly string[]) ?? [];
  return {
    kind: "select",
    key,
    label,
    required,
    options: values.map((v) => ({
      value: v,
      label: v === "" ? "—" : v,
    })),
    defaultValue,
  };
}

function buildNativeEnum(
  key: string,
  label: string,
  required: boolean,
  d: ZodDef,
  defaultValue: unknown,
): SelectField {
  const raw = (d.values as Record<string, string | number>) ?? {};
  const opts: SelectOption[] = [];
  for (const [k, v] of Object.entries(raw)) {
    // Skip reverse-mapping entries that numeric TS enums add.
    if (typeof v === "number" && Number.isNaN(Number(k))) {
      opts.push({ value: String(v), label: k });
    } else if (typeof v === "string") {
      opts.push({ value: v, label: k });
    }
  }
  return { kind: "select", key, label, required, options: opts, defaultValue };
}

/**
 * Map z.union([z.number(), z.literal("")]) (and similar shapes used in
 * `conclusionSchema`) onto a single number input that also accepts the
 * empty string. Falls back to a text field for unions we cannot model.
 */
function buildUnion(
  key: string,
  label: string,
  required: boolean,
  d: ZodDef,
  defaultValue: unknown,
): FormField {
  const opts = (d.options as ZodTypeAny[]) ?? [];
  const peeled = opts.map((o) => unwrap(o).inner);
  const kinds = peeled.map((o) => defOf(o).typeName);

  const hasNumber = kinds.includes("ZodNumber");
  const hasEmptyLiteral = peeled.some((o) => {
    const od = defOf(o);
    return od.typeName === "ZodLiteral" && od.value === "";
  });
  const onlyLiterals = peeled.every(
    (o) => defOf(o).typeName === "ZodLiteral",
  );

  if (hasNumber && hasEmptyLiteral) {
    const numSchema = peeled.find((o) => defOf(o).typeName === "ZodNumber")!;
    return buildNumber(
      key,
      label,
      required,
      defOf(numSchema),
      /* allowEmpty */ true,
      defaultValue,
    );
  }

  if (onlyLiterals) {
    const options: SelectOption[] = peeled.map((o) => {
      const v = defOf(o).value as unknown;
      return { value: String(v), label: String(v === "" ? "—" : v) };
    });
    return { kind: "select", key, label, required, options, defaultValue };
  }

  // Last resort — accept anything as text and rely on zod to validate.
  return { kind: "text", key, label, required, defaultValue };
}

function buildNumber(
  key: string,
  label: string,
  required: boolean,
  d: ZodDef,
  allowEmpty: boolean,
  defaultValue: unknown,
): NumberField {
  const checks = (d.checks as Array<{ kind: string; value?: number }>) ?? [];
  const integer = checks.some((c) => c.kind === "int");
  const minCheck = checks.find((c) => c.kind === "min");
  return {
    kind: "number",
    key,
    label,
    required,
    integer,
    min: minCheck?.value,
    allowEmptyString: allowEmpty,
    defaultValue,
  };
}

function buildText(
  key: string,
  label: string,
  required: boolean,
  d: ZodDef,
  defaultValue: unknown,
): TextField {
  const checks = (d.checks as Array<{ kind: string; value?: number }>) ?? [];
  const minCheck = checks.find((c) => c.kind === "min");
  return {
    kind: "text",
    key,
    label,
    required,
    minLength: minCheck?.value,
    defaultValue,
  };
}

/* ------------------------------------------------------------------ */
/* defaults & helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a structurally-valid (but possibly empty) value for a field.
 * Used both when seeding empty forms and when appending array rows.
 *
 * When the field carries a `defaultValue` (extracted from a zod
 * `.default(…)` wrapper), that value is used instead of the generic
 * empty-string / zero placeholder.  This ensures that hidden fields
 * with schema defaults (e.g. `time: z.string().default("7-8")`) arrive
 * pre-filled in newly added array rows.
 */
export function defaultFor(field: FormField): unknown {
  switch (field.kind) {
    case "text":
      return field.defaultValue !== undefined ? field.defaultValue : "";
    case "number":
      if (field.defaultValue !== undefined) return field.defaultValue;
      // 0 is a safer default than NaN: it passes int/nonnegative checks
      // for the common case. Positive-only fields surface the error
      // inline, which is the desired UX (user sees the validation).
      return field.min && field.min > 0 ? field.min : 0;
    case "select":
      if (field.defaultValue !== undefined) return field.defaultValue;
      return field.options[0]?.value ?? "";
    case "group": {
      const out: Record<string, unknown> = {};
      // Include ALL children (hidden or not) so the data object is
      // structurally complete for validation and DOCX generation.
      for (const c of field.children) out[c.key] = defaultFor(c);
      return out;
    }
    case "array": {
      const seed: unknown[] = [];
      for (let i = 0; i < Math.max(field.minItems, 0); i += 1) {
        seed.push(structuredClone(field.defaultItem));
      }
      return seed;
    }
  }
}

/**
 * A measurement array is rendered as a compact table when ALL visible
 * (non-hidden) children are scalar.  Hidden children are excluded from
 * this check because they do not appear as table columns.
 */
function isTabular(item: FormField): boolean {
  if (item.kind !== "group") return false;
  const visible = item.children.filter((c) => !c.hidden);
  return (
    visible.length > 0 &&
    visible.every(
      (c) => c.kind === "text" || c.kind === "number" || c.kind === "select",
    )
  );
}

/** Re-export so callers do not need a separate zod import. */
export { z };
