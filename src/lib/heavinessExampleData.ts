import type {
  HeavinessClass,
  HeavinessIndicator,
  HeavinessProtocol,
  HeavinessWorkplace,
} from "@/types/heaviness";

function ind(value: string, cls: HeavinessClass = "1"): HeavinessIndicator {
  return { value, class: cls };
}

/**
 * Шаблон карточки для административно-управленческого персонала —
 * соответствует "Директору" из исходного DOCX (все показатели — класс 1).
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
    workDescription:
      "самостоятельно осуществлять трудовую деятельность в рамках предоставленных полномочий (нести полную ответственность за результаты своей работы).",
    finalAssessment: "1 класс – Оптимальный.",

    p1_1_regional: ind("до 2500"),
    p1_2_general_1to5: ind("до 12500"),
    p1_2_general_over5: ind("до 24000"),

    p2_1_alternating: ind("до 15"),
    p2_2_constant: ind("до 5"),
    p2_3_fromSurface: ind("до 250"),
    p2_3_fromFloor: ind("до 100"),

    p3_1_local: ind("до 10000"),
    p3_2_regional: ind("до 10000"),

    p4_1_oneHand: ind("до 12000"),
    p4_2_twoHands: ind("до 10000"),
    p4_3_bodyAndLegs: ind("до 43000"),

    p5_pose: ind("Сидя более 60 %", "2"),

    p6_bends: ind("до 50"),

    p7_1_horizontal: ind("до 4 км"),
    p7_2_vertical: ind("до 2 км"),
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
    name: "ТОО «KazEcoFood»",
    address: "Алматы қ., Түрксіб ауданы, Остроумов көш., 50А үй",
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
    fullName: "Исаева А.В.",
    position: "Специалист лаборатории",
  },
  representative: {
    fullName: "Богачев А.И.",
    position: "Инженер по БиОТ",
  },
};
