import { describe, it, expect } from "vitest";
import { normalizeCodingDocument } from "./workplaceCodes";
import { syncProtocolFromCoding, extractCodingSections } from "./syncWorkplaces";
import { lightingProtocolSchema } from "@/lib/lightingSchema";

// Требование клиента 2026-06-17: при добавлении НОВЫХ разделов с новыми
// должностями в «Освещённости» им проставляется категория работ «Б-2» и
// допустимое значение 200 (производственный персонал). Первый раздел (АУП,
// «А-1»/300) и второй («Б-2»/200) приходят из существующих данных и при синке
// сохраняются — дефолт применяется только к новым (пустым) разделам.
// Измеренное значение и КЕО не трогаются.

describe("lighting defaults for new sections", () => {
  const coding = normalizeCodingDocument({
    sections: [
      { number: 1, title: "АУП", rows: [{ code: "", name: "Директор", count: 1 }] },
      { number: 2, title: "Производственный", rows: [{ code: "", name: "Слесарь", count: 1 }] },
      { number: 3, title: "Любой новый рандом", rows: [{ code: "", name: "Ххх", count: 1 }] },
    ],
  });
  const sections = extractCodingSections(coding);

  it("новая строка получает категорию «Б-2» и допустимое 200", () => {
    const res = syncProtocolFromCoding("lighting", { places: [] }, sections) as {
      places: { measurements: Record<string, unknown>[] }[];
    };
    const rows = res.places.flatMap((p) => p.measurements);
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.workCategory).toBe("Б-2");
      expect(r.allowed).toBe(200);
      // измеренное и КЕО — дефолтные, не «проставленные» нормы
      expect(r.measured).toBe(0);
      expect(r.keo).toBe("-");
    }
  });

  it("новая строка проходит валидацию схемы (workCategory был nonEmpty)", () => {
    const res = syncProtocolFromCoding("lighting", { places: [] }, sections) as {
      places: { number: number; name: string; measurements: Record<string, unknown>[] }[];
    };
    const candidate = {
      protocol: { number: "1", year: "2026", day: "1", month: "января", dateYear: "2026" },
      customer: { name: "З", address: "А" },
      measurementDate: { day: "1", month: "января", year: "2026" },
      methodologyStandard: "ГОСТ",
      conditions: "норм",
      places: res.places,
      performer: { fullName: "П", position: "С" },
      director: { fullName: "Д" },
    };
    const parsed = lightingProtocolSchema.safeParse(candidate);
    // Если схема шапки отличается, нас интересует, что по строкам измерений
    // ошибок нет (workCategory заполнен).
    if (!parsed.success) {
      const measurementIssues = parsed.error.issues.filter((i) =>
        i.path.includes("measurements"),
      );
      expect(measurementIssues).toEqual([]);
    } else {
      expect(parsed.success).toBe(true);
    }
  });
});
