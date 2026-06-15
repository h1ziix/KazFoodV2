import { describe, expect, it } from "vitest";
import { syncProtocolFromCoding } from "./syncWorkplaces";
import { meteoProtocolSchema } from "@/lib/meteoSchema";
import { meteoExample } from "@/lib/meteoExampleData";

// Регрессия: добавление новых разделов/должностей в кодировке и синхронизация
// «Микроклимата». Раньше новые строки получали workCategory "" и не проходили
// валидацию (nonEmpty) → «данные не выходят». Теперь у новой строки осмысленные
// дефолты, а категория работ нумеруется по разделу (Iб, IIб, IIIб, IVб …).

function section(number: number, title: string, name: string) {
  return {
    number,
    title,
    rows: [{ id: `id-${number}`, code: `01 00${number} 001`, name, count: 1 }],
  };
}

describe("meteo sync defaults for brand-new sections", () => {
  const sections = [
    section(1, "Раздел один", "ааа"),
    section(2, "Раздел два", "ббб"),
    section(3, "Рандом ВВВ", "ввв"),
    section(4, "Рандом ГГГ", "ггг"),
  ];

  const result = syncProtocolFromCoding(
    "meteo",
    { places: [] },
    sections,
  ) as { places: { measurements: Record<string, string>[] }[] };

  const rowOf = (s: number) => result.places[s - 1].measurements[0];

  it("категория работ нумеруется по разделу римскими + «б»", () => {
    expect(rowOf(1).workCategory).toBe("Iб");
    expect(rowOf(2).workCategory).toBe("IIб");
    expect(rowOf(3).workCategory).toBe("IIIб");
    expect(rowOf(4).workCategory).toBe("IVб");
  });

  it("дефолты измерений по требованию заказчика", () => {
    const r = rowOf(3);
    expect(r.timeOfDay).toBe("день");
    expect(r.tempMeasured).toBe(""); // не трогаем
    expect(r.tempAllowed).toBe("16-27");
    expect(r.humidityMeasured).toBe(""); // не трогаем
    expect(r.humidityAllowed).toBe("70");
    expect(r.airSpeedMeasured).toBe("-"); // пока не трогаем
    expect(r.airSpeedAllowed).toBe("-"); // пока не трогаем
    expect(r.pressure).toBe("694");
  });

  it("новые строки проходят валидацию схемы (баг «данные не выходят»)", () => {
    const candidate = {
      ...meteoExample,
      // Заполняем обязательные поля шапки, которые в примере пустые, чтобы
      // тест проверял именно строки измерений, а не заголовок протокола.
      customer: { name: "Заказчик", address: "Адрес" },
      representative: "Иванов И.И.",
      performer: { fullName: "Петров П.П.", position: "Специалист" },
      director: { fullName: "Сидоров С.С." },
      places: result.places.map((p, i) => ({
        number: i + 1,
        name: sections[i].title,
        measurements: p.measurements,
      })),
    };
    const parsed = meteoProtocolSchema.safeParse(candidate);
    expect(parsed.success).toBe(true);
  });
});
