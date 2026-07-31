export * from "./schema.js";
export * from "./layout.js";
export * from "./render.js";
export * from "./outline.js";
export * from "./lint.js";
export * from "./mermaid.js";
export * from "./server.js";
export * from "./workspace.js";
export { createMcpServer, runMcpServer, formatRenderResult } from "./mcp.js";

import { validateSpec } from "./schema.js";
import { layoutSpec } from "./layout.js";
import { renderSvg, renderHtml, type HtmlOptions } from "./render.js";
import { textOutline } from "./outline.js";

/** Convenience: validate a raw spec, lay it out, and render it to SVG. */
export async function renderSpecToSvg(
  input: unknown
): Promise<{ svg: string; warnings: string[] }> {
  const { spec, warnings } = validateSpec(input);
  const layout = await layoutSpec(spec);
  return { svg: renderSvg(layout, spec), warnings };
}

/**
 * Validate a raw spec, lay it out, and render a self-contained interactive HTML page.
 * Returns the HTML plus a text outline (the canonical summary an agent can reason about).
 */
export async function renderSpecToHtml(
  input: unknown,
  opts: HtmlOptions = {}
): Promise<{ html: string; outline: string; warnings: string[] }> {
  const { spec, warnings } = validateSpec(input);
  const layout = await layoutSpec(spec);
  const html = renderHtml(layout, spec, opts);
  return { html, outline: textOutline(spec), warnings };
}
