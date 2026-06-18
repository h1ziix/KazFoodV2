import { z } from "zod";
import { nonEmpty } from "@/lib/docs/zod-helpers";

const heavinessClassSchema = z.enum(["1", "2", "3.1", "3.2"]);

const indicatorSchema = z.object({
  value: z.string(),
  class: heavinessClassSchema,
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

  p1_1_regional: indicatorSchema,
  p1_2_general_1to5: indicatorSchema,
  p1_2_general_over5: indicatorSchema,

  p2_1_alternating: indicatorSchema,
  p2_2_constant: indicatorSchema,
  p2_3_fromSurface: indicatorSchema,
  p2_3_fromFloor: indicatorSchema,

  p3_1_local: indicatorSchema,
  p3_2_regional: indicatorSchema,

  p4_1_oneHand: indicatorSchema,
  p4_2_twoHands: indicatorSchema,
  p4_3_bodyAndLegs: indicatorSchema,

  p5_pose: indicatorSchema,

  p6_bends: indicatorSchema,

  p7_1_horizontal: indicatorSchema,
  p7_2_vertical: indicatorSchema,
});

export const heavinessProtocolSchema = z.object({
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

export type HeavinessProtocolParsed = z.infer<typeof heavinessProtocolSchema>;
