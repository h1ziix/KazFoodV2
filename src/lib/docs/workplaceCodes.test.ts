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
  protocolNeedsSync,
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

describe("код — индекс аттестуемой строки; количество 0 кода не получает", () => {
  it("правка имени (коды не меняются) возвращает ту же ссылку → пересчёт протоколов пропускается", () => {
    // Контракт производительности: handleFieldChange распространяет коды в
    // зависимые протоколы только когда normalize вернул НОВЫЙ объект. Правка
    // имени должности коды не меняет → та же ссылка → дорогой обход бандла не
    // запускается (горячий путь на каждое нажатие клавиши).
    const n1 = normalizeCodingDocument(
      codingDoc([{ title: SECTION, rows: [{ name: "А" }, { name: "Б" }] }]),
    ) as AnyObj;

    // Имитируем правку имени второй строки в форме (код/ id не трогаем).
    const edited = {
      ...n1,
      sections: [
        {
          ...n1.sections[0],
          rows: [
            n1.sections[0].rows[0],
            { ...n1.sections[0].rows[1], name: "Б — отредактировано" },
          ],
        },
      ],
    };

    // normalize не нашёл изменений кодов → вернул входной объект как есть.
    expect(normalizeCodingDocument(edited)).toBe(edited);
  });

  it("неаттестуемая строка не получает код, аттестуемые нумеруются подряд", () => {
    const n = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [{ name: "А" }, { name: "Уборщик", count: 0 }, { name: "В" }],
        },
      ]),
    ) as AnyObj;

    expect(n.sections[0].rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "", // Уборщик (count 0) — без кода
      "01 001 002",
    ]);
  });

  it("микроклимат: повторяющиеся должности — отдельные строки с разными кодами", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [{ name: "А" }, { name: "Уборщик" }, { name: "Уборщик" }],
        },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    const meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    const ms = meteo.places[0].measurements;
    expect(ms.map((m: AnyObj) => m.place)).toEqual(["А", "Уборщик", "Уборщик"]);
    expect(ms.map((m: AnyObj) => m.code)).toEqual([
      "01 001 001",
      "01 001 002",
      "01 001 003",
    ]);

    // Повторный синк: коды стабильны, лишних строк не появляется.
    const resynced = syncProtocolFromCoding("meteo", meteo, sections) as AnyObj;
    expect(resynced.places[0].measurements.map((m: AnyObj) => m.code)).toEqual(
      ms.map((m: AnyObj) => m.code),
    );
  });

  it("количество 0: неаттестуемая строка остаётся в кодировке без кода, аттестуемые — подряд", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [{ name: "А" }, { name: "Вакансия", count: 0 }, { name: "Б" }],
        },
      ]),
    ) as AnyObj;
    const rows = coding.sections[0].rows;
    // Вакансия (0) кода не получает; А и Б нумеруются подряд без дыр.
    expect(rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "",
      "01 001 002",
    ]);
    // id назначается всем строкам, включая неаттестуемую.
    expect(rows[1].id).toMatch(/\S/);
  });

  it("количество 0: должность исключается из ВСЕХ протоколов", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [{ name: "А" }, { name: "Вакансия", count: 0 }, { name: "Б" }],
        },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    // Класс A — измерения.
    const meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    expect(meteo.places[0].measurements.map((m: AnyObj) => m.place)).toEqual(["А", "Б"]);
    expect(meteo.places[0].measurements.map((m: AnyObj) => m.code)).toEqual([
      "01 001 001",
      "01 001 002",
    ]);

    // Травмобезопасность — построчная нумерация, тоже без Вакансии и без дыр.
    const safety = syncProtocolFromCoding("safety", { sections: [] }, sections) as AnyObj;
    expect(safety.sections[0].rows.map((r: AnyObj) => r.position)).toEqual(["А", "Б"]);
    expect(safety.sections[0].rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
    ]);

    // СИЗ, Сводный, Тяжесть, Напряжённость — должности только аттестуемые.
    const siz = syncProtocolFromCoding("siz", { sections: [] }, sections) as AnyObj;
    expect(siz.sections[0].rows.map((r: AnyObj) => r.position)).toEqual(["А", "Б"]);

    const summary = syncProtocolFromCoding("summary", { places: [] }, sections) as AnyObj;
    expect(summary.places[0].workplaces.map((w: AnyObj) => w.profession)).toEqual(["А", "Б"]);

    const heaviness = syncProtocolFromCoding("heaviness", { workplaces: [] }, sections) as AnyObj;
    expect(heaviness.workplaces.map((w: AnyObj) => w.position)).toEqual(["А", "Б"]);

    const tension = syncProtocolFromCoding("tension", { workplaces: [] }, sections) as AnyObj;
    expect(tension.workplaces.map((w: AnyObj) => w.position)).toEqual(["А", "Б"]);
  });

  it("перевод аттестуемой должности в 0 → строка попадает в «удалится» и убирается при синке", () => {
    const coding = normalizeCodingDocument(
      codingDoc([{ title: SECTION, rows: [{ name: "А" }, { name: "Б" }] }]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    // Оба аттестуемы → в Тяжести две карточки; помечаем «Б».
    let heaviness = syncProtocolFromCoding("heaviness", { workplaces: [] }, sections) as AnyObj;
    heaviness = {
      ...heaviness,
      workplaces: heaviness.workplaces.map((w: AnyObj) =>
        w.position === "Б" ? { ...w, finalAssessment: "МАРКЕР Б" } : w,
      ),
    };

    // «А» переводят в количество 0.
    const codingAfter = normalizeCodingDocument({
      ...coding,
      sections: [
        {
          ...coding.sections[0],
          rows: [{ ...coding.sections[0].rows[0], count: 0 }, coding.sections[0].rows[1]],
        },
      ],
    }) as AnyObj;
    const sectionsAfter = extractCodingSections(codingAfter);

    // Diff честный: «А» удалится, «Б» сохранится, ничего не добавляется.
    const diff = computeSyncDiff("heaviness", heaviness, sectionsAfter);
    expect(diff.toAdd).toBe(0);
    expect(diff.toUpdate).toBe(1);
    expect(diff.toDelete.map((d) => d.name)).toEqual(["А"]);

    // После синка «А» нет, «Б» сохранила данные и получила код 001.
    const synced = syncProtocolFromCoding("heaviness", heaviness, sectionsAfter) as AnyObj;
    expect(synced.workplaces).toHaveLength(1);
    expect(synced.workplaces[0].position).toBe("Б");
    expect(synced.workplaces[0].code).toBe("01 001 001");
    expect(synced.workplaces[0].finalAssessment).toBe("МАРКЕР Б");
  });

  it("таблица измерений перестраивается в порядок кодировки: коды строго 001, 002, 003…", () => {
    // Сценарий клиента: место посеяно из примера и начинается с двух
    // электрослесарей (отдельные строки кодировки), а Технолог отсутствует.
    const coding = normalizeCodingDocument(
      codingDoc([
        {
          title: SECTION,
          rows: [
            { name: "Технолог" },
            { name: "Электро слесарь" },
            { name: "Электро слесарь" },
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
    // Имя-фолбэк позиционный: первый безымянный «Электро слесарь» ушёл к
    // первой строке кодировки с этим именем, второй — ко второй.
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

  it("миграция: легаси-коды перешиваются на построчные во всех протоколах", () => {
    // Легаси: два уборщика — отдельные строки со сквозными кодами 016/017.
    const documents: Record<string, Json> = {
      coding: codingDoc([
        {
          title: SECTION,
          rows: [
            { name: "Уборщик", code: "01 001 016" },
            { name: "Уборщик", code: "01 001 017" },
          ],
        },
      ]) as Json,
      meteo: {
        places: [
          {
            number: 1,
            name: SECTION,
            measurements: [
              { rowNumber: 1, pointNumber: "1т", place: "Уборщик", code: "01 001 016", tempMeasured: "21" },
              { rowNumber: 2, pointNumber: "2т", place: "Уборщик", code: "01 001 017", tempMeasured: "22" },
            ],
          },
        ],
      } as Json,
    };

    const migrated = migrateWorkplaceCodes(documents);
    const coding = migrated["coding"] as AnyObj;
    const meteo = migrated["meteo"] as AnyObj;

    expect(coding.sections[0].rows.map((r: AnyObj) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
    ]);
    const ms = meteo.places[0].measurements;
    expect(ms.map((m: AnyObj) => m.code)).toEqual(["01 001 001", "01 001 002"]);
    // Каждый повтор привязан к СВОЕЙ строке кодировки, значения не тронуты.
    expect(ms[0].codingRowId).toBe(coding.sections[0].rows[0].id);
    expect(ms[1].codingRowId).toBe(coding.sections[0].rows[1].id);
    expect(ms.map((m: AnyObj) => m.tempMeasured)).toEqual(["21", "22"]);
  });

  it("propagate: правка кодировки сразу обновляет коды связанных протоколов", () => {
    // Бандл с тяжестью, привязанной по id; из кодировки удаляют первую
    // строку — коды сдвигаются, карточка получает новый код автоматически.
    const coding = normalizeCodingDocument(
      codingDoc([{ title: SECTION, rows: [{ name: "А" }, { name: "Б" }] }]),
    ) as AnyObj;
    const idB = coding.sections[0].rows[1].id;
    const heaviness = {
      workplaces: [
        { rowNumber: 1, codingRowId: idB, code: "01 001 002", position: "Б", measurementPlace: SECTION },
      ],
    };

    // Имитация удаления строки «А» в форме: splice + normalize + propagate
    // (ровно то, что делает writeSlot в редакторе).
    const edited = normalizeCodingDocument({
      ...coding,
      sections: [{ ...coding.sections[0], rows: [coding.sections[0].rows[1]] }],
    });
    const result = migrateWorkplaceCodes({
      coding: edited as Json,
      heaviness: heaviness as Json,
    });

    const card = (result["heaviness"] as AnyObj).workplaces[0];
    expect(card.code).toBe("01 001 001"); // Б поднялась на позицию 1
    expect(card.codingRowId).toBe(idB);
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

  it("чистый синк: строка удалённой должности УДАЛЯЕТСЯ автоматически, соседка сохраняется", () => {
    const coding = normalizeCodingDocument(
      codingDoc([
        { title: SECTION, rows: [{ name: "Должность А" }, { name: "Должность Б" }] },
      ]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);

    // Первый синк создаёт по строке на А и Б; помечаем строку «Б».
    let lighting = syncProtocolFromCoding("lighting", lightingDoc([]), sections) as AnyObj;
    lighting = {
      ...lighting,
      places: lighting.places.map((p: AnyObj) => ({
        ...p,
        measurements: p.measurements.map((m: AnyObj) =>
          m.place === "Должность Б" ? { ...m, measured: 777 } : m,
        ),
      })),
    };

    // Удаляем «А» из кодировки → остаётся только «Б» (наследует код 001).
    const codingAfter = normalizeCodingDocument({
      ...coding,
      sections: [{ ...coding.sections[0], rows: [coding.sections[0].rows[1]] }],
    }) as AnyObj;
    const sectionsAfter = extractCodingSections(codingAfter);

    const synced = syncProtocolFromCoding("lighting", lighting, sectionsAfter) as AnyObj;
    const ms = synced.places[0].measurements;
    // Строка «А» удалена автоматически — без предупреждений и ручных действий.
    expect(ms).toHaveLength(1);
    expect(ms[0].place).toBe("Должность Б");
    expect(ms[0].code).toBe("01 001 001");
    expect(ms[0].measured).toBe(777); // данные «Б» сохранены
    expect(ms[0].codingRowId).toBe(sectionsAfter[0].rows[0].id);
  });

  it("чистый синк: лишние повторы (сверх count) удаляются автоматически", () => {
    const coding = normalizeCodingDocument(
      codingDoc([{ title: SECTION, rows: [{ name: "Должность А" }] }]),
    ) as AnyObj;
    const sections = extractCodingSections(coding);
    const id = coding.sections[0].rows[0].id;

    // Легаси-место с тремя строками, привязанными к ОДНОЙ строке кодировки.
    const lighting = lightingDoc([
      measurement("Должность А", { codingRowId: id, code: "01 001 001", measured: 100 }),
      measurement("Должность А", { codingRowId: id, code: "01 001 001", measured: 200 }),
      measurement("Должность А", { codingRowId: id, code: "01 001 001", measured: 300 }),
    ]);

    const synced = syncProtocolFromCoding("lighting", lighting, sections) as AnyObj;
    const ms = synced.places[0].measurements;
    // Остаётся ровно одна строка (count = 1), первая по порядку.
    expect(ms).toHaveLength(1);
    expect(ms[0].measured).toBe(100);
    expect(ms[0].code).toBe("01 001 001");
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
    // Коды кодировки построчные: count не влияет.
    expect(sections[0].rows.map((r) => r.code)).toEqual([
      "01 001 001",
      "01 001 002",
      "01 001 003",
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

describe("protocolNeedsSync — индикатор «требует синхронизации»", () => {
  function coding2(rows: Array<{ name: string; count?: number }>) {
    const c = normalizeCodingDocument(codingDoc([{ title: SECTION, rows }])) as AnyObj;
    return { coding: c, sections: extractCodingSections(c) };
  }

  it("свежесинхронизированный протокол не требует синхронизации", () => {
    const { sections } = coding2([{ name: "А" }, { name: "Б" }]);
    for (const key of ["safety", "siz", "summary", "heaviness", "tension", "meteo"]) {
      const synced = syncProtocolFromCoding(
        key,
        key === "meteo" ? { places: [] } : key === "summary" ? { places: [] } : { sections: [], workplaces: [] },
        sections,
      );
      expect(protocolNeedsSync(key, synced, sections)).toBe(false);
    }
  });

  it("добавленная в кодировку должность делает протокол устаревшим", () => {
    const { sections } = coding2([{ name: "А" }]);
    const heaviness = syncProtocolFromCoding("heaviness", { workplaces: [] }, sections);
    // В кодировку добавили «Б» — карточки для неё ещё нет.
    const { sections: more } = coding2([{ name: "А" }, { name: "Б" }]);
    expect(protocolNeedsSync("heaviness", heaviness, more)).toBe(true);
  });

  it("перевод должности в количество 0 делает протокол устаревшим", () => {
    const { coding, sections } = coding2([{ name: "А" }, { name: "Б" }]);
    const siz = syncProtocolFromCoding("siz", { sections: [] }, sections);
    const off = extractCodingSections(
      normalizeCodingDocument({
        ...coding,
        sections: [
          {
            ...coding.sections[0],
            rows: [{ ...coding.sections[0].rows[0], count: 0 }, coding.sections[0].rows[1]],
          },
        ],
      }) as AnyObj,
    );
    expect(protocolNeedsSync("siz", siz, off)).toBe(true);
  });

  it("Class A: недостающее измерение → устарел; полное совпадение → нет", () => {
    const { sections } = coding2([{ name: "А" }, { name: "Б" }]);
    const meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    expect(protocolNeedsSync("meteo", meteo, sections)).toBe(false);

    // Удаляем одну строку измерения вручную — теперь не хватает «Б».
    const short = {
      ...meteo,
      places: meteo.places.map((p: AnyObj) => ({
        ...p,
        measurements: p.measurements.slice(0, 1),
      })),
    };
    expect(protocolNeedsSync("meteo", short, sections)).toBe(true);
  });

  it("осиротевший раздел целиком НЕ считается требующим синхронизации", () => {
    const { sections } = coding2([{ name: "А" }]);
    const meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    // Добавляем лишнее место, которого нет в кодировке (сохраняется при синке).
    const withOrphan = {
      ...meteo,
      places: [
        ...meteo.places,
        { number: 9, name: "Удалённый раздел", measurements: [] },
      ],
    };
    expect(protocolNeedsSync("meteo", withOrphan, sections)).toBe(false);
  });

  it("без заполненной кодировки ничего не устаревает", () => {
    expect(protocolNeedsSync("heaviness", { workplaces: [] }, [])).toBe(false);
  });
});
