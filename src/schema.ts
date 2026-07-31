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

  return warnings;
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
