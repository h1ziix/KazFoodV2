import { describe, it, expect } from "vitest";
import { normalizeCodingDocument } from "./workplaceCodes";
import { syncProtocolFromCoding, extractCodingSections } from "./syncWorkplaces";
import { flattenWorkplaceFactors } from "./rows";
import { summaryProtocolSchema } from "@/lib/summarySchema";

// Регрессия: новая должность в «Сводном» без измерений получает factors: [].
// Раньше схема требовала min(1) → весь сводный протокол не валидировался.
// Теперь пустой список валиден, а при рендере должность показывается одной
// строкой с пустыми колонками факторов (не пропадает из таблицы).

describe("summary: workplace with no factors", () => {
  const coding = normalizeCodingDocument({
    sections: [{ number: 1, title: "Новый раздел", rows: [{ code: "", name: "Ххх", count: 1 }] }],
  });
  const sections = extractCodingSections(coding);

  it("синк создаёт рабочее место с пустыми факторами и оно проходит валидацию", () => {
    const summary = syncProtocolFromCoding("summary", { places: [] }, sections, {}) as {
      places: { workplaces: { factors: unknown[] }[] }[];
    };
    expect(summary.places[0].workplaces[0].factors).toEqual([]);

    const candidate = {
      protocol: { number: "1", year: "2026", day: "1", month: "января", dateYear: "2026" },
      customer: { name: "Заказчик", address: "Адрес" },
      measurementLocation: "Локация",
      measurementDate: { day: "1", month: "января", year: "2026" },
      roomDescription: "Описание",
      places: summary.places,
      measuringTools: [],
      performer: { fullName: "Петров П.П.", position: "Специалист" },
      director: { fullName: "Сидоров С.С." },
    };
    const parsed = summaryProtocolSchema.safeParse(candidate);
    if (!parsed.success) {
      const wpIssues = parsed.error.issues.filter((i) => i.path.includes("factors"));
      expect(wpIssues).toEqual([]);
    } else {
      expect(parsed.success).toBe(true);
    }
  });

  it("рендер: должность без факторов даёт одну строку (не пропадает)", () => {
    const empty = { name: "", method: "", norm: "", actual: "", classValue: "" };
    const places = [
      {
        number: 1,
        name: "Раздел",
        workplaces: [
          { code: "01 001 001", profession: "Ххх", count: 1, factors: [] as typeof empty[] },
        ],
      },
    ];
    const rows = flattenWorkplaceFactors(places, (f) => ({ factorName: f.name }), empty);
    expect(rows).toHaveLength(1);
    expect(rows[0].profession).toBe("Ххх");
    expect(rows[0].showSection).toBe(true);
    expect(rows[0].factorName).toBe("");
  });
});
