import type { IntroDocument } from "@/types/intro";

export const introExample: IntroDocument = {
  customer: {
    name: "",
    city: "",
    address: "",
  },
  measurementDate: {
    day: "10",
    month: "апреля",
    year: "2026",
  },
  workplaceCount: 55,
  maleCount: 0,
  femaleCount: 0,
  performer: {
    organization: "ТОО «Центр экспертной оценки условий труда»",
    addressRu: "г. Алматы, Турксибский район, ул. Остроумова, 50А",
    addressKk: "Алматы қ., Турксиб ауданы, Остроумов көш., 50А үй",
    accreditation: {
      number: "KZ.T.02.Е 1210",
      dateRu: "25 июля 2022 года",
      dateKk: "2022 жылғы 25 шілдедегі",
    },
  },
  heavinessCounts: { c1: 13, c2: 42, c31: 0 },
  tensionCounts: { c1: 0, c2: 55, c31: 0 },
  safetyClassLabel: "допустимый 2",
};
