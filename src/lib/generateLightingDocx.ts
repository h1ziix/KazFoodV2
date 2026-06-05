import type { LightingMeasurement, LightingProtocol } from "@/types/lighting";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";
import { flattenPlacesMeasurements } from "./docs/rows";

const TEMPLATE_URL = "/templates/lighting-protocol.docx";

export { TemplateRenderError };

export async function generateLightingDocx(
  data: LightingProtocol,
): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Освещенность_${d.protocol.number}.docx`,
  });
}

export function buildTemplateContext(
  data: LightingProtocol,
): Record<string, unknown> {
  const placesList = data.places
    .map((p) => `${p.number}. ${p.name}`)
    .join(", ");

  // New dynamic format — requires the rebuilt template with {#measurements}/{-w:tr showPlace}.
  const measurements = flattenPlacesMeasurements(data.places, flattenMeasurement);

  // Backward-compat: older templates used {#adminMeasurements}/{#productionMeasurements}.
  const adminMeasurements = (data.places[0]?.measurements ?? []).map(flattenMeasurement);
  const productionMeasurements = data.places
    .slice(1)
    .flatMap((p) => p.measurements.map(flattenMeasurement));

  return {
    ...flatten(data, { skipKeys: ["places"] }),
    placesList,
    measurements,
    adminMeasurements,
    productionMeasurements,
  };
}

function flattenMeasurement(
  m: LightingMeasurement,
): Record<string, unknown> {
  return {
    rowNumber: m.rowNumber,
    pointNumber: m.pointNumber,
    place: m.place,
    workCategory: m.workCategory,
    lightingSystem: m.lightingSystem,
    lightingType: m.lightingType,
    measured: m.measured,
    keo: m.keo,
    allowed: m.allowed,
  };
}
