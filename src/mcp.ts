import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  NodeSchema,
  EdgeSchema,
  GroupSchema,
  FlowSchema,
  MetaSchema,
  SpecSchema,
} from "./schema.js";
import { ArchlensWorkspace, type RenderResult, type SpecPatch } from "./workspace.js";

/**
 * The Archlens MCP server. It exposes three deterministic tools an AI coding
 * agent can call to visualize a system it is describing. Archlens holds no LLM
 * or API key of its own: the agent is the brain, Archlens is the renderer.
 */

const PatchShape = {
  meta: MetaSchema.partial().optional().describe("Patch the diagram title/theme/legend."),
  addNodes: z.array(NodeSchema).optional().describe("Components to add (or overwrite by id)."),
  updateNodes: z
    .array(NodeSchema.partial().extend({ id: z.string() }))
    .optional()
    .describe("Partial updates to existing components, matched by id."),
  removeNodes: z.array(z.string()).optional().describe("Component ids to remove."),
  addEdges: z.array(EdgeSchema).optional().describe("Connections to add."),
  removeEdges: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .optional()
    .describe("Connections to remove, matched by from/to."),
  addGroups: z.array(GroupSchema).optional().describe("Groups/boundaries to add or replace."),
  removeGroups: z.array(z.string()).optional().describe("Group ids to remove."),
  addFlows: z.array(FlowSchema).optional().describe("Named flows to add or replace."),
  removeFlows: z.array(z.string()).optional().describe("Flow names to remove."),
} as const;

function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

/** Human-readable block the agent gets back after a render. */
export function formatRenderResult(r: RenderResult, verb: string): string {
  const lines: string[] = [];
  lines.push(`${verb} "${r.name}" (${r.summary}).`);
  if (r.url) lines.push(`Open in browser: ${r.url}`);
  lines.push(`File: ${r.file}`);
  if (r.warnings.length) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of r.warnings) lines.push(`  - ${w}`);
  }
  lines.push("");
  lines.push("Current diagram outline:");
  lines.push(r.outline);
  return lines.join("\n");
}

export interface McpServerOptions {
  outDir?: string;
  host?: string;
  port?: number;
  /** Serve with a clickable URL + live reload. Default true for MCP. */
  serve?: boolean;
}

/**
 * Build the MCP server and its backing workspace. Returns both so tests can
 * drive the workspace directly and callers can wire a transport.
 */
export function createMcpServer(opts: McpServerOptions = {}) {
  const workspace = new ArchlensWorkspace({
    outDir: opts.outDir,
    host: opts.host,
    port: opts.port,
    serve: opts.serve ?? true,
  });

  const server = new McpServer(
    { name: "archlens", version: "0.1.0" },
    {
      instructions:
        "Archlens renders architecture diagrams from a structured spec. " +
        "Call render_architecture with the full system spec to create/replace the diagram, " +
        "update_architecture to patch it incrementally, and export_diagram to save a static file. " +
        "Each call returns a clickable localhost URL and a text outline you can reason about. " +
        "Works for both planned and existing systems.",
    }
  );

  server.registerTool(
    "render_architecture",
    {
      title: "Render architecture diagram",
      description:
        "Render (or fully replace) the architecture diagram from a spec of nodes, " +
        "edges, groups and flows. Returns a clickable localhost URL, a text outline, " +
        "and any validation warnings.",
      inputSchema: {
        spec: SpecSchema.describe(
          "The architecture spec: nodes (components), edges (connections), " +
            "optional groups (boundaries) and flows (ordered paths)."
        ),
        name: z
          .string()
          .optional()
          .describe("Optional file name/slug for this diagram. Defaults to the title."),
      },
    },
    async (args) => {
      try {
        const result = await workspace.render(args.spec, args.name);
        return textResult(formatRenderResult(result, "Rendered"));
      } catch (err) {
        return textResult(`Failed to render: ${errMsg(err)}`, true);
      }
    }
  );

  server.registerTool(
    "update_architecture",
    {
      title: "Update architecture diagram",
      description:
        "Incrementally patch the current diagram: add/update/remove components, " +
        "connections, groups and flows without resending the whole spec. " +
        "Re-renders and hot-reloads the open browser tab.",
      inputSchema: {
        ...PatchShape,
        name: z.string().optional().describe("Optional new file name/slug."),
      },
    },
    async (args) => {
      try {
        const { name, ...patch } = args as SpecPatch & { name?: string };
        const result = await workspace.update(patch, name);
        return textResult(formatRenderResult(result, "Updated"));
      } catch (err) {
        return textResult(`Failed to update: ${errMsg(err)}`, true);
      }
    }
  );

  server.registerTool(
    "export_diagram",
    {
      title: "Export diagram to a file",
      description:
        "Export the current diagram to a static file: 'html' (self-contained interactive), " +
        "'svg' (vector), 'mermaid' (a .mmd flowchart), or 'json' (the normalized spec). " +
        "PNG export is available from the toolbar of the interactive HTML page.",
      inputSchema: {
        format: z.enum(["html", "svg", "mermaid", "json"]).describe("Output format."),
        path: z.string().optional().describe("Optional output path. Defaults into .archlens/."),
      },
    },
    async (args) => {
      try {
        const { file } = await workspace.export(args.format, args.path);
        return textResult(`Exported ${args.format.toUpperCase()} to ${file}`);
      } catch (err) {
        return textResult(`Failed to export: ${errMsg(err)}`, true);
      }
    }
  );

  return { server, workspace };
}

function errMsg(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

/** Start the MCP server over stdio (the transport opencode and others use). */
export async function runMcpServer(opts: McpServerOptions = {}): Promise<void> {
  const { server } = createMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
