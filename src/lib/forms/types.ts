/**
 * Schema-agnostic form metadata.
 *
 * The form engine treats every zod schema as a tree of FormField nodes.
 * The renderer is purely metadata-driven: it does not know about any
 * specific document type, schema, or business rule. Adding a new
 * document requires no UI changes — only a new registry entry.
 */

export type FieldPath = ReadonlyArray<string | number>;

export interface FieldBase {
  /** Property key for objects, or array element name like "item". */
  key: string;
  /** Human-readable label derived from `key` (humanised camelCase). */
  label: string;
  /** Whether the underlying zod schema rejects empty / missing input. */
  required: boolean;
  /** Optional placeholder hint surfaced in the input. */
  placeholder?: string;
}

export interface TextField extends FieldBase {
  kind: "text";
  /** Inferred from string constraints; `1` => required non-empty. */
  minLength?: number;
}

export interface NumberField extends FieldBase {
  kind: "number";
  integer: boolean;
  min?: number;
  /** When true the field also accepts the empty string ("") as a value. */
  allowEmptyString: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectField extends FieldBase {
  kind: "select";
  options: SelectOption[];
}

export interface GroupField extends FieldBase {
  kind: "group";
  children: FormField[];
}

export interface ArrayField extends FieldBase {
  kind: "array";
  /** Schema for a single element — usually a GroupField. */
  item: FormField;
  /** Default value used when appending a new row. */
  defaultItem: unknown;
  /** Minimum array length enforced by the schema (0 if none). */
  minItems: number;
  /**
   * True when array elements are pure-primitive objects suitable for a
   * tabular UI (one row per item, one column per scalar field). When
   * false the renderer falls back to a card-per-item layout.
   */
  tabular: boolean;
}

export type FormField =
  | TextField
  | NumberField
  | SelectField
  | GroupField
  | ArrayField;
