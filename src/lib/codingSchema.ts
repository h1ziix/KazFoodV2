import { z } from "zod";
import { nonEmpty } from "@/lib/docs/zod-helpers";

const rowSchema = z.object({
  code: nonEmpty,
  name: nonEmpty,
  count: z.number().int().positive(),
});

const sectionSchema = z.object({
  number: z.number().int().positive(),
  title: nonEmpty,
  rows: z.array(rowSchema).min(1, "раздел должен содержать хотя бы одну строку"),
});

export const codingProtocolSchema = z.object({
  approval: z.object({
    position: nonEmpty,
    organization: nonEmpty,
    fullName: nonEmpty,
    date: z.object({
      day: nonEmpty,
      month: nonEmpty,
      year: nonEmpty,
    }),
  }),
  sections: z.array(sectionSchema).min(1, "должен быть хотя бы один раздел"),
});

export type CodingProtocolParsed = z.infer<typeof codingProtocolSchema>;
