import { promises as fs } from "node:fs";
import path from "node:path";
import {
  validateSpec,
  type NormalizedSpec,
  type Node,
  type Edge,
  type Group,
  type Flow,
  type Meta,
} from "./schema.js";
import { layoutSpec } from "./layout.js";
import { renderSvg, renderHtml } from "./render.js";
import { textOutline } from "./outline.js";
import { sanitizeText } from "./lint.js";
import { startServer, type ServerHandle } from "./server.js";

/**
 * A partial change set an agent can apply to the current diagram without
 * re-sending the whole spec. Every field is optional and additive/subtractive.
 */
export interface SpecPatch {
  meta?: Partial<Meta>;
  addNodes?: Node[];
  updateNodes?: Array<Partial<Node> & { id: string }>;
  removeNodes?: string[];
  addEdges?: Edge[];
  removeEdges?: Array<{ from: string; to: string }>;
  addGroups?: Group[];
  removeGroups?: string[];
  addFlows?: Flow[];
  removeFlows?: string[];
}

export interface RenderResult {
  /** Slugged diagram name (also the file stem). */
  name: string;
  /** Absolute path of the written .html file. */
  file: string;
  /** Clickable localhost URL, present only while a server is running. */
  url?: string;
  /** Canonical plain-text outline of the diagram (what the agent reasons about). */
  outline: string;
  /** Non-fatal validation warnings (dangling edges, orphans, cycles...). */
  warnings: string[];
  /** One-line counts summary. */
  summary: string;
}

export interface WorkspaceOptions {
  /** Output directory for generated files. Default `<cwd>/.archlens`. */
  outDir?: string;
  /** Bind a live server so renders return a clickable URL and hot-reload. */
  serve?: boolean;
  host?: string;
  port?: number;
}

function slugify(name: string): string {
  const s = sanitizeText(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "architecture";
}

/**
 * Holds the current diagram, renders it to disk, and (optionally) serves it
 * with live reload. This is the deterministic core shared by the MCP server
 * and the CLI; it owns no network/LLM state of its own.
 */
export class ArchlensWorkspace {
  readonly outDir: string;
  private readonly wantServe: boolean;
  private readonly host?: string;
  private readonly port?: number;
  private server: ServerHandle | null = null;
  private current: NormalizedSpec | null = null;
  private currentName = "architecture";

  constructor(opts: WorkspaceOptions = {}) {
    this.outDir = path.resolve(opts.outDir ?? path.join(process.cwd(), ".archlens"));
    this.wantServe = opts.serve ?? false;
    this.host = opts.host;
    this.port = opts.port;
  }

  get serverUrl(): string | undefined {
    return this.server?.url;
  }

  hasDiagram(): boolean {
    return this.current !== null;
  }

  /** The current spec, if any (deep-frozen copy for callers to read). */
  getSpec(): NormalizedSpec | null {
    return this.current;
  }

  private async ensureServer(): Promise<ServerHandle> {
    if (!this.server) {
      this.server = await startServer({ dir: this.outDir, host: this.host, port: this.port });
    }
    return this.server;
  }

  /** Replace the current diagram with a full spec and render it. */
  async render(input: unknown, name?: string): Promise<RenderResult> {
    const { spec, warnings } = validateSpec(input);
    this.current = spec;
    this.currentName = slugify(name ?? spec.meta.title);
    return this.commit(warnings);
  }

  /** Apply a patch to the current diagram and re-render. Requires a prior render. */
  async update(patch: SpecPatch, name?: string): Promise<RenderResult> {
    if (!this.current) {
      throw new Error("No diagram to update yet. Call render_architecture first.");
    }
    const merged = applyPatch(this.current, patch);
    const { spec, warnings } = validateSpec(merged);
    this.current = spec;
    if (name) this.currentName = slugify(name);
    return this.commit(warnings);
  }

  private async commit(warnings: string[]): Promise<RenderResult> {
    const spec = this.current!;
    await fs.mkdir(this.outDir, { recursive: true });
    const serve = this.wantServe;
    const layout = await layoutSpec(spec);
    const html = renderHtml(layout, spec, { liveReload: serve });
    const fileName = this.currentName + ".html";
    const file = path.join(this.outDir, fileName);
    await fs.writeFile(file, html, "utf8");

    let url: string | undefined;
    if (serve) {
      const server = await this.ensureServer();
      server.setDefaultFile(fileName);
      server.notifyReload();
      url = server.urlFor(fileName);
    }

    return {
      name: this.currentName,
      file,
      url,
      outline: textOutline(spec),
      warnings,
      summary: countsSummary(spec),
    };
  }

  /** Export the current diagram to a format. Returns the absolute output path. */
  async export(format: "svg" | "html" | "json", outPath?: string): Promise<{ file: string }> {
    if (!this.current) {
      throw new Error("No diagram to export yet. Call render_architecture first.");
    }
    const spec = this.current;
    const ext = "." + format;
    const target = path.resolve(
      outPath ?? path.join(this.outDir, this.currentName + ext)
    );
    await fs.mkdir(path.dirname(target), { recursive: true });

    if (format === "json") {
      await fs.writeFile(target, JSON.stringify(spec, null, 2), "utf8");
    } else if (format === "svg") {
      const layout = await layoutSpec(spec);
      await fs.writeFile(target, renderSvg(layout, spec), "utf8");
    } else {
      const layout = await layoutSpec(spec);
      await fs.writeFile(target, renderHtml(layout, spec, { liveReload: false }), "utf8");
    }
    return { file: target };
  }

  async close(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }
}

export function countsSummary(spec: NormalizedSpec): string {
  const parts = [
    `${spec.nodes.length} component${spec.nodes.length === 1 ? "" : "s"}`,
    `${spec.edges.length} connection${spec.edges.length === 1 ? "" : "s"}`,
  ];
  if (spec.groups.length) parts.push(`${spec.groups.length} group${spec.groups.length === 1 ? "" : "s"}`);
  if (spec.flows.length) parts.push(`${spec.flows.length} flow${spec.flows.length === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** Produce a raw spec object by applying a patch to a normalized spec. */
export function applyPatch(base: NormalizedSpec, patch: SpecPatch): unknown {
  const nodes: Node[] = base.nodes.map((n) => ({ ...n }));
  const edges: Edge[] = base.edges.map((e) => ({ ...e }));
  const groups: Group[] = base.groups.map((g) => ({ ...g, nodes: [...g.nodes] }));
  const flows: Flow[] = base.flows.map((f) => ({ ...f, steps: [...f.steps] }));
  const meta: Meta = { ...base.meta, ...(patch.meta ?? {}) };

  const removeNodes = new Set(patch.removeNodes ?? []);
  let nextNodes = nodes.filter((n) => !removeNodes.has(n.id));

  for (const upd of patch.updateNodes ?? []) {
    const idx = nextNodes.findIndex((n) => n.id === upd.id);
    if (idx >= 0) nextNodes[idx] = { ...nextNodes[idx], ...upd };
  }
  for (const add of patch.addNodes ?? []) {
    const idx = nextNodes.findIndex((n) => n.id === add.id);
    if (idx >= 0) nextNodes[idx] = { ...nextNodes[idx], ...add };
    else nextNodes.push(add);
  }

  // Drop edges that reference removed nodes, then remove explicit ones.
  const removeEdges = patch.removeEdges ?? [];
  let nextEdges = edges.filter(
    (e) => !removeNodes.has(e.from) && !removeNodes.has(e.to)
  );
  nextEdges = nextEdges.filter(
    (e) => !removeEdges.some((r) => r.from === e.from && r.to === e.to)
  );
  for (const add of patch.addEdges ?? []) nextEdges.push(add);

  const removeGroups = new Set(patch.removeGroups ?? []);
  let nextGroups = groups.filter((g) => !removeGroups.has(g.id));
  for (const g of nextGroups) g.nodes = g.nodes.filter((id) => !removeNodes.has(id));
  for (const add of patch.addGroups ?? []) {
    const idx = nextGroups.findIndex((g) => g.id === add.id);
    if (idx >= 0) nextGroups[idx] = add;
    else nextGroups.push(add);
  }

  const removeFlows = new Set(patch.removeFlows ?? []);
  let nextFlows = flows.filter((f) => !removeFlows.has(f.name));
  for (const add of patch.addFlows ?? []) {
    const idx = nextFlows.findIndex((f) => f.name === add.name);
    if (idx >= 0) nextFlows[idx] = add;
    else nextFlows.push(add);
  }

  return { meta, nodes: nextNodes, groups: nextGroups, edges: nextEdges, flows: nextFlows };
}
