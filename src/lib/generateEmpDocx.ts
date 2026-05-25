import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import type { EmpMeasurement, EmpProtocol } from "@/types/emp";

const TEMPLATE_URL = "/templates/emp-protocol.docx";
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

export async function generateEmpDocx(data: EmpProtocol): Promise<void> {
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

  const filename = `ЭМП_${data.protocol.number}.docx`;
  saveAs(blob, filename);
}

export function buildTemplateContext(
  data: EmpProtocol,
): Record<string, unknown> {
  const placesList = data.places.map((p) => `${p.number}. ${p.name}`).join(", ");

  return {
    ...flatten(data, ["emp_measurements", "places"]),
    placesList,
    emp_measurements: data.emp_measurements.map(flattenMeasurement),
  };
}

function flattenMeasurement(
  measurement: EmpMeasurement,
): Record<string, unknown> {
  return {
    rowNumber: measurement.rowNumber,
    pointNumber: measurement.pointNumber,
    place: measurement.place,
    range1Name: measurement.range1.name,
    range1Distance: measurement.range1.distance,
    range1Height: measurement.range1.height,
    range1Time: measurement.range1.time,
    range1ElectricMeasured: measurement.range1.electricMeasured,
    range1ElectricAllowed: measurement.range1.electricAllowed,
    range1MagneticMeasured: measurement.range1.magneticMeasured,
    range1MagneticAllowed: measurement.range1.magneticAllowed,
    range2Name: measurement.range2.name,
    range2Distance: measurement.range2.distance,
    range2Height: measurement.range2.height,
    range2Time: measurement.range2.time,
    range2ElectricMeasured: measurement.range2.electricMeasured,
    range2ElectricAllowed: measurement.range2.electricAllowed,
    range2MagneticMeasured: measurement.range2.magneticMeasured,
    range2MagneticAllowed: measurement.range2.magneticAllowed,
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
