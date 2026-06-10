import { z } from "zod";
import { nonEmpty } from "@/lib/docs/zod-helpers";
import { WORKPLACE_CODE_PATTERN } from "@/lib/docs/workplaceCodes";

const rowSchema = z.object({
  // Стабильная идентичность строки; проставляется normalizeCodingDocument,
  // скрыта из формы. Optional ради легаси-данных, созданных до введения id.
  id: z.string().optional(),
  // Код — производное значение (01 + раздел + позиция), назначается
  // автоматически; regex — страховка от ручного дрейфа формата.
  code: z
    .string()
    .regex(WORKPLACE_CODE_PATTERN, "код назначается автоматически: 01 NNN NNN"),
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
