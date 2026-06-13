import type {
  TensionClass,
  TensionIndicator,
  TensionWorkplace,
} from "@/types/tension";

/**
 * Нормативная (наследуемая) часть карточки напряжённости — всё, кроме полей
 * идентичности (`rowNumber`, `code`, `position`, `measurementPlace`), которые
 * задаются из кодировки при синхронизации.
 *
 * ВАЖНО про напряжённость: DOCX-шаблон (tension-protocol.docx) НЕ содержит
 * плейсхолдеров `{*_value}` — рендерятся только метки класса
 * (`*_c1/_c2/_c31/_c32`) и счётчики `count_*`, которые generateTensionDocx
 * пересчитывает из классов. Поэтому для DOCX значим ТОЛЬКО `class` каждого
 * показателя; текстовый `value` в документ не выводится и не валидируется, но
 * заполняется из таблицы градаций (TENSION_GRADATIONS) по классу — чтобы
 * показываться в форме-редакторе.
 */
export type TensionNormative = Omit<
  TensionWorkplace,
  "rowNumber" | "code" | "position" | "measurementPlace"
>;

/**
 * Единый текст «Краткое описание выполняемой работы» для ВСЕХ карточек протокола
 * «Напряжённость» (в эталонном DOCX он одинаков у всех должностей). Один
 * источник истины: меняется здесь — применяется ко всему протоколу (в т.ч. к
 * `defaultTension` в syncWorkplaces).
 */
export const TENSION_WORK_DESCRIPTION =
  "самостоятельно осуществлять трудовую деятельность в рамках предоставленных полномочий (нести полную ответственность за результаты своей работы).";

/** Единая итоговая оценка. В эталоне все должности — «2 класс – Допустимый.». */
export const TENSION_FINAL_ASSESSMENT = "2 класс – Допустимый.";

/** Заголовки секций кодировки (= `measurementPlace`). */
const SECTION_ADMIN = "Административно – управленческий персонал";
const SECTION_PRODUCTION = "Производственный персонал";

/** Порядок 22 показателей — строго как в карточке/шаблоне (разделы 1–5). */
const TENSION_FIELD_ORDER = [
  "p1_1_content", "p1_2_signals", "p1_3_distribution", "p1_4_character",
  "p2_1_duration", "p2_2_density", "p2_3_objects", "p2_4_sizeLong",
  "p2_5_optical", "p2_6_videoTerminal", "p2_7_voiceLoad", "p2_8_speakLoad",
  "p3_1_responsibility", "p3_2_risk", "p3_3_othersRisk",
  "p4_1_elements", "p4_2_duration", "p4_3_active", "p4_4_passive",
  "p5_1_duration", "p5_2_shift", "p5_3_breaks",
] as const;

/** Компактная кодировка класса одним символом в строке профиля. */
const PROFILE_CHAR_TO_CLASS: Record<string, TensionClass> = {
  "1": "1",
  "2": "2",
  a: "3.1",
  b: "3.2",
};

/**
 * Стандартные градации Р 2.2.2006-05: текст значения показателя определяется его
 * КЛАССОМ (value = градация для класса). В эталонном протоколе напряжённости
 * текстов значений нет — там только классы (метка «+»), и DOCX-шаблон value не
 * выводит. Поэтому value берём из этой таблицы и показываем в форме-редакторе,
 * чтобы карточка после Sync выглядела заполненной (как в «Тяжести»).
 *
 * Источник фраз: реальные формулировки из прежнего ADMIN_TENSION_NORMATIVE
 * (значения, что были в коде) + методика Р 2.2.2006-05 для недостающих классов.
 * В эталоне встречаются только классы 1 и 2, поэтому заполнены они (для 3.1/3.2
 * — единственный используемый класс). Класса нет в таблице → value = "".
 */
const TENSION_GRADATIONS: Record<
  (typeof TENSION_FIELD_ORDER)[number],
  Partial<Record<TensionClass, string>>
> = {
  // 1. Интеллектуальные нагрузки
  p1_1_content: {
    "1": "Отсутствует необходимость принятия решения",
    "2": "Решение простых задач по инструкции",
  },
  p1_2_signals: {
    "1": "Восприятие сигналов, но не требуется коррекция действий",
    "2": "Восприятие сигналов с последующей коррекцией действий и операций",
  },
  p1_3_distribution: {
    "1": "Обработка и выполнение задания",
    "2": "Обработка, выполнение задания и его проверка",
  },
  p1_4_character: {
    "1": "Работа по индивидуальному плану",
    "2": "Работа по установленному графику с возможной его коррекцией по ходу деятельности",
  },
  // 2. Сенсорные нагрузки
  p2_1_duration: { "1": "до 25", "2": "26 – 50" },
  p2_2_density: { "1": "до 75", "2": "76 – 175" },
  p2_3_objects: { "1": "до 5", "2": "6 – 10" },
  p2_4_sizeLong: {
    "1": "более 5 мм – 100 %",
    "2": "5 – 1,1 мм – более 50 %",
  },
  p2_5_optical: { "1": "до 25", "2": "26 – 50" },
  p2_6_videoTerminal: { "1": "до 2", "2": "до 3" },
  p2_7_voiceLoad: {
    "1": "Разборчивость слов и сигналов от 100 до 90 %",
    "2": "Разборчивость слов и сигналов от 90 до 70 %",
  },
  p2_8_speakLoad: { "1": "до 16", "2": "16 – 20" },
  // 3. Эмоциональные нагрузки
  p3_1_responsibility: {
    "2": "Несет ответственность за функциональное качество вспомогательных работ",
  },
  p3_2_risk: { "1": "Исключена" },
  // 3.3 класс 2 в стандарте отсутствует — формулировка «Возможна» как дефолт.
  p3_3_othersRisk: { "1": "Исключена", "2": "Возможна" },
  // 4. Монотонность нагрузок
  p4_1_elements: { "1": "более 10", "2": "9 – 6" },
  p4_2_duration: { "1": "более 100", "2": "100 – 25" },
  // 4.3 класс 2: сохранена формулировка прежнего ADMIN «20 – 9».
  p4_3_active: { "1": "20 и более", "2": "20 – 9" },
  p4_4_passive: { "1": "менее 75", "2": "76 – 80" },
  // 5. Режим работы
  p5_1_duration: { "1": "6 – 7 ч", "2": "8 – 9 ч" },
  p5_2_shift: {
    "1": "Односменная работа без ночной смены",
    "2": "Двухсменная работа без ночной смены",
  },
  p5_3_breaks: {
    "1": "Перерывы регламентированы, достаточной продолжительности",
    "2": "Перерывы регламентированы, недостаточной продолжительности",
  },
};

/**
 * Строит норматив из компактной строки профиля длиной 22 символа: каждый символ
 * — класс показателя в порядке TENSION_FIELD_ORDER ("1"→кл.1, "2"→кл.2, "a"→3.1,
 * "b"→3.2). `workDescription`/`finalAssessment` — единые для протокола; `value`
 * каждого показателя берётся из TENSION_GRADATIONS по его классу.
 *
 * Профили (классы) взяты из эталона «11. Напряженность каз-рус ГОТОВО KAZFOOD».
 */
function tensionNormative(profile: string): TensionNormative {
  const chars = profile.replace(/\s+/g, "");
  if (chars.length !== TENSION_FIELD_ORDER.length) {
    throw new Error(
      `tensionNormative: профиль должен содержать ${TENSION_FIELD_ORDER.length} символов, получено ${chars.length}: "${profile}"`,
    );
  }
  const indicators = {} as Record<
    (typeof TENSION_FIELD_ORDER)[number],
    TensionIndicator
  >;
  TENSION_FIELD_ORDER.forEach((field, i) => {
    const cls = PROFILE_CHAR_TO_CLASS[chars[i]];
    if (!cls) {
      throw new Error(
        `tensionNormative: недопустимый символ класса "${chars[i]}" в профиле "${profile}"`,
      );
    }
    indicators[field] = {
      value: TENSION_GRADATIONS[field][cls] ?? "",
      class: cls,
    };
  });
  return {
    workDescription: TENSION_WORK_DESCRIPTION,
    finalAssessment: TENSION_FINAL_ASSESSMENT,
    ...indicators,
  } as TensionNormative;
}

/**
 * Норматив по точному наименованию должности — универсальный ключ (профессии
 * одинаковы у разных клиентов, в отличие от кодов). Профили — из эталона.
 *
 * «Технолог оператор» присутствует здесь как универсальный фолбэк
 * (производственный профиль), но его секционные варианты разводит
 * `tensionNormativeBySectionPosition`, который проверяется ПЕРВЫМ.
 */
export const tensionNormativeByPosition: Record<string, TensionNormative> = {
  // --- Административно-управленческий персонал ---
  "Директор": tensionNormative("2222111211122121112212"),
  "Управляющий производством": tensionNormative("2222222211222122121212"),
  "Бухгалтер": tensionNormative("2222111111112112121111"),
  "Коммерческий директор": tensionNormative("2222111211122121112212"),
  "Технический директор": tensionNormative("2222111211122121121212"),
  "Менеджер по продажам": tensionNormative("2222111211112112121212"),
  "Менеджер по снабжению": tensionNormative("2222111211112112121211"),
  "Главный механик": tensionNormative("1111222211222122222212"),
  "Главный энергетик": tensionNormative("1111222211222122222212"),
  "Специалист по кадровым вопросам": tensionNormative("2222111211222121121212"),
  "Начальник службы безопасности": tensionNormative("2222222211122121111212"),
  "Специалист по безопасности и охране труда": tensionNormative("2222222211222121121212"),

  // --- Производственный персонал ---
  "Бригадир ремонтно-строительной бригады": tensionNormative("1111222211222122222212"),
  "Бригадир технической бригады": tensionNormative("1111222211222122222212"),
  "Бригадир цеха выращивания и хранения": tensionNormative("1111222211222122222212"),
  "Электро слесарь": tensionNormative("1111222211222112222212"),
  "Водитель экспедитор": tensionNormative("1111212211222112222212"),
  "Лаборант": tensionNormative("2222222221112112222121"),
  "Поливщик": tensionNormative("1111212211112112222212"),
  "Сборщик": tensionNormative("1111112211112112222111"),
  "Фасовщик": tensionNormative("1111112211112112222111"),
  "Грузчик": tensionNormative("1111212111222112222212"),
  "Тракторист": tensionNormative("1212222221222122222212"),
  "Разнорабочий": tensionNormative("1111222211222112222212"),
  "Слесарь": tensionNormative("1111222212112122222111"),
  // «Сторож»: 7 из 9 карточек эталона имеют этот профиль (он же совпадает со
  // строкой «итого по классам»); 2 карточки расходятся на один показатель —
  // опечатка в источнике. Берём профиль большинства.
  "Сторож": tensionNormative("1111222212112122222111"),
  "Шеф повар": tensionNormative("1111222211112112222212"),
  "Шеф-повар": tensionNormative("1111222211112112222212"),
  "Посудомойщица": tensionNormative("1111212111112112222212"),
  "Прачка": tensionNormative("1111111111112112222212"),

  // Универсальный фолбэк для коллизии имён (если секция не совпала с композитным
  // ключом ниже) — производственный профиль «Технолог оператор».
  "Технолог оператор": tensionNormative("1111222221222112222212"),
};

/**
 * Норматив с учётом СЕКЦИИ — для должностей, чьё имя повторяется в разных
 * секциях с разными профилями. Единственный такой случай в эталоне — «Технолог
 * оператор» (АУП ≠ производство). Проверяется ПЕРЕД `tensionNormativeByPosition`.
 *
 * Почему секция, а не код: в «Тяжести» одноимённые должности разводятся по коду
 * рабочего места, но коды зависят от клиента и не совпадают с кодами эталона —
 * поэтому для напряжённости устойчивый ключ — это «секция + должность».
 */
export const tensionNormativeBySectionPosition: Record<string, TensionNormative> =
  {
    [`${SECTION_ADMIN}|Технолог оператор`]: tensionNormative(
      "2222222221112112121212",
    ),
    [`${SECTION_PRODUCTION}|Технолог оператор`]: tensionNormative(
      "1111222221222112222212",
    ),
  };

/**
 * Норматив по наименованию секции — самый общий фолбэк, когда нет норматива по
 * должности (например, профессия, которой нет в эталоне). Гарантирует, что после
 * синка новая карточка непустая и проходит валидацию.
 */
export const tensionNormativeBySection: Record<string, TensionNormative> = {
  [SECTION_ADMIN]: tensionNormative("2222111211122121112212"), // как «Директор»
  [SECTION_PRODUCTION]: tensionNormative("1111222211222112222212"), // типовой рабочий
};

/**
 * ЕДИНАЯ норма напряжённости для ВСЕХ должностей любого раздела (по решению
 * клиента: нормы одинаковые у всех). Эталон — профиль АУП (как «Директор»).
 * Применяется ко всем новым карточкам при синхронизации; заполненные вручную
 * карточки не перезаписываются.
 */
export const UNIVERSAL_TENSION_NORMATIVE: TensionNormative = tensionNormative(
  "2222111211122121112212",
);

/** Приводит ключ (должность/секция) к каноничному виду для устойчивого поиска. */
function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-–—]/g, "-");
}

/** Композитный ключ «секция|должность» из нормализованных частей. */
function sectionPositionKey(sectionTitle: string, position: string): string {
  return `${normalizeKey(sectionTitle)}|${normalizeKey(position)}`;
}

const bySectionPositionNormalized = new Map<string, TensionNormative>(
  Object.entries(tensionNormativeBySectionPosition).map(([k, v]) => {
    const sep = k.indexOf("|");
    return [sectionPositionKey(k.slice(0, sep), k.slice(sep + 1)), v];
  }),
);
const byPositionNormalized = new Map<string, TensionNormative>(
  Object.entries(tensionNormativeByPosition).map(([k, v]) => [
    normalizeKey(k),
    v,
  ]),
);
const bySectionNormalized = new Map<string, TensionNormative>(
  Object.entries(tensionNormativeBySection).map(([k, v]) => [
    normalizeKey(k),
    v,
  ]),
);

/**
 * Норматив по должности с учётом секции. Приоритет: точное «секция+должность»
 * (разводит одноимённые должности из разных секций, напр. «Технолог оператор»),
 * затем — по одному имени должности. `undefined`, если норматива нет.
 */
export function resolveTensionNormativeByPosition(
  position: string,
  sectionTitle: string,
): TensionNormative | undefined {
  return (
    bySectionPositionNormalized.get(
      sectionPositionKey(sectionTitle, position),
    ) ?? byPositionNormalized.get(normalizeKey(position))
  );
}

/** Норматив по наименованию секции — общий фолбэк. `undefined`, если нет. */
export function resolveTensionNormativeBySection(
  sectionTitle: string,
): TensionNormative | undefined {
  return bySectionNormalized.get(normalizeKey(sectionTitle));
}
