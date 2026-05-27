import type { EmpMeasurement, EmpProtocol } from "@/types/emp";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";

const TEMPLATE_URL = "/templates/emp-protocol.docx";

export { TemplateRenderError };

export async function generateEmpDocx(data: EmpProtocol): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `ЭМП_${d.protocol.number}.docx`,
  });
}

export function buildTemplateContext(
  data: EmpProtocol,
): Record<string, unknown> {
  const placesList = data.places.map((p) => `${p.number}. ${p.name}`).join(", ");

  return {
    ...flatten(data, { skipKeys: ["emp_measurements", "places"] }),
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
