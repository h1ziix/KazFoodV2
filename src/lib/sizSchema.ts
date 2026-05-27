import { z } from "zod";

const nonEmpty = z.string().min(1, "не должно быть пустым");

const rowSchema = z.object({
  code: nonEmpty,
  position: nonEmpty,
  count: z.number().int().positive(),
  normItems: nonEmpty,
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
