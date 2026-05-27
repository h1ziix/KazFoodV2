import { z } from "zod";
import { nonEmpty, optStr } from "./docs/zod-helpers";

const conclusionClassSchema = z.enum(
  ["", "2", "3.1", "3.2", "3.3", "3.4", "4"],
  {
    errorMap: () => ({
      message:
        'класс должен быть одним из "", "2", "3.1", "3.2", "3.3", "3.4", "4"',
    }),
  },
);

const conclusionRowSchema = z.object({
  // labelKk допускает пусто: под-строки факторов (мужчины/женщины) в
  // примере данных и в исходном DOCX не имеют казахского названия —
  // оно «наследуется» из заголовочной строки выше. См. также
  // src/lib/conclusionExampleData.ts.
  labelKk: optStr,
  labelRu: nonEmpty,
  classValue: conclusionClassSchema,
  count: z.union([z.number().int().nonnegative(), z.literal("")]),
});

export const conclusionProtocolSchema = z.object({
  customer: z.object({
    name: nonEmpty,
    address: nonEmpty,
  }),
  measurementPlace: nonEmpty,
  workplaceCodeNote: nonEmpty,
  totalWorkplaces: nonEmpty,
  measurementDate: z.object({
    day: nonEmpty,
    month: nonEmpty,
    year: nonEmpty,
  }),
  rows: z.array(conclusionRowSchema).min(1, "должна быть хотя бы одна строка"),
  performer: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
  laboratoryHead: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
  representative: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
});

export type ConclusionProtocolParsed = z.infer<typeof conclusionProtocolSchema>;
