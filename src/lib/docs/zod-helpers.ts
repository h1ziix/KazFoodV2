import { z } from "zod";

/**
 * Shared zod primitives used across all protocol schemas.
 *
 * Historically every <name>Schema.ts file re-declared its own copy of
 * `nonEmpty` (and sometimes `optStr`).  This module is the single source
 * of truth.  Existing schemas will be migrated to import from here in
 * later refactor steps; for now they keep their local copies so this
 * change is purely additive.
 */

export const nonEmpty = z.string().min(1, "не должно быть пустым");

export const optStr = z.string();

export interface ValidationIssue {
  path: string;
  message: string;
}

export function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
