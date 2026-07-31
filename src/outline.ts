import type { NormalizedSpec } from "./schema.js";
import { resolveGroupMembership } from "./schema.js";
import { sanitizeText } from "./lint.js";

/**
 * A plain-text outline of the architecture. Serves two jobs:
 *  1. Accessible / no-JS fallback embedded in the HTML.
 *  2. The canonical summary returned to the agent so it can discuss the diagram accurately.
 * No em-dashes (uses sanitizeText on all user strings).
 */
export function textOutline(spec: NormalizedSpec): string {
  const lines: string[] = [];
  lines.push(sanitizeText(spec.meta.title));
  lines.push("");

  const membership = resolveGroupMembership(spec);
  const byGroup = new Map<string, typeof spec.nodes>();
  const ungrouped: typeof spec.nodes = [];
  for (const n of spec.nodes) {
    const g = membership.get(n.id);
    if (g) {
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(n);
    } else {
      ungrouped.push(n);
    }
  }

  lines.push("Components:");
  for (const group of spec.groups) {
    const members = byGroup.get(group.id) ?? [];
    if (members.length === 0) continue;
    lines.push(`  [${sanitizeText(group.label)}]`);
    for (const n of members) lines.push(`    - ${nodeLine(n)}`);
  }
  if (ungrouped.length > 0) {
    lines.push("  (ungrouped)");
    for (const n of ungrouped) lines.push(`    - ${nodeLine(n)}`);
  }

  if (spec.edges.length > 0) {
    lines.push("");
    lines.push("Connections:");
    const labelById = new Map(spec.nodes.map((n) => [n.id, sanitizeText(n.label)]));
    for (const e of spec.edges) {
      const from = labelById.get(e.from) ?? e.from;
      const to = labelById.get(e.to) ?? e.to;
      const via = e.label ? ` (${sanitizeText(e.label)})` : "";
      lines.push(`  ${from} -> ${to}${via}`);
    }
  }

  if (spec.flows.length > 0) {
    lines.push("");
    lines.push("Flows:");
    const labelById = new Map(spec.nodes.map((n) => [n.id, sanitizeText(n.label)]));
    for (const f of spec.flows) {
      const steps = f.steps.map((s) => labelById.get(s) ?? s).join(" -> ");
      lines.push(`  ${sanitizeText(f.name)}: ${steps}`);
    }
  }

  return lines.join("\n");
}

function nodeLine(n: { label: string; type: string; tech?: string }): string {
  const tech = n.tech ? ` [${sanitizeText(n.tech)}]` : "";
  return `${sanitizeText(n.label)} (${n.type})${tech}`;
}
