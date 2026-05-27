import { readFileSync, writeFileSync } from 'fs';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

// Inline copy of noiseExample (avoid TS import in plain node)
const EMPTY_OCT = { hz31:'',hz63:'',hz125:'',hz250:'',hz500:'',hz1000:'',hz2000:'',hz4000:'' };
const EMPTY_CH = { broadStationary:'',broadNonStationary:'',broadOscillating:'',broadImpulse:'',tonalStationary:'',tonalNonStationary:'',tonalOscillating:'',tonalImpulse:'' };
function m(n, pt, place, meas, all) { return { rowNumber:n, pointNumber:pt, place, time:'7-8', ppePresent:'+', ppeAbsent:'', sourceStationary:'+', sourceNonStationary:'', octaves:{...EMPTY_OCT}, character:{...EMPTY_CH}, measured:meas, allowed:all }; }
const data = {
  protocol: { number:'TEST-NOISE', year:'2026', day:'10', month:'апреля', dateYear:'2026' },
  customer: { name:'ТОО «Test»', address:'Тест адрес' },
  measurementDate: { day:'10', month:'апреля', year:'2026' },
  purpose: 'Аттестация',
  methodologyStandard: 'ГОСТ ISO 9612-2016',
  productStandard: 'Приказ',
  representative: 'Иванов И.И.',
  places: [
    { number:1, name:'Группа A', measurements:[ m(1,'1т','Директор','45,4','50') ] },
    { number:2, name:'Группа Б', measurements:[ m(2,'2т','Оператор','66,6','70'), m(3,'3т','Слесарь','62,5','70') ] },
  ],
  performer: { fullName:'Тестов Т.Т.', position:'Инженер' },
  director: { fullName:'Директоров Д.Д.' },
};

// Replicate buildTemplateContext from lib/generateNoiseDocx.ts
function flatten(value, skipKeys=[], prefix='', out={}) {
  if (value===null || typeof value!=='object' || Array.isArray(value)) { if (prefix) out[prefix]=value; return out; }
  for (const [k,v] of Object.entries(value)) {
    if (!prefix && skipKeys.includes(k)) continue;
    const nk = prefix ? `${prefix}.${k}` : k;
    if (v!==null && typeof v==='object' && !Array.isArray(v)) flatten(v, skipKeys, nk, out);
    else out[nk]=v;
  }
  return out;
}
function flattenMeasurement(x) {
  return {
    rowNumber:x.rowNumber, pointNumber:x.pointNumber, place:x.place, time:x.time,
    ppePresent:x.ppePresent, ppeAbsent:x.ppeAbsent,
    sourceStationary:x.sourceStationary, sourceNonStationary:x.sourceNonStationary,
    oct31:x.octaves.hz31, oct63:x.octaves.hz63, oct125:x.octaves.hz125, oct250:x.octaves.hz250,
    oct500:x.octaves.hz500, oct1000:x.octaves.hz1000, oct2000:x.octaves.hz2000, oct4000:x.octaves.hz4000,
    charBroadStationary:x.character.broadStationary, charBroadNonStationary:x.character.broadNonStationary,
    charBroadOscillating:x.character.broadOscillating, charBroadImpulse:x.character.broadImpulse,
    charTonalStationary:x.character.tonalStationary, charTonalNonStationary:x.character.tonalNonStationary,
    charTonalOscillating:x.character.tonalOscillating, charTonalImpulse:x.character.tonalImpulse,
    measured:x.measured, allowed:x.allowed,
  };
}
const measurements = [];
for (const place of data.places) {
  place.measurements.forEach((m, i) => {
    measurements.push({
      ...flattenMeasurement(m),
      showPlace: i === 0,
      placeNumber: place.number,
      placeName: place.name,
    });
  });
}
const ctx = {
  ...flatten(data, ['places']),
  measurements,
};

const buf = readFileSync('public/templates/noise-protocol.docx');
const zip = new PizZip(buf);
const doc = new Docxtemplater(zip, { paragraphLoop:true, linebreaks:true });
try {
  doc.render(ctx);
  const out = doc.getZip().generate({ type:'nodebuffer', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  writeFileSync('test-noise-output.docx', out);
  console.log('Шум: ✓ PASS, размер:', out.length);
} catch (e) {
  console.error('Шум: ✗ FAIL');
  console.error(e.message);
  if (e.properties && e.properties.errors) {
    e.properties.errors.forEach(err => {
      console.error('  -', err.message);
      if (err.properties && err.properties.explanation) console.error('    ', err.properties.explanation);
    });
  }
  process.exit(1);
}
