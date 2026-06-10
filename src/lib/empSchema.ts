import { z } from "zod";

const nonEmpty = z.string().min(1, "не должно быть пустым");

const rangeSchema = z.object({
  name: nonEmpty,
  distance: nonEmpty,
  height: nonEmpty,
  time: nonEmpty,
  electricMeasured: nonEmpty,
  electricAllowed: nonEmpty,
  magneticMeasured: nonEmpty,
  magneticAllowed: nonEmpty,
});

const measurementSchema = z.object({
  // Stable coding-row id — primary sync key; hidden in the form. Defaulted so
  // pre-existing rows still validate; legacy rows match by code/name instead.
  codingRowId: z.string().default(""),
  // Display code from coding (derived value, refreshed on sync).
  code: z.string().default(""),
  rowNumber: z.number().int().positive(),
  pointNumber: nonEmpty,
  place: nonEmpty,
  range1: rangeSchema,
  range2: rangeSchema,
});

const placeSchema = z.object({
  number: z.number().int().positive(),
  name: nonEmpty,
  measurements: z
    .array(measurementSchema)
    .min(1, "должно быть хотя бы одно измерение"),
});

export const empProtocolSchema = z.object({
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
  places: z.array(placeSchema).min(1, "должно быть хотя бы одно место"),
  performer: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
  director: z.object({
    fullName: nonEmpty,
  }),
});

export type EmpProtocolParsed = z.infer<typeof empProtocolSchema>;
