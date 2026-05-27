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
 */
export function buildFormDescriptor(schema: ZodTypeAny): FormField {
  return toField("root", schema, /* requiredFromParent */ true);
}

/* ------------------------------------------------------------------ */
/* internal                                                            */
/* ------------------------------------------------------------------ */

interface ZodDef {
  typeName: string;
  // Unknown shapes are accessed via index signature on a narrowed cast.
  [k: string]: unknown;
}

function defOf(s: ZodTypeAny): ZodDef {
  return (s as unknown as { _def: ZodDef })._def;
}

/** Peel Optional / Nullable / Default / Effects wrappers. */
function unwrap(schema: ZodTypeAny): {
  inner: ZodTypeAny;
  optional: boolean;
} {
  let current: ZodTypeAny = schema;
  let optional = false;
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
        current = d.innerType as ZodTypeAny;
        continue;
      case "ZodEffects":
        current = d.schema as ZodTypeAny;
        continue;
      default:
        return { inner: current, optional };
    }
  }
  return { inner: current, optional };
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
): FormField {
  const { inner, optional } = unwrap(schema);
  const required = requiredFromParent && !optional;
  const d = defOf(inner);
  const label = humanise(key);

  switch (d.typeName) {
    case "ZodObject":
      return buildGroup(key, label, required, inner);
    case "ZodArray":
      return buildArray(key, label, required, inner);
    case "ZodEnum":
      return buildEnum(key, label, required, d);
    case "ZodNativeEnum":
      return buildNativeEnum(key, label, required, d);
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return buildUnion(key, label, required, d);
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
      };
      return field;
    }
    case "ZodNumber":
      return buildNumber(key, label, required, d, /* allowEmpty */ false);
    case "ZodBoolean":
    case "ZodString":
    default:
      return buildText(key, label, required, d);
  }
}

function buildGroup(
  key: string,
  label: string,
  required: boolean,
  inner: ZodTypeAny,
): GroupField {
  const shapeFn = defOf(inner).shape as () => Record<string, ZodTypeAny>;
  const shape = shapeFn();
  const children: FormField[] = Object.entries(shape).map(([k, child]) =>
    toField(k, child, true),
  );
  return { kind: "group", key, label, required, children };
}

function buildArray(
  key: string,
  label: string,
  required: boolean,
  inner: ZodTypeAny,
): ArrayField {
  const elem = defOf(inner).type as ZodTypeAny;
  const minLen = defOf(inner).minLength as { value: number } | null;
  const item = toField("item", elem, true);
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
  };
}

function buildNativeEnum(
  key: string,
  label: string,
  required: boolean,
  d: ZodDef,
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
  return { kind: "select", key, label, required, options: opts };
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
    );
  }

  if (onlyLiterals) {
    const options: SelectOption[] = peeled.map((o) => {
      const v = defOf(o).value as unknown;
      return { value: String(v), label: String(v === "" ? "—" : v) };
    });
    return { kind: "select", key, label, required, options };
  }

  // Last resort — accept anything as text and rely on zod to validate.
  return { kind: "text", key, label, required };
}

function buildNumber(
  key: string,
  label: string,
  required: boolean,
  d: ZodDef,
  allowEmpty: boolean,
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
  };
}

function buildText(
  key: string,
  label: string,
  required: boolean,
  d: ZodDef,
): TextField {
  const checks = (d.checks as Array<{ kind: string; value?: number }>) ?? [];
  const minCheck = checks.find((c) => c.kind === "min");
  return {
    kind: "text",
    key,
    label,
    required,
    minLength: minCheck?.value,
  };
}

/* ------------------------------------------------------------------ */
/* defaults & helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a structurally-valid (but possibly empty) value for a field.
 * Used both when seeding empty forms and when appending array rows.
 */
export function defaultFor(field: FormField): unknown {
  switch (field.kind) {
    case "text":
      return "";
    case "number":
      // 0 is a safer default than NaN: it passes int/nonnegative checks
      // for the common case. Positive-only fields surface the error
      // inline, which is the desired UX (user sees the validation).
      return field.min && field.min > 0 ? field.min : 0;
    case "select":
      return field.options[0]?.value ?? "";
    case "group": {
      const out: Record<string, unknown> = {};
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

function isTabular(item: FormField): boolean {
  if (item.kind !== "group") return false;
  return item.children.every(
    (c) => c.kind === "text" || c.kind === "number" || c.kind === "select",
  );
}

/** Re-export so callers do not need a separate zod import. */
export { z };
