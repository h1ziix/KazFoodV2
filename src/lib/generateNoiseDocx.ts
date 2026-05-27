import type { NoiseMeasurement, NoiseProtocol } from "@/types/noise";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";
import { flattenPlacesMeasurements } from "./docs/rows";

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

export function buildTemplateContext(
  data: NoiseProtocol,
): Record<string, unknown> {
  // Flatten places + measurements into a single ordered list. The first
  // measurement of each place carries `showPlace: true` along with the
  // place number/name; subsequent measurements within the same place have
  // `showPlace: false`.
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
