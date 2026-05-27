import { z } from "zod";
import { nonEmpty } from "@/lib/docs/zod-helpers";

export const coverDocumentSchema = z.object({
  customer: z.object({
    organization: nonEmpty,
    directorName: nonEmpty,
  }),
  performer: z.object({
    organization: nonEmpty,
    directorPosition: nonEmpty,
    directorName: nonEmpty,
  }),
  city: nonEmpty,
  reportYear: nonEmpty,
  archiveYear: nonEmpty,
});

export type CoverDocumentParsed = z.infer<typeof coverDocumentSchema>;
