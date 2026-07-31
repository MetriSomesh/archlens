import type { NodeType } from "./schema.js";

/**
 * Taste tokens for Archlens, built to Taste Skill (design-taste-frontend) principles:
 * neutral base + one brand accent, semantic (justified) per-type colors, no AI-purple/neon,
 * light + dark, off-black/off-white, AA contrast, one radius + spacing scale.
 *
 * Font: a system grotesk stack (deliberately NOT Inter, and no Google-Fonts <link>). Geist can be
 * self-hosted and dropped into --font in production.
 */

export const FONT_STACK =
  "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const MONO_STACK =
  "'Geist Mono', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace";

/** One brand accent (teal). Not purple, no neon. */
export const ACCENT = "#0d9488";

/**
 * Semantic per-node-type hue (muted, meaningful). These MEAN something (the node's role),
 * which is exactly the case Taste Skill allows for using color beyond one accent.
 * Kept desaturated to sit calmly on a neutral canvas.
 */
export const NODE_HUE: Record<NodeType, string> = {
  ui: "#2563eb", // blue
  client: "#0891b2", // cyan
  gateway: "#0d9488", // teal (accent family)
  service: "#7c3aed", // violet (a role color, not a decorative glow)
  job: "#d97706", // amber
  queue: "#db2777", // pink
  cache: "#dc2626", // red
  datastore: "#059669", // emerald
  external: "#64748b", // slate (outside the system)
};

export interface RenderTheme {
  /** "light" | "dark" | "auto" */
  mode: "light" | "dark" | "auto";
}

/**
 * CSS custom properties for both themes. Values are off-black / off-white (never pure #000/#fff),
 * AA-contrast text on surfaces. Consumed by the HTML template.
 */
export function themeCss(): string {
  return `
:root {
  --font: ${FONT_STACK};
  --mono: ${MONO_STACK};
  --accent: ${ACCENT};
  --radius: 12px;
  --radius-sm: 8px;
  --space: 8px;

  --bg: #fafafa;
  --surface: #ffffff;
  --surface-2: #f4f5f7;
  --border: #d9dce1;
  --border-strong: #c2c7cf;
  --text: #1c2027;
  --text-dim: #5c626c;
  --edge: #9aa0aa;
  --edge-label-bg: #ffffff;
}
:root[data-theme="dark"] {
  --bg: #0f1115;
  --surface: #171a21;
  --surface-2: #1e222b;
  --border: #2c313b;
  --border-strong: #3a414d;
  --text: #e8eaed;
  --text-dim: #9aa1ad;
  --edge: #6b7280;
  --edge-label-bg: #171a21;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1115;
    --surface: #171a21;
    --surface-2: #1e222b;
    --border: #2c313b;
    --border-strong: #3a414d;
    --text: #e8eaed;
    --text-dim: #9aa1ad;
    --edge: #6b7280;
    --edge-label-bg: #171a21;
  }
}
`.trim();
}
