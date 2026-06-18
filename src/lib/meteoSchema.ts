import { z } from "zod";
import { nonEmpty, optStr } from "@/lib/docs/zod-helpers";

const measurementSchema = z.object({
  // Stable coding-row id — primary sync key; hidden in the form. Defaulted so
  // pre-existing rows still validate; legacy rows match by code/name instead.
  codingRowId: z.string().default(""),
  // Display code from coding (derived value, refreshed on sync).
  code: z.string().default(""),
  rowNumber: z.number().int().positive(),
  pointNumber: nonEmpty,
  place: nonEmpty,
  workCategory: nonEmpty,
  timeOfDay: nonEmpty,
  tempMeasured: optStr,
  tempAllowed: optStr,
  humidityMeasured: optStr,
  humidityAllowed: optStr,
  airSpeedMeasured: optStr,
  airSpeedAllowed: optStr,
  pressure: optStr,
});

const placeSchema = z.object({
  number: z.number().int().positive(),
  name: nonEmpty,
  measurements: z
    .array(measurementSchema)
    .min(1, "должно быть хотя бы одно измерение"),
});

export const meteoProtocolSchema = z.object({
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

export type MeteoProtocolParsed = z.infer<typeof meteoProtocolSchema>;
