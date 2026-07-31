import { z } from "zod";

/**
 * The Archlens architecture spec — the contract an AI agent fills in.
 * Layout-free: the agent describes *logical structure*; Archlens owns *visual layout*.
 */

export const NODE_TYPES = [
  "ui",
  "client",
  "gateway",
  "service",
  "job",
  "queue",
  "cache",
  "datastore",
  "external",
] as const;

export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const NodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: NodeTypeSchema.default("service"),
  tech: z.string().optional(),
  description: z.string().optional(),
  group: z.string().optional(),
});
export type Node = z.infer<typeof NodeSchema>;

export const GroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nodes: z.array(z.string()).default([]),
  kind: z.string().optional(),
  parent: z.string().optional(),
});
export type Group = z.infer<typeof GroupSchema>;

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  protocol: z.string().optional(),
  style: z.enum(["solid", "dashed"]).default("solid"),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const FlowSchema = z.object({
  name: z.string().min(1),
  steps: z.array(z.string()).min(2),
});
export type Flow = z.infer<typeof FlowSchema>;

export const MetaSchema = z.object({
  title: z.string().default("Architecture"),
  theme: z.enum(["light", "dark", "auto"]).default("auto"),
  legend: z.boolean().default(true),
});
export type Meta = z.infer<typeof MetaSchema>;

export const SpecSchema = z.object({
  meta: MetaSchema.optional(),
  nodes: z.array(NodeSchema).min(1, "at least one node is required"),
  groups: z.array(GroupSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  flows: z.array(FlowSchema).default([]),
});
export type Spec = z.infer<typeof SpecSchema>;

/** A fully-normalized spec: meta always present, defaults applied. */
export interface NormalizedSpec extends Omit<Spec, "meta"> {
  meta: Meta;
}

export interface ValidationResult {
  spec: NormalizedSpec;
  warnings: string[];
}

/**
 * Parse + normalize a spec and collect non-fatal warnings (dangling edges, orphan nodes,
 * unknown group members). Throws a ZodError on structurally invalid input.
 */
export function validateSpec(input: unknown): ValidationResult {
  const parsed = SpecSchema.parse(input);
  const meta = MetaSchema.parse(parsed.meta ?? {});
  const spec: NormalizedSpec = { ...parsed, meta };
  return { spec, warnings: collectWarnings(spec) };
}

function collectWarnings(spec: NormalizedSpec): string[] {
  const warnings: string[] = [];
  const ids = new Set<string>();
  const dupes = new Set<string>();
  for (const n of spec.nodes) {
    if (ids.has(n.id)) dupes.add(n.id);
    ids.add(n.id);
  }
  for (const d of dupes) warnings.push(`duplicate node id: '${d}'`);

  for (const e of spec.edges) {
    if (!ids.has(e.from)) warnings.push(`edge references unknown node '${e.from}'`);
    if (!ids.has(e.to)) warnings.push(`edge references unknown node '${e.to}'`);
  }

  for (const g of spec.groups) {
    for (const member of g.nodes) {
      if (!ids.has(member)) {
        warnings.push(`group '${g.id}' references unknown node '${member}'`);
      }
    }
  }

  const connected = new Set<string>();
  for (const e of spec.edges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  for (const f of spec.flows) for (const s of f.steps) connected.add(s);
  for (const n of spec.nodes) {
    if (!connected.has(n.id)) warnings.push(`node '${n.id}' has no edges or flows (orphan)`);
  }

  for (const cycle of detectCycles(spec)) {
    warnings.push(`cycle detected: ${cycle.join(" -> ")}`);
  }

  return warnings;
}

/**
 * Find directed cycles among the edges. Returns each cycle as a list of node ids
 * that starts and ends on the same id (e.g. ['a','b','a']). Self-loops count.
 * Cycles are de-duplicated by their normalized rotation so each is reported once.
 */
export function detectCycles(spec: NormalizedSpec): string[][] {
  const ids = new Set(spec.nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of spec.edges) {
    if (ids.has(e.from) && ids.has(e.to)) adj.get(e.from)!.push(e.to);
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of ids) color.set(id, WHITE);
  const stack: string[] = [];
  const found: string[][] = [];
  const seen = new Set<string>();

  const record = (cycle: string[]) => {
    // Normalize rotation (start at the lexicographically smallest id) for dedup.
    const core = cycle.slice(0, -1);
    let min = 0;
    for (let i = 1; i < core.length; i++) if (core[i] < core[min]) min = i;
    const rotated = core.slice(min).concat(core.slice(0, min));
    const key = rotated.join(">");
    if (seen.has(key)) return;
    seen.add(key);
    found.push([...rotated, rotated[0]]);
  };

  const dfs = (u: string) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        const idx = stack.indexOf(v);
        record([...stack.slice(idx), v]);
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };

  for (const id of ids) if (color.get(id) === WHITE) dfs(id);
  return found;
}

/**
 * Resolve which group each node belongs to, honoring both `node.group` and `group.nodes[]`.
 * Returns a map of nodeId -> groupId (only for nodes that belong to a group).
 */
export function resolveGroupMembership(spec: NormalizedSpec): Map<string, string> {
  const membership = new Map<string, string>();
  for (const g of spec.groups) {
    for (const member of g.nodes) membership.set(member, g.id);
  }
  for (const n of spec.nodes) {
    if (n.group) membership.set(n.id, n.group);
  }
  return membership;
}
