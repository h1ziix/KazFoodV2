import { z } from "zod";

const nonEmpty = z.string().min(1, "не должно быть пустым");

const tensionClassSchema = z.enum(["1", "2", "3.1", "3.2"]);

const indicatorSchema = z.object({
  value: z.string(),
  class: tensionClassSchema,
});

const workplaceSchema = z.object({
  rowNumber: z.number().int().positive(),
  // Стабильный id строки кодировки — первичный ключ синхронизации; скрыт из
  // формы. Optional: легаси-карточки без него матчатся по коду.
  codingRowId: z.string().optional(),
  code: nonEmpty,
  position: nonEmpty,
  measurementPlace: nonEmpty,
  workDescription: nonEmpty,
  finalAssessment: nonEmpty,

  // 1. Интеллектуальные нагрузки
  p1_1_content: indicatorSchema,
  p1_2_signals: indicatorSchema,
  p1_3_distribution: indicatorSchema,
  p1_4_character: indicatorSchema,

  // 2. Сенсорные нагрузки
  p2_1_duration: indicatorSchema,
  p2_2_density: indicatorSchema,
  p2_3_objects: indicatorSchema,
  p2_4_sizeLong: indicatorSchema,
  p2_5_optical: indicatorSchema,
  p2_6_videoTerminal: indicatorSchema,
  p2_7_voiceLoad: indicatorSchema,
  p2_8_speakLoad: indicatorSchema,

  // 3. Эмоциональные нагрузки
  p3_1_responsibility: indicatorSchema,
  p3_2_risk: indicatorSchema,
  p3_3_othersRisk: indicatorSchema,

  // 4. Монотонность нагрузок
  p4_1_elements: indicatorSchema,
  p4_2_duration: indicatorSchema,
  p4_3_active: indicatorSchema,
  p4_4_passive: indicatorSchema,

  // 5. Режим работы
  p5_1_duration: indicatorSchema,
  p5_2_shift: indicatorSchema,
  p5_3_breaks: indicatorSchema,
});

export const tensionProtocolSchema = z.object({
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
  workplaces: z
    .array(workplaceSchema)
    .min(1, "должно быть хотя бы одно рабочее место"),
  performer: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
  representative: z.object({
    fullName: nonEmpty,
    position: nonEmpty,
  }),
});

export type TensionProtocolParsed = z.infer<typeof tensionProtocolSchema>;
