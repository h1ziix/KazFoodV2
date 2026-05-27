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

  return {
    ...flatten(data, { skipKeys: ["lighting_measurements", "places"] }),
    placesList,
    lighting_measurements: data.lighting_measurements,
  };
}
