/**
 * Подтяжка показателей в Сводный протокол из протоколов-источников
 * (Освещение / ЭМП / Шум / Микроклимат). Правила:
 *
 *   - источник истины — протоколы измерений: непустые значения
 *     перезаписывают actual/norm в сводном;
 *   - пустые значения источников ничего не затирают;
 *   - classValue и method существующих строк не трогаются;
 *   - при count > 1 берётся первое измерение строки кодировки;
 *   - матчинг: codingRowId, фолбэк код+имя для легаси-строк.
 */

import { describe, expect, it } from "vitest";
import { normalizeCodingDocument } from "@/lib/docs/workplaceCodes";
import {
  computeSyncDiff,
  extractCodingSections,
  syncProtocolFromCoding,
} from "@/lib/docs/syncWorkplaces";
import {
  computeSummaryValuesDiff,
  mergeSummaryValues,
} from "@/lib/docs/syncSummaryValues";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>;

const SECTION = "Тестовый раздел";

function makeCoding(
  rows: Array<{ name: string; count?: number }>,
): { coding: AnyObj; sections: ReturnType<typeof extractCodingSections> } {
  const coding = normalizeCodingDocument({
    approval: {
      position: "Директор",
      organization: "ТОО «Тест»",
      fullName: "Тестов Т.Т.",
      date: { day: "1", month: "января", year: "2026" },
    },
    sections: [
      {
        number: 1,
        title: SECTION,
        rows: rows.map((r) => ({ code: "", name: r.name, count: r.count ?? 1 })),
      },
    ],
  }) as AnyObj;
  return { coding, sections: extractCodingSections(coding) };
}

/** Иммутабельно правит i-е измерение первого места протокола. */
function patchMeasurement(doc: AnyObj, index: number, patch: AnyObj): AnyObj {
  return {
    ...doc,
    places: doc.places.map((p: AnyObj, pi: number) =>
      pi !== 0
        ? p
        : {
            ...p,
            measurements: p.measurements.map((m: AnyObj, mi: number) =>
              mi === index ? { ...m, ...patch } : m,
            ),
          },
    ),
  };
}

describe("кейс клиента: микроклимат → сводный", () => {
  it("температура 23,6 и влажность 40 появляются в сводном автоматически", () => {
    const { sections } = makeCoding([{ name: "Должность А" }]);

    let meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    meteo = patchMeasurement(meteo, 0, {
      tempMeasured: "23,6",
      tempAllowed: "21-27",
      humidityMeasured: "40",
      humidityAllowed: "60",
    });

    const summary = syncProtocolFromCoding(
      "summary",
      { places: [] },
      sections,
      { meteo },
    ) as AnyObj;

    const factors = summary.places[0].workplaces[0].factors;
    expect(factors).toEqual([
      {
        name: "Температура, ºС",
        method: "ГОСТ 12.1.005-88",
        norm: "21-27",
        actual: "23,6",
        classValue: "",
      },
      {
        name: "Влажность, %",
        method: "ГОСТ 12.1.005-88",
        norm: "60",
        actual: "40",
        classValue: "",
      },
    ]);
  });
});

describe("источники значений", () => {
  it("ЭМП даёт 4 фактора (ЭП/МП × 2 диапазона) в каноническом порядке", () => {
    const { sections } = makeCoding([{ name: "Должность А" }]);

    let emp = syncProtocolFromCoding("emp", { places: [] }, sections) as AnyObj;
    const m = emp.places[0].measurements[0];
    emp = patchMeasurement(emp, 0, {
      range1: { ...m.range1, electricMeasured: "4", magneticMeasured: "0,12" },
      range2: { ...m.range2, electricMeasured: "2", magneticMeasured: "11" },
    });

    const summary = syncProtocolFromCoding(
      "summary",
      { places: [] },
      sections,
      { emp },
    ) as AnyObj;

    const factors = summary.places[0].workplaces[0].factors;
    expect(factors.map((f: AnyObj) => [f.name, f.actual, f.norm])).toEqual([
      ["ЭП диапазон 1, В/м", "4", "25"],
      ["ЭП диапазон 2, В/м", "2", "2,5"],
      ["МП диапазон 1, мкТл", "0,12", "250"],
      ["МП диапазон 2, нТл", "11", "25"],
    ]);
  });

  it("освещение и шум: пустые/нулевые строки источника факторов не создают", () => {
    const { sections } = makeCoding([{ name: "Должность А" }]);
    // Свежесинхронизированные протоколы: lighting measured/allowed = 0,
    // noise measured/allowed = "" — данных нет, факторы не создаются.
    const lighting = syncProtocolFromCoding("lighting", { places: [] }, sections);
    const noise = syncProtocolFromCoding("noise", { places: [] }, sections);

    const summary = syncProtocolFromCoding(
      "summary",
      { places: [] },
      sections,
      { lighting, noise },
    ) as AnyObj;

    expect(summary.places[0].workplaces[0].factors).toEqual([]);
  });

  it("при count > 1 берётся первое измерение строки кодировки", () => {
    const { sections } = makeCoding([{ name: "Должность А", count: 2 }]);

    let meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    expect(meteo.places[0].measurements).toHaveLength(2);
    meteo = patchMeasurement(meteo, 0, { tempMeasured: "11" });
    meteo = patchMeasurement(meteo, 1, { tempMeasured: "22" });

    const summary = syncProtocolFromCoding(
      "summary",
      { places: [] },
      sections,
      { meteo },
    ) as AnyObj;

    const temp = summary.places[0].workplaces[0].factors.find(
      (f: AnyObj) => f.name === "Температура, ºС",
    );
    expect(temp.actual).toBe("11");
  });
});

describe("правила перезаписи", () => {
  function summaryWith(factor: AnyObj): AnyObj {
    return {
      places: [
        {
          number: 1,
          name: SECTION,
          workplaces: [
            {
              code: "01 001 001",
              profession: "Должность А",
              count: 1,
              factors: [factor],
            },
          ],
        },
      ],
    };
  }

  function meteoWith(patch: AnyObj): AnyObj {
    return {
      places: [
        {
          number: 1,
          name: SECTION,
          measurements: [
            {
              code: "01 001 001",
              place: "Должность А",
              tempMeasured: "",
              tempAllowed: "",
              humidityMeasured: "",
              humidityAllowed: "",
              ...patch,
            },
          ],
        },
      ],
    };
  }

  it("непустое значение источника перезаписывает actual; method и classValue не трогаются", () => {
    const summary = summaryWith({
      name: "Температура, ºС",
      method: "СВОЙ МЕТОД",
      norm: "СТАРАЯ НОРМА",
      actual: "СТАРОЕ",
      classValue: "2",
    });
    const merged = mergeSummaryValues(summary, {
      meteo: meteoWith({ tempMeasured: "25,1" }),
    }) as AnyObj;

    const f = merged.places[0].workplaces[0].factors[0];
    expect(f.actual).toBe("25,1"); // перезаписано (правило 4)
    expect(f.norm).toBe("СТАРАЯ НОРМА"); // пустой источник не затёр (правило 5)
    expect(f.method).toBe("СВОЙ МЕТОД");
    expect(f.classValue).toBe("2");
  });

  it("легаси-строки без codingRowId матчатся по коду+имени", () => {
    const summary = summaryWith({
      name: "Влажность, %",
      method: "",
      norm: "",
      actual: "",
      classValue: "",
    });
    const merged = mergeSummaryValues(summary, {
      meteo: meteoWith({ humidityMeasured: "40", humidityAllowed: "60" }),
    }) as AnyObj;

    const f = merged.places[0].workplaces[0].factors[0];
    expect(f.actual).toBe("40");
    expect(f.norm).toBe("60");
  });

  it("чужое имя должности при совпавшем коде не матчится (защита от сдвига)", () => {
    const summary = summaryWith({
      name: "Температура, ºС",
      method: "",
      norm: "",
      actual: "",
      classValue: "",
    });
    // Код совпадает, но измерение принадлежит другой должности.
    const merged = mergeSummaryValues(summary, {
      meteo: {
        places: [
          {
            number: 1,
            name: SECTION,
            measurements: [
              {
                code: "01 001 001",
                place: "ДРУГАЯ ДОЛЖНОСТЬ",
                tempMeasured: "99",
                tempAllowed: "99",
              },
            ],
          },
        ],
      },
    }) as AnyObj;

    expect(merged).toBe(summary); // ничего не подтянулось
  });

  it("merge идемпотентен: повторный вызов возвращает ту же ссылку", () => {
    const { sections } = makeCoding([{ name: "Должность А" }]);
    let meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    meteo = patchMeasurement(meteo, 0, { tempMeasured: "23,6" });

    const summary = syncProtocolFromCoding(
      "summary",
      { places: [] },
      sections,
      { meteo },
    );
    expect(mergeSummaryValues(summary, { meteo })).toBe(summary);
  });

  it("без протоколов-источников сводный не меняется", () => {
    const summary = summaryWith({
      name: "Шум, дБа",
      method: "",
      norm: "",
      actual: "",
      classValue: "",
    });
    expect(mergeSummaryValues(summary, {})).toBe(summary);
    expect(mergeSummaryValues(summary, { cover: { x: 1 } })).toBe(summary);
  });
});

describe("diff для панели подтверждения", () => {
  it("создаваемые факторы и обновляемые значения считаются раздельно", () => {
    const { sections } = makeCoding([{ name: "Должность А" }]);
    let meteo = syncProtocolFromCoding("meteo", { places: [] }, sections) as AnyObj;
    meteo = patchMeasurement(meteo, 0, {
      tempMeasured: "23,6",
      humidityMeasured: "40",
    });

    // Свежий сводный: оба фактора будут СОЗДАНЫ.
    const fresh = computeSyncDiff("summary", { places: [] }, sections, { meteo });
    expect(fresh.toAdd).toBe(1); // рабочее место из кодировки
    expect(fresh.factorsToAdd).toBe(2);
    expect(fresh.valuesToUpdate).toBe(0);

    // Существующий сводный с устаревшим значением: клетка ОБНОВИТСЯ.
    const existing = syncProtocolFromCoding(
      "summary",
      { places: [] },
      sections,
      { meteo: patchMeasurement(meteo, 0, { tempMeasured: "11" }) },
    );
    const diff = computeSummaryValuesDiff(existing, { meteo });
    expect(diff.valuesToUpdate).toBe(1); // actual температуры 11 → 23,6
    expect(diff.factorsToAdd).toBe(0);
  });
});
