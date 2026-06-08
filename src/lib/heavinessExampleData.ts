import type { HeavinessProtocol, HeavinessWorkplace } from "@/types/heaviness";
import { ADMIN_HEAVINESS_NORMATIVE } from "@/lib/heavinessTemplates";

/**
 * Карточка административно-управленческого персонала — соответствует
 * "Директору" из исходного DOCX (все показатели — класс 1). Нормативная часть
 * берётся из общего реестра шаблонов, чтобы пример и синхронизация из кодировки
 * не расходились.
 */
function adminWorkplace(
  rowNumber: number,
  code: string,
  position: string,
): HeavinessWorkplace {
  return {
    rowNumber,
    code,
    position,
    measurementPlace: "Административно – управленческий персонал",
    ...structuredClone(ADMIN_HEAVINESS_NORMATIVE),
  };
}

export const heavinessExample: HeavinessProtocol = {
  protocol: {
    number: "1004-ТЯЖ",
    year: "2025",
    day: "10",
    month: "апреля",
    dateYear: "2026",
  },
  customer: {
    name: "",
    address: "",
  },
  measurementDate: {
    day: "10",
    month: "апреля",
    year: "2026",
  },
  workplaces: [
    adminWorkplace(1, "01 001 001", "Директор"),
    adminWorkplace(2, "01 001 002", "Управляющий производством"),
    adminWorkplace(3, "01 001 003", "Бухгалтер"),
  ],
  performer: {
    fullName: "",
    position: "",
  },
  representative: {
    fullName: "Богачев А.И.",
    position: "Инженер по БиОТ",
  },
};
