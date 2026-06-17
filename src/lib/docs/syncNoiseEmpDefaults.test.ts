import { describe, it, expect } from "vitest";
import { normalizeCodingDocument } from "./workplaceCodes";
import { syncProtocolFromCoding, extractCodingSections } from "./syncWorkplaces";
import { noiseProtocolSchema } from "@/lib/noiseSchema";
import { empProtocolSchema } from "@/lib/empSchema";

// Регрессия: новый раздел в «Шуме» и «ЭМП» раньше не проходил валидацию, т.к.
// поля «измеренное» были обязательными (nonEmpty), а дефолт оставляет их
// пустыми (их вписывает пользователь). Привели к правилу meteo/lighting:
// «измеренное» необязательное, «допустимое» (норма) обязательное.

const header = {
  protocol: { number: "1", year: "2026", day: "1", month: "января", dateYear: "2026" },
  customer: { name: "Заказчик", address: "Адрес" },
  measurementDate: { day: "1", month: "января", year: "2026" },
  purpose: "Аттестация",
  methodologyStandard: "ГОСТ",
  productStandard: "НД",
  representative: "Иванов И.И.",
  performer: { fullName: "Петров П.П.", position: "Специалист" },
  director: { fullName: "Сидоров С.С." },
};

const coding = normalizeCodingDocument({
  sections: [{ number: 1, title: "Совсем новый раздел", rows: [{ code: "", name: "Ххх", count: 1 }] }],
});
const sections = extractCodingSections(coding);

describe("noise/emp fresh-section validation", () => {
  it("«Шум»: новый раздел проходит валидацию (measured пустой допустим)", () => {
    const noise = syncProtocolFromCoding("noise", { places: [] }, sections) as {
      places: unknown[];
    };
    const parsed = noiseProtocolSchema.safeParse({ ...header, places: noise.places });
    expect(parsed.success).toBe(true);
  });

  it("«ЭМП»: новый раздел проходит валидацию (measured пустой допустим)", () => {
    const emp = syncProtocolFromCoding("emp", { places: [] }, sections) as {
      places: unknown[];
    };
    const parsed = empProtocolSchema.safeParse({ ...header, places: emp.places });
    expect(parsed.success).toBe(true);
  });
});
