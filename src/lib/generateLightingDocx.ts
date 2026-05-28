import type { LightingProtocol } from "@/types/lighting";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";

const TEMPLATE_URL = "/templates/lighting-protocol.docx";

// Re-export so existing `import { TemplateRenderError } from
// "@/lib/generateLightingDocx"` continues to work (page.tsx still
// references it).  The class itself is now defined once in
// src/lib/docs/engine.ts.
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

  // Split lighting measurements into the two table sections rendered by
  // the template (see scripts/build-lighting-template.js). Rows whose
  // `pointNumber` ends with "т" (Russian "т" for "точка"...) up to and
  // including "13т" belong to the administrative-management section;
  // the rest belong to the production-personnel section.
  //
  // To keep the split robust for arbitrary input, callers may also set
  // an explicit `section: "admin" | "production"` field on each
  // measurement — when present it wins over the heuristic.
  const { admin, production } = splitMeasurements(data.lighting_measurements);

  return {
    ...flatten(data, { skipKeys: ["lighting_measurements", "places"] }),
    placesList,
    // Preserved for backward compatibility with any external consumer
    // that still inspects the original key; the DOCX template itself
    // no longer references it.
    lighting_measurements: data.lighting_measurements,
    adminMeasurements: admin,
    productionMeasurements: production,
  };
}

type AnyMeasurement = LightingProtocol["lighting_measurements"][number] & {
  section?: "admin" | "production";
};

function splitMeasurements(rows: LightingProtocol["lighting_measurements"]): {
  admin: AnyMeasurement[];
  production: AnyMeasurement[];
} {
  const admin: AnyMeasurement[] = [];
  const production: AnyMeasurement[] = [];
  let crossedBoundary = false;
  for (const r of rows as AnyMeasurement[]) {
    if (r.section === "production") crossedBoundary = true;
    if (r.section === "admin") {
      admin.push(r);
      continue;
    }
    if (r.section === "production") {
      production.push(r);
      continue;
    }
    // Heuristic: "13т" is the documented last admin row; everything
    // after it belongs to the production section.
    if (!crossedBoundary) {
      admin.push(r);
      if (String(r.pointNumber).trim() === "13т") crossedBoundary = true;
    } else {
      production.push(r);
    }
  }
  return { admin, production };
}
