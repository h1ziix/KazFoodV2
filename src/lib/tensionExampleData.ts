import type { TensionProtocol, TensionWorkplace } from "@/types/tension";
import { resolveTensionNormativeByPosition } from "@/lib/tensionTemplates";

const ADMIN_SECTION = "Административно – управленческий персонал";

/**
 * Карточка административно-управленческого персонала. Нормативная часть берётся
 * из общего реестра шаблонов по должности (профили — из эталонного DOCX), чтобы
 * пример и синхронизация из кодировки не расходились.
 */
function adminWorkplace(
  rowNumber: number,
  code: string,
  position: string,
): TensionWorkplace {
  const normative = resolveTensionNormativeByPosition(position, ADMIN_SECTION);
  if (!normative) {
    throw new Error(`tensionExample: нет норматива для должности "${position}"`);
  }
  return {
    rowNumber,
    code,
    position,
    measurementPlace: ADMIN_SECTION,
    ...structuredClone(normative),
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
