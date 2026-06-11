import { z } from "zod";

const nonEmpty = z.string().min(1, "не должно быть пустым");

const rowSchema = z.object({
  // Стабильный id строки кодировки — первичный ключ синхронизации; скрыт из
  // формы. Optional: легаси-строки без него матчатся по коду.
  codingRowId: z.string().optional(),
  code: nonEmpty,
  position: nonEmpty,
  // Количество приходит из кодировки, где допустимы 0 и 1.
  count: z.number().int().min(0),
  // «Нормированный перечень» — необязательное поле: пользователь заполняет его
  // вручную, когда есть данные. Пустое значение допустимо и НЕ ломает валидацию,
  // генерацию DOCX или сохранение. `.optional()` (а не просто z.string()) убирает
  // и красную ошибку, и пометку «обязательное» (*) в форме.
  normItems: z.string().optional(),
  issuedFact: nonEmpty,
  certificate: nonEmpty,
  assessment: nonEmpty,
  note: nonEmpty,
});

const sectionSchema = z.object({
  number: z.number().int().positive(),
  title: nonEmpty,
  rows: z.array(rowSchema).min(1, "раздел должен содержать хотя бы одну строку"),
});

export const sizProtocolSchema = z.object({
  protocol: z.object({
    number: nonEmpty,
  }),
  customer: z.object({
    name: nonEmpty,
    address: nonEmpty,
  }),
  measurementPlace: nonEmpty,
  measurementDate: z.object({
    day: nonEmpty,
    month: nonEmpty,
    year: nonEmpty,
  }),
  sections: z.array(sectionSchema).min(1, "должен быть хотя бы один раздел"),
  performer: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
  representative: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
});

export type SizProtocolParsed = z.infer<typeof sizProtocolSchema>;
