import type { Layout } from "./layout.js";
import type { NormalizedSpec } from "./schema.js";

/**
 * Phase 0 static SVG renderer: proves the spec -> layout -> pixels pipeline.
 * Neutral styling only; the taste design system, icons, themes, and interactivity arrive in Phase 1.
 */

const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSvg(layout: Layout, spec: NormalizedSpec): string {
  const margin = 8;
  const w = Math.ceil(layout.width + margin * 2);
  const h = Math.ceil(layout.height + margin * 2);

  const groups = layout.groups
    .map(
      (g) => `
    <g>
      <rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="14"
            fill="#f4f5f7" stroke="#d7dae0" stroke-width="1"/>
      <text x="${g.x + 16}" y="${g.y + 22}" font-size="12" font-weight="600"
            fill="#5a5f6a" font-family="${FONT_STACK}">${esc(g.label)}</text>
    </g>`
    )
    .join("");

  const edges = layout.edges
    .map((e) => {
      if (e.points.length < 2) return "";
      const pts = e.points.map((p) => `${p.x},${p.y}`).join(" ");
      const dash = e.style === "dashed" ? ` stroke-dasharray="6 5"` : "";
      const mid = e.points[Math.floor(e.points.length / 2)];
      const label = e.label
        ? `<text x="${mid.x}" y="${mid.y - 5}" text-anchor="middle" font-size="11"
                 fill="#6b7078" font-family="${FONT_STACK}"
                 paint-order="stroke" stroke="#ffffff" stroke-width="3">${esc(e.label)}</text>`
        : "";
      return `<polyline points="${pts}" fill="none" stroke="#9aa0aa" stroke-width="1.6"
                        marker-end="url(#arrow)"${dash}/>${label}`;
    })
    .join("");

  const nodes = layout.nodes
    .map(
      (n) => `
    <g>
      <rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="12"
            fill="#ffffff" stroke="#cfd3da" stroke-width="1.2"/>
      <text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + 5}" text-anchor="middle"
            font-size="14" font-weight="500" fill="#1f2430"
            font-family="${FONT_STACK}">${esc(n.label)}</text>
    </g>`
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(spec.meta.title)} architecture">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa0aa"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>
  <g transform="translate(${margin},${margin})">
${groups}
${edges}
${nodes}
  </g>
</svg>`;
}
