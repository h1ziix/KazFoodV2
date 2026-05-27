import type { MeteoMeasurement, MeteoProtocol } from "@/types/meteo";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";
import { flattenPlacesMeasurements } from "./docs/rows";

const TEMPLATE_URL = "/templates/meteo-protocol.docx";

export { TemplateRenderError };

export async function generateMeteoDocx(data: MeteoProtocol): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Микроклимат_${d.protocol.number}.docx`,
  });
}

export function buildTemplateContext(
  data: MeteoProtocol,
): Record<string, unknown> {
  // Same shape as noise-protocol: places + measurements collapsed into
  // one ordered list with showPlace markers on the first row of each
  // place section.
  const measurements = flattenPlacesMeasurements(
    data.places,
    flattenMeasurement,
  );

  return {
    ...flatten(data, { skipKeys: ["places"] }),
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
