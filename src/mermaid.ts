import type { NormalizedSpec, NodeType } from "./schema.js";
import { resolveGroupMembership } from "./schema.js";
import { sanitizeText } from "./lint.js";

/**
 * Deterministic Mermaid `flowchart` export. Lets the diagram live in Markdown,
 * GitHub, or any Mermaid-aware tool. Layout is Mermaid's job here; Archlens only
 * emits the logical structure (nodes, typed shapes, groups as subgraphs, edges).
 */

/**
 * Allocate unique, valid Mermaid ids. Node ids and group ids live in separate
 * namespaces (so the same raw id used for a node and a group stays distinct),
 * while a shared `used` set guarantees no two entities ever share a Mermaid id.
 */
class IdAllocator {
  private readonly used = new Set<string>();
  private readonly nodes = new Map<string, string>();
  private readonly groups = new Map<string, string>();

  node(id: string): string {
    return this.alloc(id, this.nodes, "");
  }
  group(id: string): string {
    return this.alloc(id, this.groups, "grp_");
  }
  private alloc(id: string, seen: Map<string, string>, prefix: string): string {
    const existing = seen.get(id);
    if (existing) return existing;
    let base = (prefix + id).replace(/[^A-Za-z0-9_]/g, "_");
    if (!/^[A-Za-z_]/.test(base)) base = "n_" + base;
    let candidate = base;
    let i = 1;
    while (this.used.has(candidate)) candidate = `${base}_${i++}`;
    this.used.add(candidate);
    seen.set(id, candidate);
    return candidate;
  }
}

function label(text: string): string {
  // Mermaid quoted labels: keep it simple and safe.
  return sanitizeText(text).replace(/"/g, "'");
}

/** Wrap a label in the shape delimiters that match the node's role. */
function shape(type: NodeType, text: string): string {
  const t = `"${label(text)}"`;
  switch (type) {
    case "datastore":
    case "cache":
      return `[(${t})]`; // cylinder (storage)
    case "queue":
      return `[[${t}]]`; // subroutine (pipeline)
    case "external":
      return `{{${t}}}`; // hexagon (outside the system)
    case "client":
    case "ui":
      return `(${t})`; // rounded (surfaces)
    default:
      return `[${t}]`; // rectangle (services/gateways/jobs)
  }
}

export function toMermaid(spec: NormalizedSpec): string {
  const ids = new IdAllocator();
  const nodeById = new Map(spec.nodes.map((n) => [n.id, n]));
  const membership = resolveGroupMembership(spec);

  const lines: string[] = [];
  lines.push("flowchart TD");

  const nodeDecl = (id: string): string => {
    const n = nodeById.get(id)!;
    const text = n.tech ? `${n.label} (${n.tech})` : n.label;
    return `${ids.node(id)}${shape(n.type, text)}`;
  };

  // Groups become subgraphs; only declare a node once (inside its group).
  const declared = new Set<string>();
  for (const g of spec.groups) {
    const members = spec.nodes.filter((n) => membership.get(n.id) === g.id);
    if (members.length === 0) continue;
    lines.push(`  subgraph ${ids.group(g.id)}["${label(g.label)}"]`);
    for (const n of members) {
      lines.push(`    ${nodeDecl(n.id)}`);
      declared.add(n.id);
    }
    lines.push("  end");
  }
  for (const n of spec.nodes) {
    if (!declared.has(n.id)) {
      lines.push(`  ${nodeDecl(n.id)}`);
      declared.add(n.id);
    }
  }

  for (const e of spec.edges) {
    // Skip edges to/from unknown nodes so we never emit phantom nodes.
    if (!nodeById.has(e.from) || !nodeById.has(e.to)) continue;
    const from = ids.node(e.from);
    const to = ids.node(e.to);
    const arrow = e.style === "dashed" ? "-.->" : "-->";
    const mid = e.label ? `|"${label(e.label)}"|` : "";
    lines.push(`  ${from} ${arrow}${mid} ${to}`);
  }

  return lines.join("\n") + "\n";
}
