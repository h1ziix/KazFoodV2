import { z } from "zod";
import { nonEmpty } from "@/lib/docs/zod-helpers";

const nonNegInt = z.number().int().nonnegative();

const classCountsSchema = z.object({
  c1: nonNegInt,
  c2: nonNegInt,
  c31: nonNegInt,
});

export const introDocumentSchema = z.object({
  customer: z.object({
    name: nonEmpty,
    city: nonEmpty,
    address: nonEmpty,
  }),
  measurementDate: z.object({
    day: nonEmpty,
    month: nonEmpty,
    year: nonEmpty,
  }),
  workplaceCount: nonNegInt,
  maleCount: nonNegInt,
  femaleCount: nonNegInt,
  performer: z.object({
    organization: nonEmpty,
    addressRu: nonEmpty,
    addressKk: nonEmpty,
    accreditation: z.object({
      number: nonEmpty,
      dateRu: nonEmpty,
      dateKk: nonEmpty,
    }),
  }),
  heavinessCounts: classCountsSchema,
  tensionCounts: classCountsSchema,
  safetyClassLabel: nonEmpty,
});

export type IntroDocumentParsed = z.infer<typeof introDocumentSchema>;
