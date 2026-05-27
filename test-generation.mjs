import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

// Тестовые данные для освещенности
const lightingData = {
  protocol: {
    number: "TEST-001",
    year: "2026",
    day: "25",
    month: "мая",
    dateYear: "2026",
  },
  customer: {
    name: "ТОО «Test Company»",
    address: "Тестовый адрес, 123",
  },
  measurementDate: {
    day: "25",
    month: "мая",
    year: "2026",
  },
  purpose: "Тестирование генерации",
  methodologyStandard: "ГОСТ 24940-96",
  productStandard: "Приказ МЗ РК",
  representative: "Иванов И.И.",
  roomDescription: "Тестовое помещение",
  "conditions.t": "20",
  "conditions.h": "50",
  "conditions.p": "700",
  placesList: "1. Тестовое место",
  places: [{ number: 1, name: "Тестовое место" }],
  lighting_measurements: [
    {
      rowNumber: 1,
      pointNumber: "1т",
      place: "Тестовая точка",
      workCategory: "А-1",
      lightingSystem: "Искусственное",
      lightingType: "Светодиодное",
      measured: 500,
      keo: "-",
      allowed: 300,
    }
  ],
  "performer.fullName": "Тестов Т.Т.",
  "performer.position": "Инженер",
  "director.fullName": "Директоров Д.Д.",
};

// Тестовые данные для ЭМП
const empData = {
  protocol: {
    number: "TEST-002",
    year: "2026",
    day: "25",
    month: "мая",
    dateYear: "2026",
  },
  customer: {
    name: "ТОО «Test Company»",
    address: "Тестовый адрес, 123",
  },
  measurementDate: {
    day: "25",
    month: "мая",
    year: "2026",
  },
  purpose: "Тестирование генерации",
  methodologyStandard: "МУК 4.3.045-96",
  productStandard: "Приказ МЗ РК",
  representative: "Иванов И.И.",
  placesList: "1. Тестовое место",
  places: [{ number: 1, name: "Тестовое место" }],
  emp_measurements: [
    {
      rowNumber: 1,
      pointNumber: "1т",
      place: "Тестовая точка",
      range1Name: "5 Гц – 2 кГц",
      range1Distance: "0,5",
      range1Height: "1,5",
      range1Time: "8",
      range1ElectricMeasured: "12,5",
      range1ElectricAllowed: "25",
      range1MagneticMeasured: "85",
      range1MagneticAllowed: "250",
      range2Name: "2 кГц – 400 кГц",
      range2Distance: "0,5",
      range2Height: "1,5",
      range2Time: "8",
      range2ElectricMeasured: "1,2",
      range2ElectricAllowed: "2,5",
      range2MagneticMeasured: "8,5",
      range2MagneticAllowed: "25",
    }
  ],
  "performer.fullName": "Тестов Т.Т.",
  "performer.position": "Инженер",
  "director.fullName": "Директоров Д.Д.",
};

function testTemplate(templatePath, data, outputPath) {
  try {
    console.log(`\nТестирование: ${templatePath}`);

    const content = readFileSync(templatePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.render(data);

    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    writeFileSync(outputPath, buf);
    console.log(`✓ Успешно сгенерирован: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`✗ Ошибка при генерации ${templatePath}:`);
    console.error(error.message);
    if (error.properties && error.properties.errors) {
      error.properties.errors.forEach(err => {
        console.error(`  - ${err.message}`);
        if (err.properties && err.properties.explanation) {
          console.error(`    ${err.properties.explanation}`);
        }
      });
    }
    return false;
  }
}

console.log('=== Тестирование генерации документов ===');

const lightingResult = testTemplate(
  'public/templates/lighting-protocol.docx',
  lightingData,
  'test-lighting-output.docx'
);

const empResult = testTemplate(
  'public/templates/emp-protocol.docx',
  empData,
  'test-emp-output.docx'
);

console.log('\n=== Результаты ===');
console.log(`Освещенность: ${lightingResult ? '✓ PASS' : '✗ FAIL'}`);
console.log(`ЭМП: ${empResult ? '✓ PASS' : '✗ FAIL'}`);

process.exit(lightingResult && empResult ? 0 : 1);
