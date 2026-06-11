/**
 * Инварианты схемы кодов рабочих мест и синхронизации:
 *
 *   1. Код — позиционный: "01" + раздел + строка, третий блок сбрасывается в
 *      каждом разделе; перенумерация полная и идемпотентная.
 *   2. Идентичность строки — скрытый id; при удалении/перемещении строк
 *      кодировки данные зависимых протоколов НЕ переезжают на соседей.
 *   3. Легаси-данные (без id) подхватываются по коду+имени и принимают id.
 *   4. migrateWorkplaceCodes перешивает весь бандл атомарно и идемпотентно.
 */

import { describe, expect, it } from "vitest";
import {
  formatWorkplaceCode,
  migrateWorkplaceCodes,
  normalizeCodingDocument,
} from "@/lib/docs/workplaceCodes";
import {
  computeSyncDiff,
  extractCodingSections,
  getOrphanedMeasurements,
  syncProtocolFromCoding,
} from "@/lib/docs/syncWorkplaces";
import type { Json } from "@/types/database";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>;

function codingDoc(
  sections: Array<{
    title: string;
    rows: Array<{ name: string; count?: number; code?: string; id?: string }>;
  }>,
): AnyObj {
  return {
    approval: {
      position: "Директор",
      organization: "ТОО «Тест»",
      fullName: "Тестов Т.Т.",
      date: { day: "1", month: "января", year: "2026" },
    },
    sections: sections.map((s, i) => ({
      number: i + 1,
      title: s.title,
      rows: s.rows.map((r) => ({
        ...(r.id !== undefined ? { id: r.id } : {}),
        code: r.code ?? "",
        name: r.name,
        count: r.count ?? 1,
      })),
    })),
  };
}

const SECTION = "Тестовый раздел";

describe("formatWorkplaceCode", () => {
  it("даёт формат 01 SSS RRR с трёхзначным паддингом", () => {
    expect(formatWorkplaceCode(1, 1)).toBe("01 001 001");
    expect(formatWorkplaceCode(2, 14)).toBe("01 002 014");
    expect(formatWorkplaceCode(12, 345)).toBe("01 012 345");
  });
});

describe("normalizeCodingDocument", () => {
  it("назначает id и позиционные коды; третий блок сбрасывается по разделам", () => {
    const doc = codingDoc([
      { title: "Раздел 1", rows: [{ name: "А" }, { name: "Б" }] },
      { title: "Раздел 2", rows: [{ name: "В" }] },
    ]);
    const n = normalizeCodingDocument(doc) as AnyObj;

    expect(n.sections[0].number).toBe(1);
    expect(n.sections[1].number).toBe(2);
    expect(n.sections[0].rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
    ]);
    expect(n.sections[1].rows[0].code).toBe("01 002 001");
    for (const s of n.sections) {
      for (const r of s.rows) expect(r.id).toMatch(/\S/);
    }
  });

  it("идемпотентна: повторный вызов возвращает ту же ссылку", () => {
    const once = normalizeCodingDocument(
      codingDoc([{ title: SECTION, rows: [{ name: "А" }, { name: "Б" }] }]),
    );
    expect(normalizeCodingDocument(once)).toBe(once);
  });

  it("полная перенумерация при удалении строки; id не пересчитываются", () => {
    const n1 = normalizeCodingDocument(
      codingDoc([
        { title: SECTION, rows: [{ name: "А" }, { name: "Б" }, { name: "В" }] },
      ]),
    ) as AnyObj;
    const idV = n1.sections[0].rows[2].id;

    // Удаляем Б (среднюю строку) — как это делает FormRenderer.removeRow.
    const after = {
      ...n1,
      sections: [
        {
          ...n1.sections[0],
          rows: [n1.sections[0].rows[0], n1.sections[0].rows[2]],
        },
      ],
    };
    const n2 = normalizeCodingDocument(after) as AnyObj;

    expect(n2.sections[0].rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
    ]);
    // В переехала на позицию 2: код пересчитан, id сохранён.
    expect(n2.sections[0].rows[1].name).toBe("В");
    expect(n2.sections[0].rows[1].id).toBe(idV);
  });

  it("полная перенумерация при перемещении строки; id следуют за строками", () => {
    const n1 = normalizeCodingDocument(
      codingDoc([{ title: SECTION, rows: [{ name: "А" }, { name: "Б" }] }]),
    ) as AnyObj;
    const [a, b] = n1.sections[0].rows;

    const moved = { ...n1, sections: [{ ...n1.sections[0], rows: [b, a] }] };
    const n2 = normalizeCodingDocument(moved) as AnyObj;

    expect(n2.sections[0].rows.map((r: AnyObj) => r.name)).toEqual(["Б", "А"]);
    expect(n2.sections[0].rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
    ]);
    expect(n2.sections[0].rows[0].id).toBe(b.id);
    expect(n2.sections[0].rows[1].id).toBe(a.id);
  });
});

describe("нумерация по рабочим местам (count > 1)", () => {
  it("строка с count = 2 занимает два номера; следующая строка смещается", () => {
    const n = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [{ name: "А" }, { name: "Уборщик", count: 2 }, { name: "В" }],
        },
      ]),
    ) as AnyObj;

    expect(n.sections[0].rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002", // Уборщик ×2 занимает 002–003
      "01 001 004",
    ]);
  });

  it("микроклимат: у двух одинаковых должностей разные коды (кейс клиента)", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        { title: SECTION, rows: [{ name: "А" }, { name: "Уборщик", count: 2 }] },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    const meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    const codes = meteo.places[0].measurements.map((m: AnyObj) => m.code);
    expect(codes).toEqual(["01 001 001", "01 001 002", "01 001 003"]);

    // Повторный синк: коды стабильны, ложных орфанов нет.
    const resynced = syncProtocolFromCoding("meteo", meteo, sections) as AnyObj;
    expect(resynced.places[0].measurements.map((m: AnyObj) => m.code)).toEqual(
      codes,
    );
    expect(getOrphanedMeasurements(resynced, sections)).toEqual([]);
  });

  it("таблица измерений перестраивается в порядок кодировки: коды строго 001, 002, 003…", () => {
    // Сценарий клиента: место посеяно из примера и начинается с
    // электрослесарей, а Технолог из кодировки в таблице отсутствует.
    const coding = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [
            { name: "Технолог" },
            { name: "Электро слесарь", count: 2 },
            { name: "Лаборант" },
          ],
        },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    const meteo = {
      places: [
        {
          number: 1,
          name: SECTION,
          measurements: [
            { rowNumber: 1, pointNumber: "1т", place: "Электро слесарь", code: "", tempMeasured: "18,5" },
            { rowNumber: 2, pointNumber: "2т", place: "Электро слесарь", code: "", tempMeasured: "19,7" },
            { rowNumber: 3, pointNumber: "3т", place: "Лаборант", code: "", tempMeasured: "22,5" },
          ],
        },
      ],
    };

    const synced = syncProtocolFromCoding("meteo", meteo, sections) as AnyObj;
    const ms = synced.places[0].measurements;

    // Порядок кодировки, коды по порядку с 001 — без дыр и хвостов.
    expect(ms.map((m: AnyObj) => m.place)).toEqual([
      "Технолог",
      "Электро слесарь",
      "Электро слесарь",
      "Лаборант",
    ]);
    expect(ms.map((m: AnyObj) => m.code)).toEqual([
      "01 001 001",
      "01 001 002",
      "01 001 003",
      "01 001 004",
    ]);
    // Данные существующих строк поехали вместе со строками.
    expect(ms[1].tempMeasured).toBe("18,5");
    expect(ms[2].tempMeasured).toBe("19,7");
    expect(ms[3].tempMeasured).toBe("22,5");
    // Сквозная нумерация точек пересчитана.
    expect(ms.map((m: AnyObj) => m.pointNumber)).toEqual(["1т", "2т", "3т", "4т"]);
  });

  it("миграция перенумеровывает повторы измерений по экземплярам", () => {
    // Легаси: оба уборщика носят ОДИН код строки кодировки.
    const documents: Record<string, Json> = {
      coding: codingDoc([
        { title: SECTION, rows: [{ name: "Уборщик", count: 2, code: "01 001 016" }] },
      ]) as Json,
      meteo: {
        places: [
          {
            number: 1,
            name: SECTION,
            measurements: [
              { rowNumber: 1, pointNumber: "1т", place: "Уборщик", code: "01 001 016", tempMeasured: "21" },
              { rowNumber: 2, pointNumber: "2т", place: "Уборщик", code: "01 001 016", tempMeasured: "22" },
            ],
          },
        ],
      } as Json,
    };

    const migrated = migrateWorkplaceCodes(documents);
    const coding = migrated["coding"] as AnyObj;
    const meteo = migrated["meteo"] as AnyObj;

    expect(coding.sections[0].rows[0].code).toBe("01 001 001");
    const ms = meteo.places[0].measurements;
    expect(ms.map((m: AnyObj) => m.code)).toEqual(["01 001 001", "01 001 002"]);
    // Оба повтора привязаны к одной строке кодировки, значения не тронуты.
    expect(ms[0].codingRowId).toBe(coding.sections[0].rows[0].id);
    expect(ms[1].codingRowId).toBe(coding.sections[0].rows[0].id);
    expect(ms.map((m: AnyObj) => m.tempMeasured)).toEqual(["21", "22"]);
  });
});

describe("синхронизация: данные не переезжают на соседние должности (req 5)", () => {
  it("heaviness: после удаления строки кодировки карточка остаётся у своей должности", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [
            { name: "Должность А" },
            { name: "Должность Б" },
            { name: "Должность В" },
          ],
        },
      ]),
    ) as AnyObj;

    // Первичный синк: 3 пустые карточки со штампом codingRowId.
    let heaviness = syncProtocolFromCoding(
      "heaviness",
      { workplaces: [] },
      extractCodingSections(coding),
    ) as AnyObj;
    expect(heaviness.workplaces).toHaveLength(3);

    // Пользователь заполняет карточку «В».
    heaviness = {
      ...heaviness,
      workplaces: heaviness.workplaces.map((w: AnyObj) =>
        w.position === "Должность В"
          ? { ...w, finalAssessment: "МАРКЕР В" }
          : w,
      ),
    };

    // Из кодировки удаляют «Б» → полная перенумерация: «В» наследует код Б.
    const codingAfter = normalizeCodingDocument({
      ...coding,
      sections: [
        {
          ...coding.sections[0],
          rows: [coding.sections[0].rows[0], coding.sections[0].rows[2]],
        },
      ],
    }) as AnyObj;
    const sections = extractCodingSections(codingAfter);
    expect(sections[0].rows[1].code).toBe("01 001 002"); // бывший код «Б»

    // Diff честный: 2 сохраняются, 1 (Б) удаляется, ничего не добавляется.
    const diff = computeSyncDiff("heaviness", heaviness, sections);
    expect(diff.toAdd).toBe(0);
    expect(diff.toUpdate).toBe(2);
    expect(diff.toDelete.map((d) => d.name)).toEqual(["Должность Б"]);

    // После синка маркер «В» остался у «В», несмотря на смену её кода.
    const synced = syncProtocolFromCoding("heaviness", heaviness, sections) as AnyObj;
    expect(synced.workplaces).toHaveLength(2);
    const cardV = synced.workplaces[1];
    expect(cardV.position).toBe("Должность В");
    expect(cardV.code).toBe("01 001 002");
    expect(cardV.finalAssessment).toBe("МАРКЕР В");
    // А карточка «А» маркер не получила.
    expect(synced.workplaces[0].finalAssessment).not.toBe("МАРКЕР В");
  });

  it("safety: легаси-строки (без id) подхватываются по коду+имени и принимают id", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        { title: SECTION, rows: [{ name: "Должность А" }, { name: "Должность Б" }] },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    const legacySafety = {
      sections: [
        {
          number: 1,
          title: `1. ${SECTION}`,
          rows: [
            {
              code: "01 001 001",
              position: "Должность А",
              count: 1,
              equipment: "СТАНОК А",
              documentation: "в наличии",
              result: "соответствует",
              nonComplianceReasons: "отсутствуют",
              finalNote: "ок",
            },
          ],
        },
      ],
    };

    const synced = syncProtocolFromCoding("safety", legacySafety, sections) as AnyObj;
    const rows = synced.sections[0].rows;
    expect(rows).toHaveLength(2);
    // Легаси-строка А сохранила пользовательские данные и приняла id.
    expect(rows[0].equipment).toBe("СТАНОК А");
    expect(rows[0].codingRowId).toBe(sections[0].rows[0].id);
    // Новая строка Б получила id и дефолты.
    expect(rows[1].codingRowId).toBe(sections[0].rows[1].id);
    expect(rows[1].position).toBe("Должность Б");
  });
});

describe("Class A (измерения)", () => {
  function lightingDoc(measurements: AnyObj[]): AnyObj {
    return { places: [{ number: 1, name: SECTION, measurements }] };
  }

  function measurement(place: string, extra: AnyObj = {}): AnyObj {
    return {
      rowNumber: 1,
      pointNumber: "1т",
      place,
      workCategory: "А-1",
      lightingSystem: "Искусственное",
      lightingType: "Светодиодное",
      measured: 555,
      keo: "-",
      allowed: 300,
      ...extra,
    };
  }

  it("синк: легаси-измерение принимает id, код обновляется, новые строки добавляются", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        { title: SECTION, rows: [{ name: "Должность А" }, { name: "Должность Б" }] },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    const synced = syncProtocolFromCoding(
      "lighting",
      lightingDoc([measurement("Должность А", { code: "01 001 001" })]),
      sections,
    ) as AnyObj;

    const ms = synced.places[0].measurements;
    expect(ms).toHaveLength(2);
    expect(ms[0].codingRowId).toBe(sections[0].rows[0].id);
    expect(ms[0].measured).toBe(555);
    expect(ms[1].codingRowId).toBe(sections[0].rows[1].id);
    expect(ms.map((m: AnyObj) => m.pointNumber)).toEqual(["1т", "2т"]);
  });

  it("орфаны: строка удалённой должности помечается removed, соседка с унаследованным кодом — нет", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        { title: SECTION, rows: [{ name: "Должность А" }, { name: "Должность Б" }] },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    const lighting = syncProtocolFromCoding(
      "lighting",
      lightingDoc([]),
      sections,
    ) as AnyObj;

    // Удаляем «А» из кодировки → «Б» наследует код 01 001 001.
    const codingAfter = normalizeCodingDocument({
      ...coding,
      sections: [{ ...coding.sections[0], rows: [coding.sections[0].rows[1]] }],
    }) as AnyObj;
    const sectionsAfter = extractCodingSections(codingAfter);
    expect(sectionsAfter[0].rows[0].code).toBe("01 001 001");

    const orphans = getOrphanedMeasurements(lighting, sectionsAfter);
    // Ровно один орфан — измерение «А»; «Б» (id-совпадение) не задета,
    // хотя её сохранённый код (01 001 002) уже не существует в кодировке.
    expect(orphans).toHaveLength(1);
    expect(orphans[0].position).toBe("Должность А");
    expect(orphans[0].reason).toBe("removed");
  });
});

describe("травмобезопасность: построчные коды без дыр", () => {
  it("синк: код = номер строки раздела, count не резервирует номера", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [{ name: "А" }, { name: "Уборщик", count: 2 }, { name: "В" }],
        },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);
    // В кодировке коды-диапазоны: А=001, Уборщик=002(–003), В=004.
    expect(sections[0].rows.map((r) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
      "01 001 004",
    ]);

    const safety = syncProtocolFromCoding("safety", { sections: [] }, sections) as AnyObj;
    const rows = safety.sections[0].rows;
    // А в травме — построчно, без дыр: 001, 002, 003.
    expect(rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
      "01 001 003",
    ]);
    expect(rows.map((r: AnyObj) => r.count)).toEqual([1, 2, 1]);

    // Повторный синк: коды стабильны, данные строк сохраняются по id.
    rows[1].equipment = "ИНВЕНТАРЬ УБОРЩИКА";
    const resynced = syncProtocolFromCoding("safety", safety, sections) as AnyObj;
    expect(resynced.sections[0].rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
      "01 001 003",
    ]);
    expect(resynced.sections[0].rows[1].equipment).toBe("ИНВЕНТАРЬ УБОРЩИКА");
  });

  it("миграция выпрямляет сохранённые коды с дырами при загрузке", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [{ name: "А" }, { name: "Уборщик", count: 2 }, { name: "В" }],
        },
      ]),
    ) as AnyObj;
    const ids = coding.sections[0].rows.map((r: AnyObj) => r.id);

    // Сохранённое состояние из бага: коды-диапазоны с дырой (002 → 004).
    const documents: Record<string, Json> = {
      coding: coding as Json,
      safety: {
        sections: [
          {
            number: 1,
            title: `1. ${SECTION}`,
            rows: [
              { codingRowId: ids[0], code: "01 001 001", position: "А", count: 1, equipment: "", documentation: "в наличии", result: "соответствует", nonComplianceReasons: "отсутствуют", finalNote: "ок" },
              { codingRowId: ids[1], code: "01 001 002", position: "Уборщик", count: 2, equipment: "ШВАБРА", documentation: "в наличии", result: "соответствует", nonComplianceReasons: "отсутствуют", finalNote: "ок" },
              { codingRowId: ids[2], code: "01 001 004", position: "В", count: 1, equipment: "", documentation: "в наличии", result: "соответствует", nonComplianceReasons: "отсутствуют", finalNote: "ок" },
            ],
          },
        ],
      } as Json,
    };

    const migrated = migrateWorkplaceCodes(documents);
    const rows = (migrated["safety"] as AnyObj).sections[0].rows;
    expect(rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
      "01 001 003",
    ]);
    expect(rows[1].equipment).toBe("ШВАБРА");
    expect(rows[1].codingRowId).toBe(ids[1]);
  });
});

describe("migrateWorkplaceCodes (бандл-миграция)", () => {
  it("перенумеровывает кодировку и перешивает зависимые протоколы за один проход", () => {
    // Легаси-кодировка в стиле реальных данных: сквозной третий блок,
    // средний блок не совпадает с номером раздела.
    const documents: Record<string, Json> = {
      coding: codingDoc([
        {
          title: "АУП",
          rows: [
            { name: "Директор", code: "01 001 001" },
            { name: "Бухгалтер", code: "01 001 002" },
          ],
        },
        {
          title: "Производство",
          rows: [{ name: "Слесарь", code: "01 005 031" }],
        },
      ]) as Json,
      safety: {
        sections: [
          {
            number: 1,
            title: "1. АУП",
            rows: [
              {
                code: "01 001 002",
                position: "Бухгалтер",
                count: 1,
                equipment: "ПК БУХГАЛТЕРА",
                documentation: "в наличии",
                result: "соответствует",
                nonComplianceReasons: "отсутствуют",
                finalNote: "ок",
              },
            ],
          },
          {
            number: 2,
            title: "2. Производство",
            rows: [
              {
                code: "01 005 031",
                position: "Слесарь",
                count: 1,
                equipment: "ВЕРСТАК",
                documentation: "в наличии",
                result: "соответствует",
                nonComplianceReasons: "отсутствуют",
                finalNote: "ок",
              },
            ],
          },
        ],
      } as Json,
    };

    const migrated = migrateWorkplaceCodes(documents);
    const coding = migrated["coding"] as AnyObj;
    const safety = migrated["safety"] as AnyObj;

    // Кодировка каноническая: 01 002 001 вместо легаси 01 005 031.
    expect(coding.sections[1].rows[0].code).toBe("01 002 001");
    expect(coding.sections[1].rows[0].id).toMatch(/\S/);

    // Зависимые строки перешиты по старому коду (codingRowId), а код в
    // травме — ПОСТРОЧНЫЙ номер её собственной таблицы: Бухгалтер —
    // единственная строка своей секции → 001 (не базовый код кодировки 002).
    const buh = safety.sections[0].rows[0];
    expect(buh.code).toBe("01 001 001");
    expect(buh.codingRowId).toBe(coding.sections[0].rows[1].id);
    expect(buh.equipment).toBe("ПК БУХГАЛТЕРА");

    const slesar = safety.sections[1].rows[0];
    expect(slesar.code).toBe("01 002 001");
    expect(slesar.codingRowId).toBe(coding.sections[1].rows[0].id);
    expect(slesar.equipment).toBe("ВЕРСТАК");
  });

  it("идемпотентна: повторный запуск возвращает ту же ссылку", () => {
    const documents: Record<string, Json> = {
      coding: codingDoc([
        { title: SECTION, rows: [{ name: "А", code: "x" }] },
      ]) as Json,
    };
    const once = migrateWorkplaceCodes(documents);
    expect(migrateWorkplaceCodes(once)).toBe(once);
  });

  it("без кодировки бандл не меняется", () => {
    const documents: Record<string, Json> = { cover: { any: 1 } as Json };
    expect(migrateWorkplaceCodes(documents)).toBe(documents);
  });
});
