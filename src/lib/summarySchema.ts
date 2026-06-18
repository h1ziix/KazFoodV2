import { z } from "zod";
import { nonEmpty, optStr } from "@/lib/docs/zod-helpers";

const classSchema = z.enum(["", "2", "3.1", "3.2", "3.3", "3.4", "4"], {
  errorMap: () => ({
    message: 'класс должен быть одним из "", "2", "3.1", "3.2", "3.3", "3.4", "4"',
  }),
});

const factorSchema = z.object({
  name: nonEmpty,
  method: optStr,
  norm: optStr,
  actual: optStr,
  classValue: classSchema,
});

const workplaceSchema = z.object({
  // Стабильный id строки кодировки — первичный ключ синхронизации; скрыт из
  // формы. Optional: легаси-строки без него матчатся по коду.
  codingRowId: z.string().optional(),
  code: nonEmpty,
  profession: nonEmpty,
  // Количество приходит из кодировки, где допустимы 0 и 1.
  count: z.number().int().min(0),
  // Факторы могут отсутствовать: новая должность из кодировки появляется в
  // сводном ещё до того, как у неё есть измерения (факторы добавляются второй
  // фазой синка из значений других протоколов). Пустой список валиден — при
  // рендере такая должность показывается строкой с пустыми колонками факторов.
  factors: z.array(factorSchema),
});

const placeSchema = z.object({
  number: z.number().int().positive(),
  name: nonEmpty,
  workplaces: z
    .array(workplaceSchema)
    .min(1, "должно быть хотя бы одно рабочее место"),
});

const measuringToolSchema = z.object({
  rowNumber: z.number().int().positive(),
  name: nonEmpty,
  certificate: nonEmpty,
  verificationDate: nonEmpty,
});

export const summaryProtocolSchema = z.object({
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
  measurementLocation: nonEmpty,
  measurementDate: z.object({
    day: nonEmpty,
    month: nonEmpty,
    year: nonEmpty,
  }),
  roomDescription: nonEmpty,
  collectiveProtection: nonEmpty,
  equipment: nonEmpty,
  professionsList: nonEmpty,
  measuringTools: z
    .array(measuringToolSchema)
    .min(1, "должен быть хотя бы один прибор"),
  productStandard: nonEmpty,
  conditions: z.object({
    temperature: nonEmpty,
    humidity: nonEmpty,
    pressure: nonEmpty,
  }),
  places: z.array(placeSchema).min(1, "должен быть хотя бы один раздел"),
  performer: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
  director: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
});

export type SummaryProtocolParsed = z.infer<typeof summaryProtocolSchema>;
