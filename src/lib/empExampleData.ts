import type { EmpMeasurement, EmpProtocol, EmpRange } from "@/types/emp";

const RANGE1_NAME = "5 Гц – 2 кГц";
const RANGE2_NAME = "2 кГц – 400 кГц";
const RANGE1_ELECTRIC_ALLOWED = "25";
const RANGE1_MAGNETIC_ALLOWED = "250";
const RANGE2_ELECTRIC_ALLOWED = "2,5";
const RANGE2_MAGNETIC_ALLOWED = "25";
const DEFAULT_DISTANCE = "0,5";
const DEFAULT_HEIGHT = "1,5";
const DEFAULT_TIME = "8";

export const empExample: EmpProtocol = {
  protocol: {
    number: "1004-ЭМП",
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
  purpose: "Аттестация рабочих мест",
  methodologyStandard:
    "МУК 4.3.045-96 Контроль электромагнитных излучений от видеодисплейных терминалов ПЭВМ.",
  productStandard:
    "Приказ Министра здравоохранения Республики Казахстан от 16 февраля 2022 года № ҚР ДСМ-15. «Об утверждении гигиенических нормативов к условиям труда»",
  representative: "Богачев А.И.",
  places: [
    {
      number: 1,
      name: "Административно – управленческий персонал",
      measurements: [
        m(1, "1т", "Директор", "12,5", "85"),
        m(2, "2т", "Управляющий производством", "13,0", "90"),
        m(3, "3т", "Бухгалтер", "11,8", "82"),
        m(4, "4т", "Коммерческий директор", "12,2", "88"),
        m(5, "5т", "Технический директор", "13,5", "92"),
        m(6, "6т", "Менеджер по продажам", "12,7", "86"),
        m(7, "7т", "Менеджер по продажам", "12,9", "87"),
        m(8, "8т", "Менеджер по снабжению", "11,5", "80"),
        m(9, "9т", "Главный механик", "13,2", "91"),
        m(10, "10т", "Главный энергетик", "12,4", "84"),
        m(11, "11т", "Специалист по кадровым вопросам", "11,9", "83"),
        m(12, "12т", "Начальник службы безопасности", "12,1", "85"),
        m(13, "13т", "Специалист по безопасности и охране труда", "12,6", "86"),
      ],
    },
    {
      number: 2,
      name: "Производственный персонал",
      measurements: [
        m(14, "14т", "Технолог оператор", "13,8", "94"),
      ],
    },
  ],
  performer: {
    fullName: "",
    position: "",
  },
  director: {
    fullName: "",
  },
};

function range1(
  electricMeasured: string,
  magneticMeasured: string,
): EmpRange {
  return {
    name: RANGE1_NAME,
    distance: DEFAULT_DISTANCE,
    height: DEFAULT_HEIGHT,
    time: DEFAULT_TIME,
    electricMeasured,
    electricAllowed: RANGE1_ELECTRIC_ALLOWED,
    magneticMeasured,
    magneticAllowed: RANGE1_MAGNETIC_ALLOWED,
  };
}

function range2(): EmpRange {
  return {
    name: RANGE2_NAME,
    distance: DEFAULT_DISTANCE,
    height: DEFAULT_HEIGHT,
    time: DEFAULT_TIME,
    electricMeasured: "1,2",
    electricAllowed: RANGE2_ELECTRIC_ALLOWED,
    magneticMeasured: "8,5",
    magneticAllowed: RANGE2_MAGNETIC_ALLOWED,
  };
}

function m(
  rowNumber: number,
  pointNumber: string,
  place: string,
  range1Electric: string,
  range1Magnetic: string,
): EmpMeasurement {
  return {
    code: "",
    rowNumber,
    pointNumber,
    place,
    range1: range1(range1Electric, range1Magnetic),
    range2: range2(),
  };
}
