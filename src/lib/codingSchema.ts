import { z } from "zod";
import { nonEmpty } from "@/lib/docs/zod-helpers";
import { WORKPLACE_CODE_PATTERN } from "@/lib/docs/workplaceCodes";

const rowSchema = z
  .object({
    // Стабильная идентичность строки; проставляется normalizeCodingDocument,
    // скрыта из формы. Optional ради легаси-данных, созданных до введения id.
    id: z.string().optional(),
    // Код — производное значение (01 + раздел + порядковый номер аттестуемой
    // строки), назначается автоматически. У неаттестуемой строки (количество 0)
    // код пустой — формат проверяется условно в superRefine ниже.
    code: z.string(),
    name: nonEmpty,
    // Количество — только 0 или 1. 1 — аттестуемое рабочее место; 0 — должность
    // остаётся в Кодировке как справочная запись, но исключается из всех
    // протоколов и не получает код. Повторяющиеся должности заводятся
    // ОТДЕЛЬНЫМИ строками. Форма сбрасывает любой другой ввод к ближайшему
    // допустимому значению.
    count: z
      .number()
      .int()
      .min(0, "количество может быть только 0 или 1")
      .max(1, "количество может быть только 0 или 1"),
  })
  .superRefine((row, ctx) => {
    // Код назначается автоматически; это страховка от ручного дрейфа формата.
    if (row.count === 0) {
      if (row.code !== "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["code"],
          message: "у неаттестуемой должности (количество 0) код отсутствует",
        });
      }
    } else if (!WORKPLACE_CODE_PATTERN.test(row.code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["code"],
        message: "код назначается автоматически: 01 NNN NNN",
      });
    }
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
