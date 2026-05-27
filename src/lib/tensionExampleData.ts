import type {
  TensionClass,
  TensionIndicator,
  TensionProtocol,
  TensionWorkplace,
} from "@/types/tension";

function ind(value: string, cls: TensionClass = "2"): TensionIndicator {
  return { value, class: cls };
}

/**
 * Шаблон карточки административно-управленческого персонала
 * (Директор и т.п.) — все показатели по факту соответствуют
 * классу 2 «Допустимый» согласно исходному DOCX №11.
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
    measurementPlace: "Административно – управленческий персонал",
    workDescription:
      "самостоятельно осуществлять трудовую деятельность в рамках предоставленных полномочий (нести полную ответственность за результаты своей работы).",
    finalAssessment: "2 класс – Допустимый.",

    // 1. Интеллектуальные нагрузки
    p1_1_content: ind("Решение простых задач по инструкции"),
    p1_2_signals: ind("Восприятие сигналов с последующей коррекцией действий"),
    p1_3_distribution: ind(
      "Обработка, выполнение задания и его проверка",
    ),
    p1_4_character: ind("Работа по установленному графику"),

    // 2. Сенсорные нагрузки
    p2_1_duration: ind("26 – 50"),
    p2_2_density: ind("76 – 175"),
    p2_3_objects: ind("6 – 10"),
    p2_4_sizeLong: ind("5 – 1,1 мм – более 50 %"),
    p2_5_optical: ind("до 25"),
    p2_6_videoTerminal: ind("до 3"),
    p2_7_voiceLoad: ind(
      "Разборчивость слов и сигналов от 90 до 70 %",
    ),
    p2_8_speakLoad: ind("16 – 20"),

    // 3. Эмоциональные нагрузки
    p3_1_responsibility: ind(
      "Несет ответственность за функциональное качество вспомогательных работ",
    ),
    p3_2_risk: ind("Исключена", "1"),
    p3_3_othersRisk: ind("Исключена", "1"),

    // 4. Монотонность нагрузок
    p4_1_elements: ind("9 – 6"),
    p4_2_duration: ind("100 – 25"),
    p4_3_active: ind("20 – 9"),
    p4_4_passive: ind("76 – 80"),

    // 5. Режим работы
    p5_1_duration: ind("8 – 9 ч"),
    p5_2_shift: ind("Односменная работа без ночной смены", "1"),
    p5_3_breaks: ind(
      "Перерывы регламентированы, достаточной продолжительности",
      "1",
    ),
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
    name: "ТОО «KazEcoFood»",
    address:
      "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
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
