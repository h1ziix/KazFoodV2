import { describe, expect, it } from "vitest";
import { formatProtocolNumber } from "./protocolNumber";

describe("formatProtocolNumber", () => {
  it("единичные числа → 3 цифры с двумя ведущими нулями", () => {
    expect(formatProtocolNumber(1)).toBe("001");
    expect(formatProtocolNumber(5)).toBe("005");
    expect(formatProtocolNumber(9)).toBe("009");
  });

  it("десятки → 3 цифры с одним ведущим нулём", () => {
    expect(formatProtocolNumber(10)).toBe("010");
    expect(formatProtocolNumber(11)).toBe("011");
    expect(formatProtocolNumber(99)).toBe("099");
  });

  it("сотни → 4 цифры с одним ведущим нулём", () => {
    expect(formatProtocolNumber(100)).toBe("0100");
    expect(formatProtocolNumber(111)).toBe("0111");
    expect(formatProtocolNumber(999)).toBe("0999");
  });

  it("тысячи → один ведущий ноль сохраняется", () => {
    expect(formatProtocolNumber(1000)).toBe("01000");
  });

  it("отклоняет некорректные значения", () => {
    expect(() => formatProtocolNumber(0)).toThrow();
    expect(() => formatProtocolNumber(-1)).toThrow();
    expect(() => formatProtocolNumber(1.5)).toThrow();
  });
});
