import { z } from "zod";

const nonEmpty = z.string().min(1, "не должно быть пустым");
const optStr = z.string();

const octaveSchema = z.object({
  hz31: optStr,
  hz63: optStr,
  hz125: optStr,
  hz250: optStr,
  hz500: optStr,
  hz1000: optStr,
  hz2000: optStr,
  hz4000: optStr,
});

const characterSchema = z.object({
  broadStationary: optStr,
  broadNonStationary: optStr,
  broadOscillating: optStr,
  broadImpulse: optStr,
  tonalStationary: optStr,
  tonalNonStationary: optStr,
  tonalOscillating: optStr,
  tonalImpulse: optStr,
});

const measurementSchema = z.object({
  rowNumber: z.number().int().positive(),
  pointNumber: nonEmpty,
  place: nonEmpty,
  // Hidden in the form UI; pre-filled so new rows arrive with correct DOCX values.
  time: z.string().default("7-8"),
  ppePresent: z.string().default("+"),
  ppeAbsent: z.string().default(""),
  sourceStationary: z.string().default("+"),
  sourceNonStationary: z.string().default(""),
  // Hidden in the form UI; user fills these directly in the DOCX.
  octaves: octaveSchema,
  character: characterSchema,
  measured: nonEmpty,
  allowed: nonEmpty,
});

const placeSchema = z.object({
  number: z.number().int().positive(),
  name: nonEmpty,
  measurements: z
    .array(measurementSchema)
    .min(1, "должно быть хотя бы одно измерение"),
});

export const noiseProtocolSchema = z.object({
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

export type NoiseProtocolParsed = z.infer<typeof noiseProtocolSchema>;
