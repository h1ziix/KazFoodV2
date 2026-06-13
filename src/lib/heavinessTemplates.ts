import type {
  HeavinessClass,
  HeavinessIndicator,
  HeavinessWorkplace,
} from "@/types/heaviness";

/**
 * BUSINESS RULE — normatives are keyed by SECTION + POSITION, never by code.
 *
 * The workplace code is a derived positional display value ("01" + section +
 * row, see workplaceCodes.ts): it is renumbered whenever coding rows are
 * added / deleted / moved, so pinning a normative to a code would silently
 * detach it after any structural edit. Cross-protocol row identity lives in
 * the hidden coding-row id (syncWorkplaces.ts) and is irrelevant here —
 * normatives describe PROFESSIONS, not concrete rows.
 *
 * Names repeat across the coding («Технолог оператор» exists in both АУП and
 * production with different norms), so the most specific registry is keyed by
 * «секция|должность» (mirrors tensionTemplates) and is checked FIRST. The
 * plain position map serves unique names; the section map is the fallback.
 *
 * Lookup priority: section+position → position → section.
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
 * ЕДИНАЯ норма тяжести для ВСЕХ должностей любого раздела (по решению клиента:
 * нормы одинаковые у всех). Эталон — норма АУП (все показатели «класс 1»).
 * Применяется ко всем новым карточкам при синхронизации; заполненные вручную
 * карточки не перезаписываются.
 */
export const UNIVERSAL_HEAVINESS_NORMATIVE: HeavinessNormative =
  ADMIN_HEAVINESS_NORMATIVE;

/**
 * Норматив «Технолог оператор» (производственный персонал) — по карте тяжести
 * труда все показатели класса 1 (оптимальный). Привязан к «секция+должность»,
 * а не к одному названию: одноимённая должность есть и в АУП с другим нормативом.
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
 * Норматив «Бригадир ремонтно-строительной бригады» — по карте
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
 * Норматив «Бригадир технической бригады» — по карте тяжести
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
 * Норматив «Бригадир цеха выращивания и хранения» — по карте
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
 * Норматив «Электрослесарь» — по карте тяжести труда итог
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

/** Название секции производственного персонала — как в кодировке. */
const SECTION_PRODUCTION = "Производственный персонал";

/**
 * Норматив с учётом СЕКЦИИ — для должностей, чьё имя повторяется в разных
 * секциях с разными профилями (как в tensionTemplates). Проверяется ПЕРЕД
 * `heavinessNormativeByPosition`. Ключ: «секция|должность» РОВНО как в
 * кодировке. Коды рабочих мест в качестве ключей запрещены — они позиционные
 * и перенумеровываются (см. BUSINESS RULE в шапке файла).
 */
export const heavinessNormativeBySectionPosition: Record<string, HeavinessNormative> = {
  [`${SECTION_PRODUCTION}|Технолог оператор`]:
    TECHNOLOGIST_OPERATOR_HEAVINESS_NORMATIVE,
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
  // Производственные должности с уникальными именами (бывшие code-pinned
  // нормативы): «Электро слесарь» зарегистрирован в двух написаниях, т.к.
  // в кодировке встречается раздельный вариант.
  "Бригадир ремонтно-строительной бригады": FOREMAN_REPAIR_HEAVINESS_NORMATIVE,
  "Бригадир технической бригады": FOREMAN_TECHNICAL_HEAVINESS_NORMATIVE,
  "Бригадир цеха выращивания и хранения": FOREMAN_GROWING_STORAGE_HEAVINESS_NORMATIVE,
  "Электро слесарь": ELECTRICIAN_HEAVINESS_NORMATIVE,
  "Электрослесарь": ELECTRICIAN_HEAVINESS_NORMATIVE,
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

/** Композитный ключ «секция|должность» из нормализованных частей. */
function sectionPositionKey(sectionTitle: string, position: string): string {
  return `${normalizeKey(sectionTitle)}|${normalizeKey(position)}`;
}

const bySectionPositionNormalized = new Map<string, HeavinessNormative>(
  Object.entries(heavinessNormativeBySectionPosition).map(([k, v]) => {
    const sep = k.indexOf("|");
    return [sectionPositionKey(k.slice(0, sep), k.slice(sep + 1)), v];
  }),
);
const byPositionNormalized = new Map<string, HeavinessNormative>(
  Object.entries(heavinessNormativeByPosition).map(([k, v]) => [normalizeKey(k), v]),
);
const bySectionNormalized = new Map<string, HeavinessNormative>(
  Object.entries(heavinessNormativeBySection).map(([k, v]) => [normalizeKey(k), v]),
);

/**
 * Норматив по должности с учётом секции. Приоритет: точное «секция+должность»
 * (разводит одноимённые должности из разных секций, напр. «Технолог оператор»),
 * затем — по одному имени должности. `undefined`, если норматива нет.
 */
export function resolveHeavinessNormativeByPosition(
  position: string,
  sectionTitle: string,
): HeavinessNormative | undefined {
  return (
    bySectionPositionNormalized.get(sectionPositionKey(sectionTitle, position)) ??
    byPositionNormalized.get(normalizeKey(position))
  );
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
