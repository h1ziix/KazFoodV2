import type { FieldPath } from "./types";

/** Stable string key for a path, used to look up validation errors. */
export function pathKey(path: FieldPath): string {
  return path.join(".");
}

/** Read a deep value via a path; returns undefined if any segment misses. */
export function getAt(root: unknown, path: FieldPath): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur == null) return undefined;
    if (typeof seg === "number") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[seg];
    } else {
      if (typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return cur;
}

/**
 * Immutable deep-set. Returns a structurally-shared copy of `root`
 * with `value` placed at `path`. Used as the canonical state updater
 * for the form renderer: every keystroke produces a new object so
 * React reference-equality checks behave correctly, but unaffected
 * subtrees are reused to keep updates O(depth).
 */
export function setAt(root: unknown, path: FieldPath, value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const arr = Array.isArray(root) ? root.slice() : [];
    arr[head] = setAt(arr[head], rest, value);
    return arr;
  }
  const obj =
    root && typeof root === "object" && !Array.isArray(root)
      ? { ...(root as Record<string, unknown>) }
      : {};
  obj[head] = setAt((obj as Record<string, unknown>)[head], rest, value);
  return obj;
}
