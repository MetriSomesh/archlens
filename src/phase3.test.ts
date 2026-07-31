import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateSpec, detectCycles } from "./schema.js";
import { toMermaid } from "./mermaid.js";
import { renderSpecToHtml } from "./index.js";
import { ArchlensWorkspace } from "./workspace.js";

const FLOW_SPEC = {
  meta: { title: "Flow System" },
  nodes: [
    { id: "web", label: "Web", type: "ui" as const },
    { id: "api", label: "API", type: "service" as const, tech: "Node" },
    { id: "db", label: "DB", type: "datastore" as const },
    { id: "q", label: "Queue", type: "queue" as const },
    { id: "ext", label: "Stripe", type: "external" as const },
  ],
  edges: [
    { from: "web", to: "api", label: "REST" },
    { from: "api", to: "db" },
    { from: "api", to: "q", style: "dashed" as const },
    { from: "api", to: "ext" },
  ],
  flows: [{ name: "Checkout", steps: ["web", "api", "db"] }],
};

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "archlens-p3-"));
}

test("detectCycles finds a directed cycle and ignores a DAG", () => {
  const { spec: dag } = validateSpec(FLOW_SPEC);
  assert.equal(detectCycles(dag).length, 0);

  const { spec: cyclic } = validateSpec({
    nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ],
  });
  const cycles = detectCycles(cyclic);
  assert.equal(cycles.length, 1);
  // normalized to start at the smallest id and close the loop
  assert.deepEqual(cycles[0], ["a", "b", "c", "a"]);
});

test("validateSpec surfaces a cycle as a warning", () => {
  const { warnings } = validateSpec({
    nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ],
  });
  assert.ok(warnings.some((w) => w.startsWith("cycle detected:")));
});

test("toMermaid emits a flowchart with subgraphs, shapes and edges", () => {
  const { spec } = validateSpec({
    ...FLOW_SPEC,
    groups: [{ id: "backend", label: "Backend", nodes: ["api", "db", "q"] }],
  });
  const mmd = toMermaid(spec);
  assert.match(mmd, /^flowchart TD/);
  assert.match(mmd, /subgraph .*\["Backend"\]/);
  assert.match(mmd, /-->\|"REST"\|/); // labeled edge
  assert.match(mmd, /-\.->/); // dashed edge
  assert.match(mmd, /\[\(".*DB.*"\)\]/); // datastore cylinder
  assert.match(mmd, /\{\{".*Stripe.*"\}\}/); // external hexagon
});

test("toMermaid sanitizes ids and quotes safely", () => {
  const { spec } = validateSpec({
    nodes: [
      { id: "web.app-1", label: 'Web "App"' },
      { id: "svc:core", label: "Svc" },
    ],
    edges: [{ from: "web.app-1", to: "svc:core" }],
  });
  const mmd = toMermaid(spec);
  // no raw dots/colons/dashes leaking into mermaid ids on the edge line
  assert.match(mmd, /web_app_1 --> svc_core/);
  assert.ok(!mmd.includes('Web "App"')); // quotes were replaced
});

test("rendered HTML embeds flow controls, geometry and a PNG button", async () => {
  const { html } = await renderSpecToHtml(FLOW_SPEC);
  assert.match(html, /id="arch-geo"/);
  assert.match(html, /id="al-flow"/); // flow selector present (spec has a flow)
  assert.match(html, /<option value="0">Checkout<\/option>/);
  assert.match(html, /id="al-png"/);
  assert.match(html, /flow-dot/); // animation styles/logic present
  assert.match(html, /data-from="web" data-to="api"/);
});

test("HTML without flows omits the flow selector but keeps PNG", async () => {
  const { html } = await renderSpecToHtml({
    nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    edges: [{ from: "a", to: "b" }],
  });
  assert.ok(!html.includes('id="al-flow"'));
  assert.match(html, /id="al-png"/);
});

test("workspace exports mermaid to a .mmd file", async () => {
  const dir = await tmpDir();
  const ws = new ArchlensWorkspace({ outDir: dir, serve: false });
  await ws.render(FLOW_SPEC, "flow-system");
  const { file } = await ws.export("mermaid");
  assert.ok(file.endsWith(".mmd"));
  const mmd = await fs.readFile(file, "utf8");
  assert.match(mmd, /^flowchart TD/);
  await ws.close();
});
