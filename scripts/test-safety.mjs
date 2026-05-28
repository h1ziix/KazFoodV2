// Quick render test for safety template.
import { readFileSync, writeFileSync } from "node:fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function row(code, position) {
  return {
    code,
    position,
    count: 1,
    equipment: "Оборудование согласно перечня",
    documentation: "в наличии",
    result: "соответствует",
    nonComplianceReasons: "отсутствуют",
    finalNote: "соответствует стандартам",
  };
}

const adminMeasurements = [
  row("01 001 001", "Директор"),
  row("01 001 002", "Управляющий производством"),
  row("01 001 003", "Бухгалтер"),
  row("01 001 004", "Коммерческий директор"),
  row("01 001 005", "Технический директор"),
  row("01 001 006", "Менеджер по продажам"),
  row("01 001 007", "Менеджер по продажам"),
  row("01 001 008", "Менеджер по снабжению"),
  row("01 001 009", "Главный механик"),
  row("01 001 010", "Главный энергетик"),
  row("01 001 011", "Специалист по кадровым вопросам"),
  row("01 001 012", "Начальник службы безопасности"),
  row("01 001 013", "Специалист по безопасности и охране труда"),
  row("01 001 014", "Технолог оператор"),
];

const productionMeasurements = [
  row("01 002 015", "Технолог оператор"),
  row("01 002 016", "Бригадир ремонтно-строительной бригады"),
  row("01 002 017", "Бригадир технической бригады"),
  row("01 002 018", "Бригадир цеха выращивания и хранения"),
  row("01 002 019", "Электро слесарь"),
  row("01 002 020", "Водитель экспедитор"),
  row("01 002 021", "Лаборант"),
  row("01 002 022", "Поливщик"),
  row("01 002 023", "Сборщик"),
  row("01 002 024", "Фасовщик"),
  row("01 002 025", "Грузчик"),
  row("01 002 026", "Тракторист"),
  row("01 002 027", "Разнорабочий"),
  row("01 002 028", "Слесарь"),
  row("01 002 029", "Сторож"),
  row("01 002 030", "Шеф повар"),
  row("01 002 031", "Посудомойщица"),
  row("01 002 032", "Прачка"),
];

const context = {
  "protocol.number": "1",
  "customer.name": "KazEcoFood",
  "customer.address":
    "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
  measurementPlace:
    "1. Административно – управленческий персонал, 2. Производственный персонал",
  "measurementDate.day": "10",
  "measurementDate.month": "апреля",
  "measurementDate.year": "2026",
  "performer.fullName": "Исаева А.В.",
  "performer.position": "Специалист лаборатории",
  "representative.fullName": "Богачев А.И.",
  "representative.position": "Начальник по БиОТ",
  adminMeasurements,
  productionMeasurements,
};

const tpl = readFileSync(
  resolve(ROOT, "public/templates/safety-protocol.docx"),
);
const zip = new PizZip(tpl);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
try {
  doc.render(context);
} catch (e) {
  console.error("Render error:", e.message);
  if (e.properties?.errors) {
    for (const err of e.properties.errors) {
      console.error("  -", err.message, err.properties?.explanation ?? "");
    }
  }
  process.exit(1);
}
const buf = doc
  .getZip()
  .generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
writeFileSync(resolve(ROOT, "test-safety-output.docx"), buf);
console.log("✓ Wrote test-safety-output.docx", buf.length, "bytes");
