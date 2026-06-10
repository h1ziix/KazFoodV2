export type TensionClass = "1" | "2" | "3.1" | "3.2";

export interface TensionIndicator {
  /** Фактическое значение показателя (например "Решение простых задач"). */
  value: string;
  /** Класс условий труда по данному показателю. */
  class: TensionClass;
}

/**
 * Карточка одного рабочего места — 22 показателя напряжённости
 * трудового процесса по 5 разделам исходного протокола
 * (Р 2.2.2006-05, документ №11).
 */
export interface TensionWorkplace {
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
  /** Итоговая оценка напряжённости труда, напр. "2 класс – Допустимый.". */
  finalAssessment: string;

  /** 1. Интеллектуальные нагрузки. */
  p1_1_content: TensionIndicator; // 1.1 Содержание работы
  p1_2_signals: TensionIndicator; // 1.2 Восприятие сигналов и их оценка
  p1_3_distribution: TensionIndicator; // 1.3 Распределение функций по степени сложности
  p1_4_character: TensionIndicator; // 1.4 Характер выполняемой работы

  /** 2. Сенсорные нагрузки. */
  p2_1_duration: TensionIndicator; // 2.1 Длительность сосредоточенного наблюдения, %
  p2_2_density: TensionIndicator; // 2.2 Плотность сигналов и сообщений за 1 ч
  p2_3_objects: TensionIndicator; // 2.3 Число объектов одновременного наблюдения
  p2_4_sizeLong: TensionIndicator; // 2.4 Размер объекта различения при длительности более 50% смены, мм
  p2_5_optical: TensionIndicator; // 2.5 Работа с оптическими приборами, %
  p2_6_videoTerminal: TensionIndicator; // 2.6 Наблюдение за экранами видеотерминалов, ч
  p2_7_voiceLoad: TensionIndicator; // 2.7 Нагрузка на слуховой анализатор
  p2_8_speakLoad: TensionIndicator; // 2.8 Нагрузка на голосовой аппарат, ч/нед

  /** 3. Эмоциональные нагрузки. */
  p3_1_responsibility: TensionIndicator; // 3.1 Степень ответственности за результат
  p3_2_risk: TensionIndicator; // 3.2 Степень риска для собственной жизни
  p3_3_othersRisk: TensionIndicator; // 3.3 Ответственность за безопасность других лиц

  /** 4. Монотонность нагрузок. */
  p4_1_elements: TensionIndicator; // 4.1 Число элементов, необходимых для реализации простого задания
  p4_2_duration: TensionIndicator; // 4.2 Продолжительность выполнения простых заданий, с
  p4_3_active: TensionIndicator; // 4.3 Время активных действий, %
  p4_4_passive: TensionIndicator; // 4.4 Монотонность производственной обстановки, %

  /** 5. Режим работы. */
  p5_1_duration: TensionIndicator; // 5.1 Фактическая продолжительность рабочего дня
  p5_2_shift: TensionIndicator; // 5.2 Сменность работы
  p5_3_breaks: TensionIndicator; // 5.3 Наличие регламентированных перерывов
}

export interface TensionProtocol {
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
  workplaces: TensionWorkplace[];
  performer: {
    fullName: string;
    position: string;
  };
  representative: {
    fullName: string;
    position: string;
  };
}
