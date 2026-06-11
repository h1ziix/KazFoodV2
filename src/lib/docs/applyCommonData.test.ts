/**
 * Подстановка «Общих данных для протоколов» в формы документов.
 *
 * Ключевые свойства:
 *   - обложка получает все 5 полей подписей из общих данных (кейс клиента);
 *   - маппинг заполняет только поля, объявленные структурой документа, —
 *     чужие ключи (пути других документов) никогда не добавляются;
 *   - непустые значения документа имеют приоритет (applyCommonDefaults);
 *   - сидинг перезаписывает плейсхолдеры примера (applyCommonToSeed).
 */

import { describe, expect, it } from "vitest";
import {
  applyCommonDefaults,
  applyCommonToSeed,
} from "@/lib/docs/applyCommonData";
import type { CommonData } from "@/types/common";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>;

const COMMON: CommonData = {
  customerName: "ТОО МОЙ БРАТ",
  customerAddress: "г Батыра на улице ГЕРОЯ",
  organizationName: "МОЙ ЛАБ МОЕГО БРАТА",
  performerFullName: "БРАТ БРАТЫЧ Б",
  performerPosition: "Заведующий Брат",
  approvalFullName: "БАТР Б Б",
  approvalPosition: "Братный Директор",
  protocolDate: "10 декабря 2027",
};

/** Обложка с пустыми подписями — состояние из бага. */
function emptyCover(): AnyObj {
  return {
    customer: { organization: "", directorName: "" },
    performer: { organization: "", directorPosition: "", directorName: "" },
    city: "Алматы",
    reportYear: "2026",
    archiveYear: "2020",
  };
}

describe("обложка: 5 полей подписей из общих данных", () => {
  it("пустые поля заполняются (кейс клиента)", () => {
    const filled = applyCommonDefaults(emptyCover(), COMMON) as AnyObj;

    expect(filled.customer.organization).toBe("ТОО МОЙ БРАТ");
    expect(filled.customer.directorName).toBe("БАТР Б Б"); // утверждающий
    expect(filled.performer.organization).toBe("МОЙ ЛАБ МОЕГО БРАТА");
    expect(filled.performer.directorPosition).toBe("Заведующий Брат");
    expect(filled.performer.directorName).toBe("БРАТ БРАТЫЧ Б");
    // Прочие поля документа не тронуты.
    expect(filled.city).toBe("Алматы");
  });

  it("непустое значение документа имеет приоритет", () => {
    const cover = emptyCover();
    cover.customer.organization = "СВОЁ ЗНАЧЕНИЕ";
    const filled = applyCommonDefaults(cover, COMMON) as AnyObj;
    expect(filled.customer.organization).toBe("СВОЁ ЗНАЧЕНИЕ");
    expect(filled.customer.directorName).toBe("БАТР Б Б");
  });

  it("при сидинге значения примера перезаписываются", () => {
    const cover = emptyCover();
    cover.customer.organization = "ТОО «KazEcoFood» (пример)";
    const seeded = applyCommonToSeed(cover, COMMON) as AnyObj;
    expect(seeded.customer.organization).toBe("ТОО МОЙ БРАТ");
  });
});

describe("защита от чужих ключей", () => {
  it("документ со стандартной структурой не получает полей обложки", () => {
    const lightingLike: AnyObj = {
      customer: { name: "", address: "" },
      performer: { fullName: "", position: "" },
    };
    const filled = applyCommonDefaults(lightingLike, COMMON) as AnyObj;

    expect(filled.customer.name).toBe("ТОО МОЙ БРАТ");
    expect(filled.customer.address).toBe("г Батыра на улице ГЕРОЯ");
    expect(filled.performer.fullName).toBe("БРАТ БРАТЫЧ Б");
    expect(filled.performer.position).toBe("Заведующий Брат");
    // Ключи обложки НЕ добавлены.
    expect("organization" in filled.customer).toBe(false);
    expect("directorName" in filled.customer).toBe(false);
    expect("directorName" in filled.performer).toBe(false);
  });

  it("обложка не получает стандартных ключей (name/fullName)", () => {
    const filled = applyCommonDefaults(emptyCover(), COMMON) as AnyObj;
    expect("name" in filled.customer).toBe(false);
    expect("fullName" in filled.performer).toBe(false);
  });

  it("отсутствующие промежуточные объекты не создаются", () => {
    const doc: AnyObj = { city: "Алматы" };
    const filled = applyCommonDefaults(doc, COMMON) as AnyObj;
    expect(filled).toEqual({ city: "Алматы" });
  });
});

describe("остальные структуры", () => {
  it("кодировка: блок «УТВЕРЖДАЮ» заполняется утверждающим и заказчиком", () => {
    const coding: AnyObj = {
      approval: {
        position: "",
        organization: "",
        fullName: "",
        date: { day: "", month: "", year: "" },
      },
      sections: [],
    };
    const filled = applyCommonDefaults(coding, COMMON) as AnyObj;
    expect(filled.approval.organization).toBe("ТОО МОЙ БРАТ");
    expect(filled.approval.fullName).toBe("БАТР Б Б");
    expect(filled.approval.position).toBe("Братный Директор");
  });

  it("сводный: director.position заполняется должностью утверждающего", () => {
    const summaryLike: AnyObj = {
      director: { fullName: "", position: "" },
    };
    const filled = applyCommonDefaults(summaryLike, COMMON) as AnyObj;
    expect(filled.director.fullName).toBe("БАТР Б Б");
    expect(filled.director.position).toBe("Братный Директор");
  });

  it("введение: организация лаборатории заполняется", () => {
    const introLike: AnyObj = {
      customer: { name: "", city: "Алматы", address: "" },
      performer: { organization: "", addressRu: "", addressKk: "" },
    };
    const filled = applyCommonDefaults(introLike, COMMON) as AnyObj;
    expect(filled.performer.organization).toBe("МОЙ ЛАБ МОЕГО БРАТА");
    expect(filled.customer.name).toBe("ТОО МОЙ БРАТ");
    // Поля подписанта обложки в introLike не добавлены.
    expect("directorName" in filled.performer).toBe(false);
  });

  it("без общих данных документ возвращается как есть", () => {
    const cover = emptyCover();
    expect(applyCommonDefaults(cover, null)).toBe(cover);
  });
});
