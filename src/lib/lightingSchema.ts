import { z } from "zod";

const nonEmpty = z.string().min(1, "не должно быть пустым");

const measurementSchema = z.object({
  // Identity for coding sync; defaulted so pre-existing rows still validate.
  code: z.string().default(""),
  rowNumber: z.number().int().positive(),
  pointNumber: nonEmpty,
  place: nonEmpty,
  workCategory: nonEmpty,
  lightingSystem: nonEmpty,
  lightingType: nonEmpty,
  measured: z.number(),
  keo: z.string(),
  allowed: z.number(),
});

const placeSchema = z.object({
  number: z.number().int().positive(),
  name: nonEmpty,
  measurements: z
    .array(measurementSchema)
    .min(1, "должно быть хотя бы одно измерение"),
});

export const lightingProtocolSchema = z.object({
  protocol: z.object({
    number: nonEmpty,
    year: nonEmpty,
    day: nonEmpty,
    month: nonEmpty,
    dateYear: nonEmpty,
  }),
  customer: z.object({
    name: nonEmpty,
    address: nonEmpty,
  }),
  measurementDate: z.object({
    day: nonEmpty,
    month: nonEmpty,
    year: nonEmpty,
  }),
  purpose: nonEmpty,
  methodologyStandard: nonEmpty,
  productStandard: nonEmpty,
  representative: nonEmpty,
  roomDescription: nonEmpty,
  conditions: z.object({
    t: nonEmpty,
    h: nonEmpty,
    p: nonEmpty,
  }),
  places: z.array(placeSchema).min(1, "должно быть хотя бы одно место"),
  performer: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
  director: z.object({
    fullName: nonEmpty,
  }),
});

export type LightingProtocolParsed = z.infer<typeof lightingProtocolSchema>;

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
