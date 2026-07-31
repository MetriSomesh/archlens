import { createRequire } from "node:module";
import type { NormalizedSpec, NodeType } from "./schema.js";
import { resolveGroupMembership } from "./schema.js";

// elkjs ships as a UMD/CJS bundle; require() returns the ELK constructor directly, which is more
// reliable than an ESM default import under NodeNext.
const require = createRequire(import.meta.url);
const ELK = require("elkjs/lib/elk.bundled.js") as new () => {
  layout(graph: object): Promise<object>;
};

export interface PositionedNode {
  id: string;
  label: string;
  type: NodeType;
  tech?: string;
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedGroup {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PositionedEdge {
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dashed";
  points: Point[];
}

export interface Layout {
  width: number;
  height: number;
  nodes: PositionedNode[];
  groups: PositionedGroup[];
  edges: PositionedEdge[];
}

const NODE_HEIGHT = 56;
const NODE_MIN_WIDTH = 150;
const CHAR_WIDTH = 8.2; // rough advance width for the label font at 14px
const NODE_HPADDING = 56; // icon + inner padding
const GROUP_LABEL_RESERVE = 34; // extra top padding inside a group for its title

/** Estimate a node's box width from its label so text never overflows. */
function nodeWidth(label: string, tech?: string): number {
  const longest = Math.max(label.length, tech ? tech.length : 0);
  return Math.max(NODE_MIN_WIDTH, Math.round(longest * CHAR_WIDTH) + NODE_HPADDING);
}

const elk = new ELK();

interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  labels?: { text: string }[];
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  x?: number;
  y?: number;
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: {
    startPoint: Point;
    endPoint: Point;
    bendPoints?: Point[];
  }[];
}

/**
 * Compute an auto-layout for a spec using ELK's layered algorithm.
 * Groups become nested container nodes; edges are routed with orthogonal sections.
 * All returned coordinates are absolute (relative to the diagram origin).
 */
export async function layoutSpec(spec: NormalizedSpec): Promise<Layout> {
  const membership = resolveGroupMembership(spec);
  const nodeById = new Map(spec.nodes.map((n) => [n.id, n]));

  // Build ELK container nodes for each group (only groups that have real members).
  const groupContainers = new Map<string, ElkNode>();
  for (const g of spec.groups) {
    groupContainers.set(g.id, {
      id: `group:${g.id}`,
      labels: [{ text: g.label }],
      layoutOptions: {
        "elk.padding": `[top=${GROUP_LABEL_RESERVE},left=20,bottom=20,right=20]`,
        "elk.spacing.nodeNode": "36",
      },
      children: [],
    });
  }

  const rootChildren: ElkNode[] = [];
  for (const n of spec.nodes) {
    const elkNode: ElkNode = {
      id: n.id,
      width: nodeWidth(n.label, n.tech),
      height: NODE_HEIGHT,
      labels: [{ text: n.label }],
    };
    const groupId = membership.get(n.id);
    const container = groupId ? groupContainers.get(groupId) : undefined;
    if (container) container.children!.push(elkNode);
    else rootChildren.push(elkNode);
  }
  for (const container of groupContainers.values()) {
    if (container.children && container.children.length > 0) rootChildren.push(container);
  }

  // Only hand ELK edges whose endpoints both exist; a dangling reference makes
  // ELK throw and would crash the whole render. Such edges are reported as
  // warnings by validateSpec and are simply left unrouted here.
  const edges: ElkEdge[] = [];
  for (let i = 0; i < spec.edges.length; i++) {
    const e = spec.edges[i];
    if (nodeById.has(e.from) && nodeById.has(e.to)) {
      edges.push({ id: `e${i}`, sources: [e.from], targets: [e.to] });
    }
  }

  const graph: ElkNode & { edges: ElkEdge[] } = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.spacing.nodeNode": "44",
      "elk.spacing.edgeNode": "24",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
    },
    children: rootChildren,
    edges,
  };

  const result = (await elk.layout(graph as unknown as object)) as unknown as ElkNode & {
    edges?: ElkEdge[];
    width?: number;
    height?: number;
  };

  const nodes: PositionedNode[] = [];
  const groups: PositionedGroup[] = [];

  // Walk the tree accumulating absolute offsets.
  function walk(node: ElkNode, offsetX: number, offsetY: number) {
    const absX = offsetX + (node.x ?? 0);
    const absY = offsetY + (node.y ?? 0);
    if (node.id.startsWith("group:")) {
      const gid = node.id.slice("group:".length);
      const g = spec.groups.find((x) => x.id === gid)!;
      groups.push({
        id: gid,
        label: g.label,
        x: absX,
        y: absY,
        width: node.width ?? 0,
        height: node.height ?? 0,
      });
    } else if (node.id !== "root") {
      const specNode = nodeById.get(node.id);
      if (specNode) {
        nodes.push({
          id: specNode.id,
          label: specNode.label,
          type: specNode.type,
          tech: specNode.tech,
          description: specNode.description,
          x: absX,
          y: absY,
          width: node.width ?? NODE_MIN_WIDTH,
          height: node.height ?? NODE_HEIGHT,
        });
      }
    }
    for (const child of node.children ?? []) walk(child, absX, absY);
  }

  walk(result, 0, 0);

  // Resolve edge geometry into absolute polylines.
  const centerById = new Map<string, Point>();
  for (const n of nodes) centerById.set(n.id, { x: n.x + n.width / 2, y: n.y + n.height / 2 });

  const positionedEdges: PositionedEdge[] = spec.edges.map((e, i) => {
    const section = result.edges?.find((re) => re.id === `e${i}`)?.sections?.[0];
    let points: Point[];
    if (section) {
      points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    } else {
      const a = centerById.get(e.from);
      const b = centerById.get(e.to);
      points = a && b ? [a, b] : [];
    }
    return { from: e.from, to: e.to, label: e.label, style: e.style, points };
  });

  return {
    width: result.width ?? 0,
    height: result.height ?? 0,
    nodes,
    groups,
    edges: positionedEdges,
  };
}
