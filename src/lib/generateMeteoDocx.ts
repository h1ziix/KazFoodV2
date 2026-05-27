import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import type { MeteoMeasurement, MeteoProtocol } from "@/types/meteo";

const TEMPLATE_URL = "/templates/meteo-protocol.docx";
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

export async function generateMeteoDocx(data: MeteoProtocol): Promise<void> {
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

  const filename = `Микроклимат_${data.protocol.number}.docx`;
  saveAs(blob, filename);
}

export function buildTemplateContext(
  data: MeteoProtocol,
): Record<string, unknown> {
  // Flatten places + measurements into a single ordered list. The first
  // measurement of each place carries `showPlace: true` along with the
  // place number/name; subsequent measurements within the same place have
  // `showPlace: false`. This mirrors the noise-protocol approach: a single
  // outer loop `measurements` spans both the section-header row and the
  // data row in the template.
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
  measurement: MeteoMeasurement,
): Record<string, unknown> {
  return {
    rowNumber: measurement.rowNumber,
    pointNumber: measurement.pointNumber,
    place: measurement.place,
    workCategory: measurement.workCategory,
    timeOfDay: measurement.timeOfDay,
    tempMeasured: measurement.tempMeasured,
    tempAllowed: measurement.tempAllowed,
    humidityMeasured: measurement.humidityMeasured,
    humidityAllowed: measurement.humidityAllowed,
    airSpeedMeasured: measurement.airSpeedMeasured,
    airSpeedAllowed: measurement.airSpeedAllowed,
    pressure: measurement.pressure,
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
