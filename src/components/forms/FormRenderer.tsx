"use client";

import { useCallback, type ChangeEvent } from "react";
import type {
  ArrayField,
  FieldPath,
  FormField,
  GroupField,
  NumberField,
  SelectField,
  TextField,
} from "@/lib/forms/types";
import { defaultFor } from "@/lib/forms/buildFormDescriptor";
import { getAt, pathKey, setAt } from "@/lib/forms/path";
import {
  resolveArrayItemName,
  resolveFieldLabel,
  resolveSectionTitle,
} from "@/lib/forms/labels";

export interface FormRendererProps {
  field: FormField;
  value: unknown;
  /** Map keyed by `pathKey(path)` → error message. */
  errors: Record<string, string>;
  onChange: (next: unknown) => void;
}

/**
 * Schema-agnostic recursive form renderer.
 *
 * The component receives the form descriptor (built once from the zod
 * schema) and the current value. All mutations bubble up through a
 * single `onChange` callback so the parent owns the canonical state.
 *
 * The renderer has no knowledge of any specific document or language —
 * every label, section title and add/remove caption is produced by the
 * `resolve*` helpers in `lib/forms/labels.ts`.
 */
export function FormRenderer({
  field,
  value,
  errors,
  onChange,
}: FormRendererProps) {
  const update = useCallback(
    (path: FieldPath, next: unknown) => {
      onChange(setAt(value, path, next));
    },
    [value, onChange],
  );

  return (
    <FieldNode
      field={field}
      path={[]}
      value={value}
      errors={errors}
      update={update}
      depth={0}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Internal node renderer                                              */
/* ------------------------------------------------------------------ */

interface NodeProps {
  field: FormField;
  path: FieldPath;
  value: unknown;
  errors: Record<string, string>;
  update: (path: FieldPath, next: unknown) => void;
  depth: number;
}

function FieldNode(props: NodeProps) {
  const { field } = props;
  switch (field.kind) {
    case "text":
      return <TextInput {...props} field={field} />;
    case "number":
      return <NumberInput {...props} field={field} />;
    case "select":
      return <SelectInput {...props} field={field} />;
    case "group":
      return <GroupBlock {...props} field={field} />;
    case "array":
      return <ArrayBlock {...props} field={field} />;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fieldError(
  errors: Record<string, string>,
  path: FieldPath,
): string | undefined {
  return errors[pathKey(path)];
}

function labelOf(path: FieldPath, key: string): string {
  return resolveFieldLabel(path, key);
}

function FieldLabel({
  text,
  required,
  htmlFor,
}: {
  text: string;
  required: boolean;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 inline-block text-xs font-medium text-slate-700"
    >
      {text}
      {required && <span className="ml-0.5 text-rose-600">*</span>}
    </label>
  );
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-rose-600">{message}</p>;
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30";
const inputErrorClass =
  "border-rose-400 focus:border-rose-500 focus:ring-rose-500/30";

/**
 * Non-editable computed value (field.readOnly): the user sees the value
 * (e.g. an auto-assigned workplace code) but cannot type into it — it is
 * recomputed by the descriptor's `normalize` pass.
 */
function ReadOnlyValue({
  value,
  compact = false,
}: {
  value: unknown;
  compact?: boolean;
}) {
  const text = value == null || value === "" ? "—" : String(value);
  return (
    <p
      className={`w-full rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 font-mono text-slate-600 ${
        compact ? "text-xs" : "text-sm"
      }`}
      title="Назначается автоматически"
    >
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Scalars                                                             */
/* ------------------------------------------------------------------ */

function TextInput({
  field,
  path,
  value,
  errors,
  update,
}: NodeProps & { field: TextField }) {
  const id = pathKey(path);
  const err = fieldError(errors, path);
  if (field.readOnly) {
    return (
      <div className="flex flex-col">
        <FieldLabel text={labelOf(path, field.key)} required={false} />
        <ReadOnlyValue value={value} />
        <ErrorText message={err} />
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <FieldLabel
        htmlFor={id}
        text={labelOf(path, field.key)}
        required={field.required}
      />
      <input
        id={id}
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          update(path, e.target.value)
        }
        className={`${inputClass} ${err ? inputErrorClass : ""}`}
      />
      <ErrorText message={err} />
    </div>
  );
}

function NumberInput({
  field,
  path,
  value,
  errors,
  update,
}: NodeProps & { field: NumberField }) {
  const id = pathKey(path);
  const err = fieldError(errors, path);
  const display =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  if (field.readOnly) {
    return (
      <div className="flex flex-col">
        <FieldLabel text={labelOf(path, field.key)} required={false} />
        <ReadOnlyValue value={display} />
        <ErrorText message={err} />
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <FieldLabel
        htmlFor={id}
        text={labelOf(path, field.key)}
        required={field.required}
      />
      <input
        id={id}
        type="number"
        inputMode={field.integer ? "numeric" : "decimal"}
        step={field.integer ? 1 : "any"}
        value={display}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const raw = e.target.value;
          if (raw === "") {
            update(path, field.allowEmptyString ? "" : 0);
            return;
          }
          const num = field.integer ? parseInt(raw, 10) : Number(raw);
          if (Number.isNaN(num)) {
            update(path, field.allowEmptyString ? "" : 0);
          } else {
            update(path, num);
          }
        }}
        className={`${inputClass} ${err ? inputErrorClass : ""}`}
      />
      <ErrorText message={err} />
    </div>
  );
}

function SelectInput({
  field,
  path,
  value,
  errors,
  update,
}: NodeProps & { field: SelectField }) {
  const id = pathKey(path);
  const err = fieldError(errors, path);
  return (
    <div className="flex flex-col">
      <FieldLabel
        htmlFor={id}
        text={labelOf(path, field.key)}
        required={field.required}
      />
      <select
        id={id}
        value={value == null ? "" : String(value)}
        onChange={(e) => update(path, e.target.value)}
        className={`${inputClass} ${err ? inputErrorClass : ""}`}
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ErrorText message={err} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

function isScalarOnly(field: GroupField): boolean {
  return field.children
    .filter((c) => !c.hidden)
    .every(
      (c) => c.kind === "text" || c.kind === "number" || c.kind === "select",
    );
}

function GroupBlock({
  field,
  path,
  value,
  errors,
  update,
  depth,
}: NodeProps & { field: GroupField }) {
  const scalarOnly = isScalarOnly(field);
  const gridClass = scalarOnly
    ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    : "flex flex-col gap-4";

  // Root group: render children as top-level collapsible sections.
  if (depth === 0) {
    return (
      <div className="flex flex-col gap-3">
        {field.children.map((child) => (
          <TopLevelSection
            key={child.key}
            child={child}
            parentPath={path}
            value={value}
            errors={errors}
            update={update}
            depth={depth}
          />
        ))}
      </div>
    );
  }

  return (
    <fieldset className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-3">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {resolveSectionTitle(path, field)}
      </legend>
      <div className={gridClass}>
        {field.children.filter((c) => !c.hidden).map((child) => (
          <FieldNode
            key={child.key}
            field={child}
            path={[...path, child.key]}
            value={getAt(value, [child.key])}
            errors={errors}
            update={update}
            depth={depth + 1}
          />
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Top-level sections render as accordion cards with an error badge.
 * Scalar leaves at the top level (rare) render inline without a
 * wrapper card so they don't look out of place.
 */
function TopLevelSection({
  child,
  parentPath,
  value,
  errors,
  update,
  depth,
}: {
  child: FormField;
  parentPath: FieldPath;
  value: unknown;
  errors: Record<string, string>;
  update: (path: FieldPath, next: unknown) => void;
  depth: number;
}) {
  const childPath: FieldPath = [...parentPath, child.key];
  const childPrefix = pathKey(childPath);
  const errorCount = Object.keys(errors).filter(
    (k) => k === childPrefix || k.startsWith(`${childPrefix}.`),
  ).length;

  if (
    child.kind === "text" ||
    child.kind === "number" ||
    child.kind === "select"
  ) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <FieldNode
          field={child}
          path={childPath}
          value={getAt(value, [child.key])}
          errors={errors}
          update={update}
          depth={depth + 1}
        />
      </div>
    );
  }

  const title =
    child.kind === "group"
      ? resolveSectionTitle(childPath, child)
      : resolveFieldLabel(childPath, child.key);

  return (
    <details
      open
      className="group rounded-lg border border-slate-200 bg-white shadow-sm transition open:shadow"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-t-lg px-4 py-3 hover:bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 transition-transform group-open:rotate-90">
            ▶
          </span>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        {errorCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
            {errorCount} {pluralise(errorCount, ["ошибка", "ошибки", "ошибок"])}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            заполнено
          </span>
        )}
      </summary>
      <div className="border-t border-slate-200 px-4 py-4">
        <FieldNode
          field={child}
          path={childPath}
          value={getAt(value, [child.key])}
          errors={errors}
          update={update}
          depth={depth + 1}
        />
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Arrays                                                              */
/* ------------------------------------------------------------------ */

function ArrayBlock({
  field,
  path,
  value,
  errors,
  update,
  depth,
}: NodeProps & { field: ArrayField }) {
  const items: unknown[] = Array.isArray(value) ? value : [];
  const arrError = fieldError(errors, path);
  const itemName = resolveArrayItemName(path, field.key);

  const addRow = () => {
    update(path, [...items, structuredClone(field.defaultItem)]);
  };
  const removeRow = (index: number) => {
    const next = items.slice();
    next.splice(index, 1);
    update(path, next);
  };

  const canRemove = items.length > field.minItems;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">
            {resolveFieldLabel(path, field.key)}
          </h4>
          <p className="text-xs text-slate-500">
            Записей: {items.length}
            {field.minItems > 0 ? ` · минимум ${field.minItems}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
        >
          <span aria-hidden>＋</span>
          Добавить {itemName.accusative}
        </button>
      </div>

      {arrError && <ErrorText message={arrError} />}

      {field.tabular && field.item.kind === "group" ? (
        <TableArray
          field={field}
          path={path}
          items={items}
          errors={errors}
          update={update}
          depth={depth}
          removeRow={removeRow}
          canRemove={canRemove}
          itemNominative={itemName.nominative}
        />
      ) : (
        <CardArray
          field={field}
          path={path}
          items={items}
          errors={errors}
          update={update}
          depth={depth}
          removeRow={removeRow}
          canRemove={canRemove}
          itemNominative={itemName.nominative}
        />
      )}
    </div>
  );
}

interface ArrayBodyProps {
  field: ArrayField;
  path: FieldPath;
  items: unknown[];
  errors: Record<string, string>;
  update: (path: FieldPath, next: unknown) => void;
  depth: number;
  removeRow: (index: number) => void;
  canRemove: boolean;
  itemNominative: string;
}

function CardArray({
  field,
  path,
  items,
  errors,
  update,
  depth,
  removeRow,
  canRemove,
  itemNominative,
}: ArrayBodyProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">
        Список пуст. Нажмите «Добавить» для создания записи.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {itemNominative} №{idx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              disabled={!canRemove}
              className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
          <FieldNode
            field={field.item}
            path={[...path, idx]}
            value={item}
            errors={errors}
            update={update}
            depth={depth + 1}
          />
        </div>
      ))}
    </div>
  );
}

function TableArray({
  field,
  path,
  items,
  errors,
  update,
  depth,
  removeRow,
  canRemove,
}: ArrayBodyProps) {
  if (field.item.kind !== "group") return null;
  // Exclude hidden fields — they remain in data but are not table columns.
  const columns = field.item.children.filter((c) => !c.hidden);
  // Item-path is built once per row; column labels resolve against the
  // item path so context-specific overrides still apply.
  const sampleItemPath: FieldPath = [...path, 0];

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">
        Таблица пуста. Нажмите «Добавить» чтобы создать строку.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur">
          <tr>
            <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-600">
              №
            </th>
            {columns.map((c) => {
              const label = resolveFieldLabel(
                [...sampleItemPath, c.key],
                c.key,
              );
              return (
                <th
                  key={c.key}
                  className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap"
                >
                  {label}
                  {c.required && !c.readOnly && (
                    <span className="ml-0.5 text-rose-600">*</span>
                  )}
                </th>
              );
            })}
            <th className="border-b border-slate-200 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={idx}
              className="border-b border-slate-100 last:border-0 even:bg-slate-50/40 hover:bg-sky-50/40"
            >
              <td className="px-2 py-1.5 text-slate-500 align-top">{idx + 1}</td>
              {columns.map((col) => {
                const cellPath: FieldPath = [...path, idx, col.key];
                return (
                  <td
                    key={col.key}
                    className="px-1.5 py-1.5 align-top min-w-[10ch]"
                  >
                    <CellRenderer
                      field={col}
                      path={cellPath}
                      value={getAt(item, [col.key])}
                      errors={errors}
                      update={update}
                      depth={depth + 1}
                    />
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-right align-top">
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={!canRemove}
                  title="Удалить строку"
                  className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cell renderer — same inputs as FieldNode but without an outer label. */
function CellRenderer({ field, path, value, errors, update }: NodeProps) {
  const err = fieldError(errors, path);
  const cls = `${inputClass} ${err ? inputErrorClass : ""} text-xs`;

  if (
    field.readOnly &&
    (field.kind === "text" || field.kind === "number" || field.kind === "select")
  ) {
    return (
      <>
        <ReadOnlyValue value={value} compact />
        <ErrorText message={err} />
      </>
    );
  }

  if (field.kind === "text") {
    return (
      <>
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => update(path, e.target.value)}
          className={cls}
        />
        <ErrorText message={err} />
      </>
    );
  }
  if (field.kind === "number") {
    const display =
      typeof value === "number"
        ? String(value)
        : typeof value === "string"
          ? value
          : "";
    return (
      <>
        <input
          type="number"
          inputMode={field.integer ? "numeric" : "decimal"}
          step={field.integer ? 1 : "any"}
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              update(path, field.allowEmptyString ? "" : 0);
              return;
            }
            const n = field.integer ? parseInt(raw, 10) : Number(raw);
            update(
              path,
              Number.isNaN(n) ? (field.allowEmptyString ? "" : 0) : n,
            );
          }}
          className={cls}
        />
        <ErrorText message={err} />
      </>
    );
  }
  if (field.kind === "select") {
    return (
      <>
        <select
          value={value == null ? "" : String(value)}
          onChange={(e) => update(path, e.target.value)}
          className={cls}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ErrorText message={err} />
      </>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

/**
 * Standard Russian pluralisation: forms = [one, few, many].
 *   1   ошибка
 *   2–4 ошибки
 *   5+  ошибок
 */
function pluralise(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

/* ------------------------------------------------------------------ */
/* Re-export                                                           */
/* ------------------------------------------------------------------ */

export { defaultFor };
