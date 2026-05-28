// Quick render test for noise template.
import { readFileSync, writeFileSync } from "node:fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// inline copy of noiseExample (compiled-free)
const EMPTY_OCT = { hz31:"", hz63:"", hz125:"", hz250:"", hz500:"", hz1000:"", hz2000:"", hz4000:"" };
const EMPTY_CHR = { broadStationary:"", broadNonStationary:"", broadOscillating:"", broadImpulse:"", tonalStationary:"", tonalNonStationary:"", tonalOscillating:"", tonalImpulse:"" };
const m = (rowNumber, pointNumber, place, measured, allowed) => ({
  rowNumber, pointNumber, place, time:"7-8",
  ppePresent:"+", ppeAbsent:"", sourceStationary:"+", sourceNonStationary:"",
  octaves:{...EMPTY_OCT}, character:{...EMPTY_CHR}, measured, allowed,
});
const data = {
  protocol:{ number:"1004-ШУМ", year:"2026", day:"10", month:"апреля", dateYear:"2026" },
  customer:{ name:"KazEcoFood", address:"Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715" },
  measurementDate:{ day:"10", month:"апреля", year:"2026" },
  purpose:"Аттестация рабочих мест",
  methodologyStandard:"ГОСТ ISO 9612-2016",
  productStandard:"Приказ Министра здравоохранения Республики Казахстан от 16 февраля 2022 года № ҚР ДСМ-15. «Об утверждении гигиенических нормативов к физическим факторам, оказывающим воздействие на человека»",
  representative:"Богачев А.И.",
  places:[
    { number:1, name:"Административно – управленческий персонал", measurements:[
      m(1,"1т","Директор","45,4","50"),
      m(2,"2т","Управляющий производством","46,3","50"),
      m(3,"3т","Бухгалтер","44,0","50"),
      m(4,"4т","Коммерческий директор","45,4","50"),
      m(5,"5т","Технический директор","44,3","50"),
      m(6,"6т","Менеджер по продажам","47,0","50"),
      m(7,"7т","Менеджер по продажам","48,8","50"),
      m(8,"8т","Менеджер по снабжению","47,4","50"),
      m(9,"9т","Главный механик","56,3","50"),
      m(10,"10т","Главный энергетик","56,6","60"),
      m(11,"11т","Специалист по кадровым вопросам","55,4","60"),
      m(12,"12т","Начальник службы безопасности","55,8","60"),
      m(13,"13т","Специалист по безопасности и охране труда","48,3","50"),
      m(14,"14т","Технолог оператор","56,6","60"),
    ]},
    { number:2, name:"Производственный персонал", measurements:[
      m(15,"15т","Технолог оператор","66,6","70"),
      m(16,"16т","Бригадир ремонтно-строительной бригады","67,7","70"),
      m(17,"17т","Бригадир технической бригады","65,3","70"),
      m(18,"18т","Бригадир по выращиванию и хранению","63,6","70"),
      m(19,"19т","Электрик слесарь","62,5","70"),
      m(20,"20т","Электрик слесарь","64,6","70"),
      m(21,"21т","Электрик слесарь","62,6","70"),
      m(22,"22т","Водитель экспедитор","63,6","70"),
      m(23,"23т","Водитель экспедитор","60,6","70"),
      m(24,"24т","Водитель экспедитор","60,5","70"),
      m(25,"25т","Кладовщик","56,6","70"),
    ]},
  ],
  performer:{ fullName:"Дьяченко И.С.", position:"Заведующий лабораторией" },
  director:{ fullName:"Дьяченко В.Г." },
};

const flattenMeasurement = (mm) => ({
  rowNumber: mm.rowNumber, pointNumber: mm.pointNumber, place: mm.place, time: mm.time,
  ppePresent: mm.ppePresent, ppeAbsent: mm.ppeAbsent,
  sourceStationary: mm.sourceStationary, sourceNonStationary: mm.sourceNonStationary,
  oct31: mm.octaves.hz31, oct63: mm.octaves.hz63, oct125: mm.octaves.hz125, oct250: mm.octaves.hz250,
  oct500: mm.octaves.hz500, oct1000: mm.octaves.hz1000, oct2000: mm.octaves.hz2000, oct4000: mm.octaves.hz4000,
  charBroadStationary: mm.character.broadStationary, charBroadNonStationary: mm.character.broadNonStationary,
  charBroadOscillating: mm.character.broadOscillating, charBroadImpulse: mm.character.broadImpulse,
  charTonalStationary: mm.character.tonalStationary, charTonalNonStationary: mm.character.tonalNonStationary,
  charTonalOscillating: mm.character.tonalOscillating, charTonalImpulse: mm.character.tonalImpulse,
  measured: mm.measured, allowed: mm.allowed,
});

const context = {
  "protocol.number": data.protocol.number,
  "protocol.year": data.protocol.year,
  "protocol.day": data.protocol.day,
  "protocol.month": data.protocol.month,
  "protocol.dateYear": data.protocol.dateYear,
  "customer.name": data.customer.name,
  "customer.address": data.customer.address,
  "measurementDate.day": data.measurementDate.day,
  "measurementDate.month": data.measurementDate.month,
  "measurementDate.year": data.measurementDate.year,
  purpose: data.purpose,
  methodologyStandard: data.methodologyStandard,
  productStandard: data.productStandard,
  representative: data.representative,
  "performer.fullName": data.performer.fullName,
  "performer.position": data.performer.position,
  "director.fullName": data.director.fullName,
  adminMeasurements: data.places[0].measurements.map(flattenMeasurement),
  productionMeasurements: data.places[1].measurements.map(flattenMeasurement),
};

const tpl = readFileSync(resolve(ROOT, "public/templates/noise-protocol.docx"));
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
const buf = doc.getZip().generate({ type:"nodebuffer", mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
writeFileSync(resolve(ROOT, "test-noise-output.docx"), buf);
console.log("✓ Wrote test-noise-output.docx", buf.length, "bytes");
