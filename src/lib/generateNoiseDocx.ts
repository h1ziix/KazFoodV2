import type { NoiseMeasurement, NoiseProtocol } from "@/types/noise";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";

const TEMPLATE_URL = "/templates/noise-protocol.docx";

export { TemplateRenderError };

export async function generateNoiseDocx(data: NoiseProtocol): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Шум_${d.protocol.number}.docx`,
  });
}

/**
 * The template uses TWO separate loops:
 *   {#adminMeasurements}…{/adminMeasurements}  — populates the
 *     "1. Административно – управленческий персонал" sub-table.
 *   {#productionMeasurements}…{/productionMeasurements} — populates the
 *     "2. Производственный персонал" sub-table.
 *
 * `places[0]` provides admin measurements; `places[1]` provides production
 * measurements. Additional places (if any) are appended to production for
 * forward-compatibility.
 */
export function buildTemplateContext(
  data: NoiseProtocol,
): Record<string, unknown> {
  const adminPlace = data.places[0];
  const productionPlaces = data.places.slice(1);

  const adminMeasurements = (adminPlace?.measurements ?? []).map(
    flattenMeasurement,
  );
  const productionMeasurements = productionPlaces.flatMap((p) =>
    p.measurements.map(flattenMeasurement),
  );

  return {
    ...flatten(data, { skipKeys: ["places"] }),
    adminMeasurements,
    productionMeasurements,
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
