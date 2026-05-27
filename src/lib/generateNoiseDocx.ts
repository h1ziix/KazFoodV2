import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import type { NoiseMeasurement, NoiseProtocol } from "@/types/noise";

const TEMPLATE_URL = "/templates/noise-protocol.docx";
const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class TemplateRenderError extends Error {
  public readonly details: string[];
  constructor(message: string, details: string[]) {
    super(message);
    this.name = "TemplateRenderError";
    this.details = details;
  }
}

export async function generateNoiseDocx(data: NoiseProtocol): Promise<void> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить шаблон ${TEMPLATE_URL}: ${response.status} ${response.statusText}`,
    );
  }
  const buffer = await response.arrayBuffer();

  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  try {
    doc.render(buildTemplateContext(data));
  } catch (err) {
    const details = extractTemplateErrorDetails(err);
    throw new TemplateRenderError(
      "Ошибка при рендеринге шаблона DOCX",
      details,
    );
  }

  const blob = doc.getZip().generate({
    type: "blob",
    mimeType: MIME_DOCX,
  });

  const filename = `Шум_${data.protocol.number}.docx`;
  saveAs(blob, filename);
}

export function buildTemplateContext(
  data: NoiseProtocol,
): Record<string, unknown> {
  // Flatten places + measurements into a single ordered list. The first
  // measurement of each place carries `showPlace: true` along with the
  // place number/name; subsequent measurements within the same place have
  // `showPlace: false`.
  const measurements: Record<string, unknown>[] = [];
  for (const place of data.places) {
    place.measurements.forEach((m, idx) => {
      measurements.push({
        ...flattenMeasurement(m),
        showPlace: idx === 0,
        placeNumber: place.number,
        placeName: place.name,
      });
    });
  }

  return {
    ...flatten(data, ["places"]),
    measurements,
  };
}

function flattenMeasurement(
  measurement: NoiseMeasurement,
): Record<string, unknown> {
  return {
    rowNumber: measurement.rowNumber,
    pointNumber: measurement.pointNumber,
    place: measurement.place,
    time: measurement.time,
    ppePresent: measurement.ppePresent,
    ppeAbsent: measurement.ppeAbsent,
    sourceStationary: measurement.sourceStationary,
    sourceNonStationary: measurement.sourceNonStationary,
    oct31: measurement.octaves.hz31,
    oct63: measurement.octaves.hz63,
    oct125: measurement.octaves.hz125,
    oct250: measurement.octaves.hz250,
    oct500: measurement.octaves.hz500,
    oct1000: measurement.octaves.hz1000,
    oct2000: measurement.octaves.hz2000,
    oct4000: measurement.octaves.hz4000,
    charBroadStationary: measurement.character.broadStationary,
    charBroadNonStationary: measurement.character.broadNonStationary,
    charBroadOscillating: measurement.character.broadOscillating,
    charBroadImpulse: measurement.character.broadImpulse,
    charTonalStationary: measurement.character.tonalStationary,
    charTonalNonStationary: measurement.character.tonalNonStationary,
    charTonalOscillating: measurement.character.tonalOscillating,
    charTonalImpulse: measurement.character.tonalImpulse,
    measured: measurement.measured,
    allowed: measurement.allowed,
  };
}

function flatten(
  value: unknown,
  skipKeys: string[] = [],
  prefix = "",
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!prefix && skipKeys.includes(k)) continue;
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, skipKeys, nextKey, out);
    } else {
      out[nextKey] = v;
    }
  }
  return out;
}

function extractTemplateErrorDetails(err: unknown): string[] {
  if (!err || typeof err !== "object") {
    return [String(err)];
  }
  const anyErr = err as {
    message?: string;
    properties?: {
      errors?: Array<{
        message?: string;
        properties?: { explanation?: string };
      }>;
    };
  };
  const out: string[] = [];
  if (anyErr.message) out.push(anyErr.message);
  const inner = anyErr.properties?.errors ?? [];
  for (const e of inner) {
    if (e.properties?.explanation) out.push(e.properties.explanation);
    else if (e.message) out.push(e.message);
  }
  return out.length > 0 ? out : ["Неизвестная ошибка шаблонизатора"];
}
