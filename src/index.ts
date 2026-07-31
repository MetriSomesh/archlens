export * from "./schema.js";
export * from "./layout.js";
export * from "./render.js";

import { validateSpec } from "./schema.js";
import { layoutSpec } from "./layout.js";
import { renderSvg } from "./render.js";

/** Convenience: validate a raw spec, lay it out, and render it to SVG. */
export async function renderSpecToSvg(
  input: unknown
): Promise<{ svg: string; warnings: string[] }> {
  const { spec, warnings } = validateSpec(input);
  const layout = await layoutSpec(spec);
  return { svg: renderSvg(layout, spec), warnings };
}
