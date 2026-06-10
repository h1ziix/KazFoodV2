export type HeavinessClass = "1" | "2" | "3.1" | "3.2";

export interface HeavinessIndicator {
  /** Фактическое значение показателя (например "до 2500", "более 5 м"). */
  value: string;
  /** Класс условий труда по данному показателю. */
  class: HeavinessClass;
}

/**
 * Карточка одного рабочего места — 14 показателей тяжести
 * трудового процесса по 7 разделам исходного протокола.
 */
export interface HeavinessWorkplace {
  /** Порядковый номер карточки (для нумерации ПРОТОКОЛ № NN). */
  rowNumber: number;
  /**
   * Стабильный id строки кодировки (CodingRow.id) — первичный ключ матчинга
   * при синхронизации. Скрыт из формы; легаси-карточки без него матчатся по коду.
   */
  codingRowId?: string;
  /** Код рабочего места, напр. "01 001 001" — отображаемое производное
   *  значение из кодировки, обновляется при синхронизации. */
  code: string;
  /** Наименование профессии/должности. */
  position: string;
  /** Место проведения оценки. */
  measurementPlace: string;
  /** Краткое описание выполняемой работы. */
  workDescription: string;
  /** Итоговая оценка тяжести труда (текст), напр. "1 класс – Оптимальный.". */
  finalAssessment: string;

  /** 1. Физическая динамическая нагрузка (кг·м). */
  p1_1_regional: HeavinessIndicator; // региональная, до 1м
  p1_2_general_1to5: HeavinessIndicator; // общая, от 1 до 5м
  p1_2_general_over5: HeavinessIndicator; // общая, более 5м

  /** 2. Масса поднимаемого и перемещаемого вручную груза (кг). */
  p2_1_alternating: HeavinessIndicator; // 2.1 при чередовании с другой работой
  p2_2_constant: HeavinessIndicator; // 2.2 постоянно в течение смены
  p2_3_fromSurface: HeavinessIndicator; // 2.3 с рабочей поверхности
  p2_3_fromFloor: HeavinessIndicator; // 2.3 с пола

  /** 3. Стереотипные рабочие движения (кол-во за смену). */
  p3_1_local: HeavinessIndicator;
  p3_2_regional: HeavinessIndicator;

  /** 4. Статическая нагрузка (кгс·сек). */
  p4_1_oneHand: HeavinessIndicator;
  p4_2_twoHands: HeavinessIndicator;
  p4_3_bodyAndLegs: HeavinessIndicator;

  /** 5. Рабочая поза. */
  p5_pose: HeavinessIndicator;

  /** 6. Наклоны корпуса (кол-во за смену). */
  p6_bends: HeavinessIndicator;

  /** 7. Перемещение в пространстве (км). */
  p7_1_horizontal: HeavinessIndicator;
  p7_2_vertical: HeavinessIndicator;
}

export interface HeavinessProtocol {
  protocol: {
    number: string;
    year: string;
    day: string;
    month: string;
    dateYear: string;
  };
  customer: {
    name: string;
    address: string;
  };
  measurementDate: {
    day: string;
    month: string;
    year: string;
  };
  workplaces: HeavinessWorkplace[];
  performer: {
    fullName: string;
    position: string;
  };
  representative: {
    fullName: string;
    position: string;
  };
}
