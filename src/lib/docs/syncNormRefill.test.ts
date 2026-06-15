import { describe, it, expect } from "vitest";
import { syncProtocolFromCoding } from "./syncWorkplaces";

/**
 * Регрессия (жалоба клиента 2026-06-15: «в Тяжести/Напряжённости опять нет
 * нормы»). Карточки, авто-созданные старым кодом, имели заполненную «Итоговую
 * оценку», но ПУСТЫЕ значения показателей. hasNormContent проверял только
 * finalAssessment → такие карточки считались заполненными и не дозаполнялись
 * единой нормой при синхронизации. Теперь «заполненность» определяется по
 * значениям показателей.
 */

const sections = [
  { number: 1, title: "АУП", rows: [{ id: "x1", code: "01 001 001", name: "Директор", count: 1 }] },
  { number: 2, title: "Любой рандом", rows: [{ id: "x2", code: "01 002 001", name: "жжжж", count: 1 }] },
];

describe.each(["heaviness", "tension"] as const)("%s norm refill", (key) => {
  it("новые разделы/должности получают единую норму (значения не пустые)", () => {
    const res = syncProtocolFromCoding(key, { workplaces: [] }, sections) as {
      workplaces: Record<string, unknown>[];
    };
    expect(res.workplaces).toHaveLength(2);
    for (const card of res.workplaces) {
      const indicators = Object.values(card).filter(
        (v): v is { value: string } =>
          typeof v === "object" && v !== null && "value" in v,
      );
      expect(indicators.length).toBeGreaterThan(0);
      // у всех карточек норма одинаковая и непустая
      expect(indicators.every((i) => i.value.trim() !== "")).toBe(true);
    }
    // нормы идентичны у всех карточек (у всех абсолютно одинаковые)
    const [a, b] = res.workplaces;
    const norm = (c: Record<string, unknown>) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(c).filter(
            ([, v]) => typeof v === "object" && v !== null && "value" in (v as object),
          ),
        ),
      );
    expect(norm(a)).toBe(norm(b));
  });

  it("легаси-карточка (finalAssessment есть, значения пустые) дозаполняется", () => {
    const legacy = {
      workplaces: [
        {
          codingRowId: "x1",
          rowNumber: 1,
          code: "01 001 001",
          position: "Директор",
          measurementPlace: "АУП",
          workDescription: "",
          finalAssessment: "1 класс – Оптимальный.",
          // только один показатель, значение пустое
          ...(key === "heaviness"
            ? { p1_1_regional: { value: "", class: "1" } }
            : { p1_1_content: { value: "", class: "1" } }),
        },
      ],
    };
    const res = syncProtocolFromCoding(key, legacy, sections) as {
      workplaces: Record<string, { value: string }>[];
    };
    const card = res.workplaces[0];
    const probe = key === "heaviness" ? card.p1_1_regional : card.p1_1_content;
    expect(probe.value.trim()).not.toBe("");
  });

  it("карточка, реально заполненная пользователем, НЕ перезаписывается", () => {
    const userValue = "МОЁ-ОСОБОЕ-ЗНАЧЕНИЕ";
    const probeKey = key === "heaviness" ? "p1_1_regional" : "p1_1_content";
    const filled = {
      workplaces: [
        {
          codingRowId: "x1",
          rowNumber: 1,
          code: "01 001 001",
          position: "Директор",
          measurementPlace: "АУП",
          workDescription: "что-то",
          finalAssessment: "2 класс – Допустимый.",
          [probeKey]: { value: userValue, class: "2" },
        },
      ],
    };
    const res = syncProtocolFromCoding(key, filled, sections) as {
      workplaces: Record<string, { value: string }>[];
    };
    expect(res.workplaces[0][probeKey].value).toBe(userValue);
  });
});
