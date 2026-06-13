import type { TensionProtocol, TensionWorkplace } from "@/types/tension";
import { UNIVERSAL_TENSION_NORMATIVE } from "@/lib/tensionTemplates";

const ADMIN_SECTION = "Административно – управленческий персонал";

/**
 * Карточка должности. Нормы у всех одинаковые (единая норма
 * UNIVERSAL_TENSION_NORMATIVE — профиль АУП), так же как их проставляет
 * синхронизация из кодировки, поэтому пример и синк не расходятся.
 */
function adminWorkplace(
  rowNumber: number,
  code: string,
  position: string,
): TensionWorkplace {
  return {
    rowNumber,
    code,
    position,
    measurementPlace: ADMIN_SECTION,
    ...structuredClone(UNIVERSAL_TENSION_NORMATIVE),
  };
}

export const tensionExample: TensionProtocol = {
  protocol: {
    number: "1004-НАП",
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
