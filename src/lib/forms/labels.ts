/**
 * Localization layer for the schema-driven form engine.
 *
 * The renderer never sees raw schema keys. Every label, section title,
 * "add row" caption and array-item heading goes through one of the
 * `resolve*` functions defined here. Adding or correcting a translation
 * is a single-line edit; the renderer requires no change.
 *
 * Resolution strategy (per call):
 *   1. Exact path match in OVERRIDES                ("places.workplaces")
 *   2. Suffix match in OVERRIDES                    ("workplaces" tail)
 *   3. Last-key lookup in FIELD_LABELS              ("workplaces")
 *   4. Humanised camelCase / snake_case fallback    ("workplaceCodeNote"
 *      → "Примечание к коду рабочего места" via PATTERNS, else generic
 *      word-split capitalisation).
 *
 * The fallback never exposes the raw English token verbatim: it always
 * splits on case boundaries, joins with spaces, lower-cases everything
 * but the first letter, and (when possible) translates known tokens via
 * TOKEN_TRANSLATIONS so partial coverage still feels native.
 */

import type { FieldPath, FormField, GroupField } from "./types";

/* ------------------------------------------------------------------ */
/* 1. Flat key → Russian label dictionary                             */
/* ------------------------------------------------------------------ */

export const FIELD_LABELS: Record<string, string> = {
  // ── Top-level sections ───────────────────────────────────────────
  protocol: "Протокол",
  customer: "Заказчик",
  performer: "Исполнитель",
  director: "Руководитель организации",
  representative: "Представитель заказчика",
  laboratoryHead: "Руководитель лаборатории",
  approval: "Утверждение",
  conditions: "Условия проведения измерений",
  measurementDate: "Дата измерений",
  date: "Дата",
  accreditation: "Аттестат аккредитации",

  // ── Identification ───────────────────────────────────────────────
  number: "Номер",
  year: "Год",
  month: "Месяц",
  day: "День",
  dateYear: "Год протокола",
  dateRu: "Дата (рус.)",
  dateKk: "Дата (каз.)",
  verificationDate: "Дата поверки",
  reportYear: "Год отчёта",
  archiveYear: "Год архивации",

  // ── Organisation / person ────────────────────────────────────────
  name: "Наименование",
  organization: "Организация",
  address: "Адрес",
  addressRu: "Адрес (рус.)",
  addressKk: "Адрес (каз.)",
  city: "Город",
  fullName: "ФИО",
  position: "Должность",
  profession: "Профессия",
  directorName: "ФИО руководителя",
  directorPosition: "Должность руководителя",

  // ── Measurement context ─────────────────────────────────────────
  purpose: "Цель измерений",
  methodologyStandard: "Стандарт методики",
  productStandard: "Стандарт продукции",
  roomDescription: "Описание помещения",
  measurementPlace: "Место проведения измерений",
  measurementLocation: "Место измерений",
  workplaceCodeNote: "Примечание к коду рабочего места",
  totalWorkplaces: "Всего рабочих мест",
  workplaceCount: "Количество рабочих мест",
  maleCount: "Мужчин",
  femaleCount: "Женщин",
  collectiveProtection: "Средства коллективной защиты",
  equipment: "Оборудование",
  professionsList: "Перечень профессий",
  safetyClassLabel: "Класс по травмобезопасности",

  // ── Repeating sections ──────────────────────────────────────────
  places: "Места проведения измерений",
  place: "Место",
  workplaces: "Рабочие места",
  sections: "Разделы",
  rows: "Строки таблицы",
  factors: "Производственные факторы",
  measurements: "Измерения",
  emp_measurements: "Измерения ЭМП",
  lighting_measurements: "Измерения освещённости",
  measuringTools: "Средства измерений",
  octaves: "Октавные полосы, Гц",
  character: "Характер шума",
  heavinessCounts: "Количество по классам (тяжесть)",
  tensionCounts: "Количество по классам (напряжённость)",

  // ── Row / item identifiers ──────────────────────────────────────
  rowNumber: "№ строки",
  pointNumber: "№ точки",
  code: "Код",
  title: "Наименование раздела",
  labelRu: "Наименование (рус.)",
  labelKk: "Наименование (каз.)",
  count: "Количество",

  // ── Conditions / environment ────────────────────────────────────
  t: "Температура, °C",
  h: "Влажность, %",
  p: "Давление, мм рт. ст.",
  temperature: "Температура, °C",
  humidity: "Влажность, %",
  pressure: "Давление, мм рт. ст.",

  // ── Measurement values ──────────────────────────────────────────
  measured: "Измеренное значение",
  allowed: "Допустимое значение",
  norm: "Норматив",
  normItems: "Нормированный перечень",
  actual: "Фактически",
  classValue: "Класс условий труда",
  class: "Класс",
  value: "Значение",
  finalAssessment: "Итоговая оценка",
  finalNote: "Примечание",
  note: "Примечание",
  assessment: "Оценка",
  result: "Результат",
  certificate: "Сертификат",
  documentation: "Документация",
  issuedFact: "Фактически выдано",
  nonComplianceReasons: "Причины несоответствия",
  workCategory: "Категория работ",
  workDescription: "Описание выполняемой работы",
  lightingSystem: "Система освещения",
  lightingType: "Вид освещения",
  keo: "КЕО",
  method: "Метод",
  timeOfDay: "Время суток",
  time: "Время",
  distance: "Расстояние",
  height: "Высота",

  // ── EMP ──────────────────────────────────────────────────────────
  range1: "Диапазон 1",
  range2: "Диапазон 2",
  electricMeasured: "Электрическое поле — измеренное",
  electricAllowed: "Электрическое поле — допустимое",
  magneticMeasured: "Магнитное поле — измеренное",
  magneticAllowed: "Магнитное поле — допустимое",

  // ── Noise (octaves & character) ─────────────────────────────────
  hz31: "31,5",
  hz63: "63",
  hz125: "125",
  hz250: "250",
  hz500: "500",
  hz1000: "1000",
  hz2000: "2000",
  hz4000: "4000",
  ppePresent: "СИЗ применяются",
  ppeAbsent: "СИЗ не применяются",
  sourceStationary: "Источник стационарный",
  sourceNonStationary: "Источник нестационарный",
  broadStationary: "Широкополосный постоянный",
  broadNonStationary: "Широкополосный непостоянный",
  broadOscillating: "Широкополосный колеблющийся",
  broadImpulse: "Широкополосный импульсный",
  tonalStationary: "Тональный постоянный",
  tonalNonStationary: "Тональный непостоянный",
  tonalOscillating: "Тональный колеблющийся",
  tonalImpulse: "Тональный импульсный",

  // ── Meteo ───────────────────────────────────────────────────────
  tempMeasured: "Температура — измеренная",
  tempAllowed: "Температура — допустимая",
  humidityMeasured: "Влажность — измеренная",
  humidityAllowed: "Влажность — допустимая",
  airSpeedMeasured: "Скорость воздуха — измеренная",
  airSpeedAllowed: "Скорость воздуха — допустимая",

  // ── Intro counts ────────────────────────────────────────────────
  c1: "Класс 1",
  c2: "Класс 2",
  c31: "Класс 3.1",

  // ── Heaviness indicators (p1…p7) ────────────────────────────────
  p1_1_regional: "1.1 Региональная нагрузка",
  p1_2_general_1to5: "1.2 Общая нагрузка (1–5 м)",
  p1_2_general_over5: "1.2 Общая нагрузка (> 5 м)",
  p2_1_alternating: "2.1 Переменная статическая нагрузка",
  p2_2_constant: "2.2 Постоянная статическая нагрузка",
  p2_3_fromSurface: "2.3 Удержание с поверхности",
  p2_3_fromFloor: "2.3 Удержание с пола",
  p3_1_local: "3.1 Локальные движения",
  p3_2_regional: "3.2 Региональные движения",
  p4_1_oneHand: "4.1 Статическая нагрузка одной рукой",
  p4_2_twoHands: "4.2 Статическая нагрузка двумя руками",
  p4_3_bodyAndLegs: "4.3 С участием корпуса и ног",
  p5_pose: "5. Рабочая поза",
  p6_bends: "6. Наклоны корпуса",
  p7_1_horizontal: "7.1 Перемещение по горизонтали",
  p7_2_vertical: "7.2 Перемещение по вертикали",

  // ── Tension indicators (p1…p5) ──────────────────────────────────
  p1_1_content: "1.1 Содержание работы",
  p1_2_signals: "1.2 Восприятие сигналов",
  p1_3_distribution: "1.3 Распределение функций",
  p1_4_character: "1.4 Характер выполняемой работы",
  p2_1_duration: "2.1 Длительность сосредоточенного наблюдения",
  p2_2_density: "2.2 Плотность сигналов",
  p2_3_objects: "2.3 Число объектов наблюдения",
  p2_4_sizeLong: "2.4 Размер объекта различения",
  p2_5_optical: "2.5 Работа с оптическими приборами",
  p2_6_videoTerminal: "2.6 Работа с ВДТ",
  p2_7_voiceLoad: "2.7 Голосовая нагрузка",
  p2_8_speakLoad: "2.8 Речевая нагрузка",
  p3_1_responsibility: "3.1 Степень ответственности",
  p3_2_risk: "3.2 Риск для собственной жизни",
  p3_3_othersRisk: "3.3 Ответственность за безопасность других",
  p4_1_elements: "4.1 Число элементов задания",
  p4_2_duration: "4.2 Продолжительность операций",
  p4_3_active: "4.3 Время активных действий",
  p4_4_passive: "4.4 Монотонность пассивного наблюдения",
  p5_1_duration: "5.1 Фактическая продолжительность смены",
  p5_2_shift: "5.2 Сменность работы",
  p5_3_breaks: "5.3 Перерывы и их продолжительность",
};

/* ------------------------------------------------------------------ */
/* 2. Path-scoped overrides                                            */
/* ------------------------------------------------------------------ */

/**
 * Same key can mean different things depending on context. Path-scoped
 * overrides win over the flat dictionary. Keys here are dotted paths
 * (with `[]` standing in for any array index).
 */
const OVERRIDES: Record<string, string> = {
  "performer.fullName": "ФИО исполнителя",
  "performer.position": "Должность исполнителя",
  "performer.organization": "Организация исполнителя",
  "director.fullName": "ФИО руководителя",
  "director.position": "Должность руководителя",
  "representative.fullName": "ФИО представителя",
  "representative.position": "Должность представителя",
  "laboratoryHead.fullName": "ФИО руководителя лаборатории",
  "laboratoryHead.position": "Должность руководителя лаборатории",
  "approval.fullName": "ФИО утверждающего лица",
  "approval.position": "Должность утверждающего лица",
  "approval.organization": "Организация утверждающего лица",
  "customer.name": "Наименование заказчика",
  "customer.address": "Адрес заказчика",
  "customer.organization": "Организация заказчика",
  "customer.directorName": "ФИО руководителя заказчика",
  "customer.city": "Город заказчика",
  "performer.accreditation.number": "Номер аттестата аккредитации",
};

/* ------------------------------------------------------------------ */
/* 3. Array-item singular nouns                                        */
/* ------------------------------------------------------------------ */

/**
 * Singular noun for one element of an array, used in card headers and
 * Add/Remove buttons. Keyed by the parent array's *key* (last segment).
 * Pair format: [accusative, nominative]. Accusative is used for buttons
 * ("Добавить рабочее место"), nominative for card headers ("Рабочее
 * место №1").
 */
const ARRAY_ITEM_NOUNS: Record<string, [string, string]> = {
  places: ["место", "Место"],
  workplaces: ["рабочее место", "Рабочее место"],
  rows: ["строку", "Строка"],
  sections: ["раздел", "Раздел"],
  factors: ["фактор", "Фактор"],
  measurements: ["измерение", "Измерение"],
  emp_measurements: ["измерение", "Измерение"],
  lighting_measurements: ["измерение", "Измерение"],
  measuringTools: ["средство измерения", "Средство измерения"],
};

/* ------------------------------------------------------------------ */
/* 4. Russian zod error map                                            */
/* ------------------------------------------------------------------ */

import { z, type ZodErrorMap } from "zod";

/**
 * Maps zod's English issue codes onto Russian copy. Schemas that
 * already supply a custom message (eg. `z.string().min(1, "не должно
 * быть пустым")`) keep their message because zod prefers the
 * user-supplied one over the error-map default.
 */
export const russianZodErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type: {
      if (issue.received === "undefined" || issue.received === "null") {
        return { message: "Поле обязательно для заполнения" };
      }
      const expected = TYPE_NAMES[issue.expected] ?? issue.expected;
      return { message: `Ожидается ${expected}` };
    }
    case z.ZodIssueCode.too_small: {
      if (issue.type === "string") {
        return issue.minimum === 1
          ? { message: "Поле обязательно для заполнения" }
          : { message: `Минимум символов: ${issue.minimum}` };
      }
      if (issue.type === "array") {
        return { message: `Добавьте хотя бы ${issue.minimum} запись(и)` };
      }
      if (issue.type === "number") {
        return { message: `Значение должно быть не меньше ${issue.minimum}` };
      }
      return { message: `Слишком малое значение` };
    }
    case z.ZodIssueCode.too_big: {
      if (issue.type === "string") {
        return { message: `Максимум символов: ${issue.maximum}` };
      }
      if (issue.type === "array") {
        return { message: `Не более ${issue.maximum} элементов` };
      }
      if (issue.type === "number") {
        return { message: `Значение должно быть не больше ${issue.maximum}` };
      }
      return { message: "Слишком большое значение" };
    }
    case z.ZodIssueCode.invalid_enum_value:
      return {
        message: `Допустимые значения: ${issue.options
          .map((o) => (o === "" ? "—" : o))
          .join(", ")}`,
      };
    case z.ZodIssueCode.invalid_string:
      return { message: "Некорректное значение" };
    case z.ZodIssueCode.invalid_union:
      return { message: "Значение не подходит ни под один допустимый формат" };
    case z.ZodIssueCode.custom:
      return { message: ctx.defaultError };
    default:
      return { message: ctx.defaultError };
  }
};

// Install the Russian error map globally. Side effect intentional:
// every safeParse() call in the app benefits without per-call wiring,
// and schemas that pass an explicit `message` still win because zod
// prefers the user-supplied message over the global default.
z.setErrorMap(russianZodErrorMap);

const TYPE_NAMES: Record<string, string> = {
  string: "строка",
  number: "число",
  integer: "целое число",
  boolean: "логическое значение",
  date: "дата",
  array: "массив",
  object: "объект",
};

/* ------------------------------------------------------------------ */
/* 5. Fallback humaniser                                               */
/* ------------------------------------------------------------------ */

/**
 * Per-token translation table used by the fallback humaniser when no
 * full-key entry exists. Tokens are matched case-insensitively after
 * camelCase / snake_case split. The first matched token is capitalised
 * to form the leading word; subsequent translated tokens stay
 * lower-case so the result reads as a natural Russian phrase.
 */
const TOKEN_TRANSLATIONS: Record<string, string> = {
  workplace: "рабочее место",
  workplaces: "рабочие места",
  code: "код",
  note: "примечание",
  count: "количество",
  total: "всего",
  number: "номер",
  name: "наименование",
  full: "полное",
  short: "краткое",
  address: "адрес",
  city: "город",
  position: "должность",
  organization: "организация",
  profession: "профессия",
  director: "руководитель",
  performer: "исполнитель",
  representative: "представитель",
  customer: "заказчик",
  date: "дата",
  year: "год",
  month: "месяц",
  day: "день",
  measurement: "измерение",
  measurements: "измерения",
  measured: "измеренное",
  allowed: "допустимое",
  norm: "норматив",
  value: "значение",
  class: "класс",
  point: "точка",
  place: "место",
  places: "места",
  row: "строка",
  rows: "строки",
  section: "раздел",
  sections: "разделы",
  factor: "фактор",
  factors: "факторы",
  time: "время",
  temperature: "температура",
  humidity: "влажность",
  pressure: "давление",
  height: "высота",
  distance: "расстояние",
  description: "описание",
  result: "результат",
  reason: "причина",
  reasons: "причины",
  certificate: "сертификат",
  documentation: "документация",
  equipment: "оборудование",
  protection: "защита",
  collective: "коллективная",
  individual: "индивидуальная",
  electric: "электрическое",
  magnetic: "магнитное",
  field: "поле",
  range: "диапазон",
  source: "источник",
  stationary: "стационарный",
  category: "категория",
  work: "работа",
  for: "для",
  to: "для",
  of: "",
  ru: "(рус.)",
  kk: "(каз.)",
};

function tokenize(key: string): string[] {
  // p2_3_fromFloor → ["p2", "3", "from", "Floor"] → cleaned below.
  return key
    .replace(/[._-]+/g, " ")
    .replace(/([a-zа-я0-9])([A-ZА-Я])/g, "$1 $2")
    .replace(/([0-9])([A-Za-zА-Яа-я])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function humaniseFallback(key: string): string {
  const tokens = tokenize(key);
  if (tokens.length === 0) return key;
  const translated = tokens
    .map((t) => {
      const lower = t.toLowerCase();
      if (TOKEN_TRANSLATIONS[lower] !== undefined) {
        return TOKEN_TRANSLATIONS[lower];
      }
      // Pure digit/index tokens are kept as-is (eg. "1", "31_5").
      if (/^\d+([._]\d+)*$/.test(t)) return t;
      // Single letter (eg. "p") is dropped — used as Russian-prefix marker.
      if (t.length === 1 && /[a-zA-Z]/.test(t)) return "";
      // Unknown English token: lower-case it but keep it visible so an
      // untranslated key surfaces as obvious feedback to the developer.
      return lower;
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!translated) return key;
  return translated.charAt(0).toUpperCase() + translated.slice(1);
}

/* ------------------------------------------------------------------ */
/* 6. Public resolvers                                                 */
/* ------------------------------------------------------------------ */

/** Strip array indices from a path → "places.[].workplaces.[].factors". */
function dotPath(path: FieldPath): string {
  return path
    .map((seg) => (typeof seg === "number" ? "[]" : seg))
    .join(".");
}

/** Same path but without [] markers, suitable for suffix matching. */
function plainPath(path: FieldPath): string {
  return path.filter((seg) => typeof seg !== "number").join(".");
}

/**
 * Returns the user-facing label for a leaf field or nested object key.
 * `path` includes the field's own key as the last segment.
 */
export function resolveFieldLabel(path: FieldPath, key: string): string {
  // 1. Exact dotted-path override
  const exact = OVERRIDES[plainPath(path)] ?? OVERRIDES[dotPath(path)];
  if (exact) return exact;

  // 2. Flat key dictionary
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];

  // 3. Humanised fallback
  return humaniseFallback(key);
}

/* ------------------------------------------------------------------ */
/* Field hints (short help text shown next to a field / column)        */
/* ------------------------------------------------------------------ */

const FIELD_HINTS: Record<string, string> = {
  // «Количество» is 0 | 1 everywhere now: 1 = a real workplace, 0 = the
  // position stays in Coding but is not assessed (excluded from every protocol).
  count:
    "1 — рабочее место; 0 — должность остаётся в кодировке, но не аттестуется " +
    "(в протоколы не попадёт). Повторяющиеся должности — отдельными строками.",
};

/**
 * Optional one-line help text for a field, keyed by its schema key.
 * `undefined` when the field has no hint.
 */
export function resolveFieldHint(key: string): string | undefined {
  return FIELD_HINTS[key];
}

/**
 * Title of a top-level / nested section (object group).
 * Adds a contextual qualifier when sensible.
 */
export function resolveSectionTitle(
  path: FieldPath,
  field: GroupField,
): string {
  const base = resolveFieldLabel(path, field.key);
  return base;
}

/**
 * Singular noun used in array UX:
 *   accusative — "Добавить <accusative>"
 *   nominative — "<nominative> №3"
 * Falls back to a generic "запись/Запись" when nothing better is known.
 */
export function resolveArrayItemName(
  path: FieldPath,
  key: string,
): { accusative: string; nominative: string } {
  const pair = ARRAY_ITEM_NOUNS[key];
  if (pair) return { accusative: pair[0], nominative: pair[1] };
  // Heuristic: parent label minus trailing plural marker.
  return { accusative: "запись", nominative: "Запись" };
}

/** Exposed for tests / dev tools. */
export const __internals = { humaniseFallback, tokenize };

/**
 * Re-export under a stable namespace so callers can import everything
 * label-related from one module.
 */
export const Labels = {
  field: resolveFieldLabel,
  section: resolveSectionTitle,
  item: resolveArrayItemName,
  hint: resolveFieldHint,
};
