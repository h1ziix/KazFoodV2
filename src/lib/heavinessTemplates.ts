import type {
  HeavinessClass,
  HeavinessIndicator,
  HeavinessWorkplace,
} from "@/types/heaviness";

/**
 * BUSINESS RULE — the workplace CODE is the single source of truth.
 *
 * A position in the Heaviness protocol is identified by its coding `code`
 * (format "XX XXX XXX", e.g. "01 001 015"), never by its name. The code is
 * opaque input from Coding: it is never generated, computed, or derived — the
 * registry keys below are the real codes as they appear in Coding.
 *
 * Names repeat across the coding («Технолог оператор» = 01 001 013 AND
 * 01 001 014), so the primary registry is keyed by code and matched by EXACT
 * code FIRST during sync. Position/section registries exist only as fallbacks
 * for rows that have no code-pinned norm.
 *
 * Lookup priority: code (exact) → position → section.
 *
 * When adding a norm that must apply to one specific coding row, put it in
 * `heavinessNormativeByCode` under its real code. Use the name/section maps
 * only for generic norms safe to share across same-named/same-section rows.
 */

/**
 * Нормативная (наследуемая) часть карточки тяжести — всё, кроме полей
 * идентичности (`rowNumber`, `code`, `position`, `measurementPlace`), которые
 * задаются из кодировки при синхронизации.
 *
 * Именно эти поля раньше оставались пустыми после Sync. Реестр нормативов ниже
 * позволяет заполнять их автоматически для известных должностей/секций.
 */
export type HeavinessNormative = Omit<
  HeavinessWorkplace,
  "rowNumber" | "code" | "position" | "measurementPlace"
>;

function ind(value: string, cls: HeavinessClass = "1"): HeavinessIndicator {
  return { value, class: cls };
}

/**
 * Единый текст «Краткое описание выполняемой работы» для ВСЕХ должностей
 * протокола «Тяжесть» (в т.ч. для карточек без шаблона — см. defaultHeaviness).
 * Один источник истины: меняется здесь — применяется ко всему протоколу.
 */
export const HEAVINESS_WORK_DESCRIPTION =
  "Самостоятельно осуществлять трудовую деятельность в рамках предоставленных полномочий, нести полную ответственность за результаты своей работы.";

/**
 * Норматив для административно-управленческого персонала — все показатели
 * класса 1 (оптимальный), соответствует «Директору» из исходного DOCX.
 */
export const ADMIN_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
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

/**
 * Норматив «Технолог оператор» (код 01 001 014, производственный персонал) —
 * по карте тяжести труда все показатели класса 1 (оптимальный). Привязан к
 * коду, а не к названию: одноимённая должность есть и в АУП (01 001 013).
 */
export const TECHNOLOGIST_OPERATOR_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "1 класс — Оптимальный",

  p1_1_regional: ind("до 2500"),
  p1_2_general_1to5: ind("до 12500"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15"),
  p2_2_constant: ind("до 5"),
  p2_3_fromSurface: ind("до 250"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000"),
  p3_2_regional: ind("до 10000"),

  p4_1_oneHand: ind("до 18000"),
  p4_2_twoHands: ind("до 36000"),
  p4_3_bodyAndLegs: ind("до 43000"),

  p5_pose: ind("сидя более 70%"),

  p6_bends: ind("до 50"),

  p7_1_horizontal: ind("до 4 км"),
  p7_2_vertical: ind("до 2 км"),
};

/**
 * Норматив «Бригадир ремонтно-строительной бригады» (код 01 001 015) — по карте
 * тяжести труда итог класс 2 (допустимый), часть показателей класса 2.
 */
export const FOREMAN_REPAIR_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500", "2"),
  p1_2_general_1to5: ind("до 12500", "2"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15"),
  p2_2_constant: ind("до 5", "2"),
  p2_3_fromSurface: ind("до 250"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000", "2"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000"),
  p4_2_twoHands: ind("до 36000"),
  p4_3_bodyAndLegs: ind("до 43000", "2"),

  p5_pose: ind("стоя менее 70%", "2"),

  p6_bends: ind("до 50", "2"),

  p7_1_horizontal: ind("до 4 км", "2"),
  p7_2_vertical: ind("до 2 км", "2"),
};

/**
 * Норматив «Бригадир технической бригады» (код 01 001 016) — по карте тяжести
 * труда итог класс 2 (допустимый), часть показателей класса 2.
 */
export const FOREMAN_TECHNICAL_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500", "2"),
  p1_2_general_1to5: ind("до 12500", "2"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15"),
  p2_2_constant: ind("до 5", "2"),
  p2_3_fromSurface: ind("до 250"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000", "2"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000"),
  p4_2_twoHands: ind("до 36000"),
  p4_3_bodyAndLegs: ind("до 43000", "2"),

  p5_pose: ind("стоя менее 70%", "2"),

  p6_bends: ind("до 50", "2"),

  p7_1_horizontal: ind("до 4 км", "2"),
  p7_2_vertical: ind("до 2 км", "2"),
};

/**
 * Норматив «Бригадир цеха выращивания и хранения» (код 01 002 017) — по карте
 * тяжести труда итог класс 2 (допустимый), часть показателей класса 2.
 */
export const FOREMAN_GROWING_STORAGE_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500", "2"),
  p1_2_general_1to5: ind("до 12500", "2"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15"),
  p2_2_constant: ind("до 5", "2"),
  p2_3_fromSurface: ind("до 250"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000"),
  p4_2_twoHands: ind("до 36000"),
  p4_3_bodyAndLegs: ind("до 43000"),

  p5_pose: ind("стоя менее 70%", "2"),

  p6_bends: ind("до 50"),

  p7_1_horizontal: ind("до 4 км", "2"),
  p7_2_vertical: ind("до 2 км", "2"),
};

/**
 * Норматив «Электрослесарь» (код 01 002 018) — по карте тяжести труда итог
 * класс 2 (допустимый), часть показателей класса 2.
 */
export const ELECTRICIAN_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500", "2"),
  p1_2_general_1to5: ind("до 12500", "2"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15", "2"),
  p2_2_constant: ind("до 5", "2"),
  p2_3_fromSurface: ind("до 250"),
  p2_3_fromFloor: ind("до 100", "2"),

  p3_1_local: ind("до 20000"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000"),
  p4_2_twoHands: ind("до 36000"),
  p4_3_bodyAndLegs: ind("до 43000", "2"),

  p5_pose: ind("стоя менее 70%", "2"),

  p6_bends: ind("до 50", "2"),

  p7_1_horizontal: ind("до 4 км", "2"),
  p7_2_vertical: ind("до 2 км", "2"),
};

/**
 * Норматив по коду рабочего места (наивысший приоритет — выше должности, секции
 * и наследования от соседей). Используйте, когда норматив должен быть привязан
 * к конкретной строке кодировки, а не к названию профессии.
 */
export const heavinessNormativeByCode: Record<string, HeavinessNormative> = {
  "01 001 014": TECHNOLOGIST_OPERATOR_HEAVINESS_NORMATIVE,
  "01 001 015": FOREMAN_REPAIR_HEAVINESS_NORMATIVE,
  "01 001 016": FOREMAN_TECHNICAL_HEAVINESS_NORMATIVE,
  "01 002 017": FOREMAN_GROWING_STORAGE_HEAVINESS_NORMATIVE,
  "01 002 018": ELECTRICIAN_HEAVINESS_NORMATIVE,
};

/**
 * Нормативы, привязанные к НАЗВАНИЮ должности (не к коду). Применяются ко всем
 * карточкам этой профессии независимо от их кода. `workDescription` — единый
 * для всего протокола (HEAVINESS_WORK_DESCRIPTION).
 */
const DRIVER_FORWARDER_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500"),
  p1_2_general_1to5: ind("до 12500", "2"),
  p1_2_general_over5: ind("до 24000", "2"),

  p2_1_alternating: ind("до 15"),
  p2_2_constant: ind("до 5"),
  p2_3_fromSurface: ind("до 250"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000", "2"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000"),
  p4_2_twoHands: ind("до 36000"),
  p4_3_bodyAndLegs: ind("до 43000"),

  p5_pose: ind("сидя менее 80%", "2"),

  p6_bends: ind("до 50"),

  p7_1_horizontal: ind("до 4 км"),
  p7_2_vertical: ind("до 2 км"),
};

const LABORATORY_ASSISTANT_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500"),
  p1_2_general_1to5: ind("до 12500"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15"),
  p2_2_constant: ind("до 5", "2"),
  p2_3_fromSurface: ind("до 250"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000", "2"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000"),
  p4_2_twoHands: ind("до 36000"),
  p4_3_bodyAndLegs: ind("до 43000"),

  p5_pose: ind("стоя менее 80%", "2"),

  p6_bends: ind("до 50", "2"),

  p7_1_horizontal: ind("до 4 км", "2"),
  p7_2_vertical: ind("до 2 км", "2"),
};

const IRRIGATOR_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500", "2"),
  p1_2_general_1to5: ind("до 12500"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15"),
  p2_2_constant: ind("до 5", "2"),
  p2_3_fromSurface: ind("до 250"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000", "2"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000", "2"),
  p4_2_twoHands: ind("до 36000", "2"),
  p4_3_bodyAndLegs: ind("до 43000"),

  p5_pose: ind("наклон менее 70%", "2"),

  p6_bends: ind("до 50", "2"),

  p7_1_horizontal: ind("до 4 км", "2"),
  p7_2_vertical: ind("до 2 км", "2"),
};

const ASSEMBLER_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500", "2"),
  p1_2_general_1to5: ind("до 12500", "2"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15", "2"),
  p2_2_constant: ind("до 5", "2"),
  p2_3_fromSurface: ind("до 250", "2"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000", "2"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000", "2"),
  p4_2_twoHands: ind("до 36000", "2"),
  p4_3_bodyAndLegs: ind("до 43000"),

  p5_pose: ind("наклон менее 70%", "2"),

  p6_bends: ind("до 50", "2"),

  p7_1_horizontal: ind("до 4 км", "2"),
  p7_2_vertical: ind("до 2 км", "2"),
};

const PACKER_HEAVINESS_NORMATIVE: HeavinessNormative = {
  workDescription: HEAVINESS_WORK_DESCRIPTION,
  finalAssessment: "2 класс — Допустимый",

  p1_1_regional: ind("до 2500", "2"),
  p1_2_general_1to5: ind("до 12500", "2"),
  p1_2_general_over5: ind("до 24000"),

  p2_1_alternating: ind("до 15", "2"),
  p2_2_constant: ind("до 5", "2"),
  p2_3_fromSurface: ind("до 250", "2"),
  p2_3_fromFloor: ind("до 100"),

  p3_1_local: ind("до 20000", "2"),
  p3_2_regional: ind("до 10000", "2"),

  p4_1_oneHand: ind("до 18000", "2"),
  p4_2_twoHands: ind("до 36000", "2"),
  p4_3_bodyAndLegs: ind("до 43000"),

  p5_pose: ind("стоя менее 70%", "2"),

  p6_bends: ind("до 50"),

  p7_1_horizontal: ind("до 4 км"),
  p7_2_vertical: ind("до 2 км"),
};

/**
 * База норматива для рабочих профессий (грузчик, тракторист, сторож и т.п.):
 * все показатели одинаковы, различается только «Рабочая поза» (`pose`).
 * Отдельные должности уточняют ещё пару показателей через `overrides`.
 */
function laborerHeavinessNormative(
  pose: HeavinessIndicator,
  overrides: Partial<HeavinessNormative> = {},
): HeavinessNormative {
  return {
    workDescription: HEAVINESS_WORK_DESCRIPTION,
    finalAssessment: "2 класс — Допустимый",

    p1_1_regional: ind("до 2500", "2"),
    p1_2_general_1to5: ind("до 12500", "2"),
    p1_2_general_over5: ind("до 24000"),

    p2_1_alternating: ind("до 15"),
    p2_2_constant: ind("до 5", "2"),
    p2_3_fromSurface: ind("до 250"),
    p2_3_fromFloor: ind("до 100"),

    p3_1_local: ind("до 20000", "2"),
    p3_2_regional: ind("до 10000", "2"),

    p4_1_oneHand: ind("до 18000"),
    p4_2_twoHands: ind("до 36000"),
    p4_3_bodyAndLegs: ind("до 43000", "2"),

    p5_pose: pose,

    p6_bends: ind("до 50", "2"),

    p7_1_horizontal: ind("до 4 км", "2"),
    p7_2_vertical: ind("до 2 км", "2"),

    ...overrides,
  };
}

const LOADER_HEAVINESS_NORMATIVE = laborerHeavinessNormative(
  ind("Наклон менее 70 %", "2"),
  {
    p1_2_general_1to5: ind("до 11000", "2"),
    p4_1_oneHand: ind("до 15000"),
    p4_2_twoHands: ind("до 32000"),
  },
);
const TRACTOR_DRIVER_HEAVINESS_NORMATIVE = laborerHeavinessNormative(
  ind("Сидя менее 80 %", "2"),
);
const GENERAL_WORKER_HEAVINESS_NORMATIVE = laborerHeavinessNormative(
  ind("Стоя менее 70 %", "2"),
);
const LOCKSMITH_HEAVINESS_NORMATIVE = laborerHeavinessNormative(
  ind("Стоя менее 70 %", "2"),
);
const WATCHMAN_HEAVINESS_NORMATIVE = laborerHeavinessNormative(
  ind("Сидя менее 70 %", "2"),
);
const CHEF_HEAVINESS_NORMATIVE = laborerHeavinessNormative(
  ind("Стоя менее 70 %", "2"),
);
const DISHWASHER_HEAVINESS_NORMATIVE = laborerHeavinessNormative(
  ind("Стоя более 70 %", "2"),
);
const LAUNDRESS_HEAVINESS_NORMATIVE = laborerHeavinessNormative(
  ind("Стоя более 70 %", "2"),
);

/**
 * Норматив по точному наименованию должности. Применяется к НОВЫМ карточкам
 * этой профессии при Sync (приоритет ниже норматива по коду, но выше
 * наследования от соседей и норматива по секции). Существующие заполненные
 * карточки пользователя не меняются.
 *
 * Ключ — название должности РОВНО как в кодировке. «Шеф повар» зарегистрирован
 * в двух написаниях (с пробелом и через дефис), т.к. встречаются оба варианта.
 */
export const heavinessNormativeByPosition: Record<string, HeavinessNormative> = {
  "Водитель экспедитор": DRIVER_FORWARDER_HEAVINESS_NORMATIVE,
  "Лаборант": LABORATORY_ASSISTANT_HEAVINESS_NORMATIVE,
  "Поливщик": IRRIGATOR_HEAVINESS_NORMATIVE,
  "Сборщик": ASSEMBLER_HEAVINESS_NORMATIVE,
  "Фасовщик": PACKER_HEAVINESS_NORMATIVE,
  "Грузчик": LOADER_HEAVINESS_NORMATIVE,
  "Тракторист": TRACTOR_DRIVER_HEAVINESS_NORMATIVE,
  "Разнорабочий": GENERAL_WORKER_HEAVINESS_NORMATIVE,
  "Слесарь": LOCKSMITH_HEAVINESS_NORMATIVE,
  "Сторож": WATCHMAN_HEAVINESS_NORMATIVE,
  "Шеф повар": CHEF_HEAVINESS_NORMATIVE,
  "Шеф-повар": CHEF_HEAVINESS_NORMATIVE,
  "Посудомойщица": DISHWASHER_HEAVINESS_NORMATIVE,
  "Прачка": LAUNDRESS_HEAVINESS_NORMATIVE,
};

/**
 * Норматив по наименованию секции кодировки (= `measurementPlace`) — фолбэк,
 * когда нет точного норматива по должности.
 */
export const heavinessNormativeBySection: Record<string, HeavinessNormative> = {
  "Административно – управленческий персонал": ADMIN_HEAVINESS_NORMATIVE,
};

/** Приводит ключ (должность/секция) к каноничному виду для устойчивого поиска. */
function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-–—]/g, "-");
}

/**
 * Канонизирует ТОЛЬКО пробелы кода (обрезает края, схлопывает повторы) для
 * устойчивого точного сравнения ключей формата "XX XXX XXX". Применяется
 * одинаково к ключам реестра и к коду из кодировки — это эквивалентно точному
 * совпадению, а не вычислению или модификации кода. Сам `code` карточки всегда
 * сохраняется из кодировки как есть и здесь не меняется.
 */
function normalizeCode(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const byCodeNormalized = new Map<string, HeavinessNormative>(
  Object.entries(heavinessNormativeByCode).map(([k, v]) => [normalizeCode(k), v]),
);
const byPositionNormalized = new Map<string, HeavinessNormative>(
  Object.entries(heavinessNormativeByPosition).map(([k, v]) => [normalizeKey(k), v]),
);
const bySectionNormalized = new Map<string, HeavinessNormative>(
  Object.entries(heavinessNormativeBySection).map(([k, v]) => [normalizeKey(k), v]),
);

/**
 * Норматив, привязанный к конкретному коду рабочего места. Наивысший приоритет:
 * имеет преимущество над наследованием от соседей и над нормативом по
 * должности/секции. `undefined`, если для кода норматив не задан.
 */
export function resolveHeavinessNormativeByCode(
  code: string,
): HeavinessNormative | undefined {
  return byCodeNormalized.get(normalizeCode(code));
}

/**
 * Норматив по точному названию должности (профессии). `undefined`, если для
 * должности норматив не задан.
 */
export function resolveHeavinessNormativeByPosition(
  position: string,
): HeavinessNormative | undefined {
  return byPositionNormalized.get(normalizeKey(position));
}

/**
 * Норматив по названию секции кодировки (= `measurementPlace`) — самый общий
 * фолбэк. `undefined`, если для секции норматив не задан.
 */
export function resolveHeavinessNormativeBySection(
  sectionTitle: string,
): HeavinessNormative | undefined {
  return bySectionNormalized.get(normalizeKey(sectionTitle));
}
