import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateSpec, SpecSchema } from "./schema.js";
import { layoutSpec } from "./layout.js";
import { renderSvg } from "./render.js";
import { renderSpecToSvg } from "./index.js";

function loadExample(): unknown {
  // Tests run from the repo root, so the example path is relative to cwd.
  return JSON.parse(readFileSync("examples/commute-plus.json", "utf8"));
}

test("validateSpec accepts the Commute+ example and applies meta defaults", () => {
  const { spec, warnings } = validateSpec(loadExample());
  assert.equal(spec.nodes.length, 9);
  assert.equal(spec.meta.title, "Commute+");
  assert.equal(spec.meta.theme, "auto");
  // Example is fully connected, so there should be no orphan/dangling warnings.
  assert.deepEqual(warnings, []);
});

test("validateSpec rejects a spec with no nodes", () => {
  assert.throws(() => validateSpec({ nodes: [] }));
});

test("validateSpec warns on dangling edges and orphan nodes", () => {
  const { warnings } = validateSpec({
    nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "lonely", label: "Lonely" },
    ],
    edges: [{ from: "a", to: "ghost" }],
  });
  assert.ok(warnings.some((w) => w.includes("unknown node 'ghost'")));
  assert.ok(warnings.some((w) => w.includes("orphan")));
});

test("layoutSpec positions every node and group with real dimensions", async () => {
  const { spec } = validateSpec(loadExample());
  const layout = await layoutSpec(spec);
  assert.equal(layout.nodes.length, 9);
  assert.equal(layout.groups.length, 4);
  assert.ok(layout.width > 0 && layout.height > 0);
  for (const n of layout.nodes) {
    assert.ok(n.width > 0 && n.height > 0, `node ${n.id} has size`);
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `node ${n.id} has coords`);
  }
  // Edges preserved.
  assert.equal(layout.edges.length, spec.edges.length);
});

test("renderSvg produces valid SVG containing node labels and no em-dash", async () => {
  const { spec } = validateSpec(loadExample());
  const layout = await layoutSpec(spec);
  const svg = renderSvg(layout, spec);
  assert.ok(svg.startsWith("<svg"), "starts with <svg");
  assert.ok(svg.includes("</svg>"), "closes svg");
  assert.ok(svg.includes("OpenTripPlanner"), "includes a node label");
  assert.ok(svg.includes("GraphHopper"), "includes another node label");
  // Taste rule: zero em-dashes (or en-dashes) anywhere in output.
  assert.ok(!svg.includes("\u2014"), "no em-dash");
  assert.ok(!svg.includes("\u2013"), "no en-dash");
});

test("renderSpecToSvg convenience wrapper works end to end", async () => {
  const { svg, warnings } = await renderSpecToSvg(loadExample());
  assert.ok(svg.includes("<svg"));
  assert.deepEqual(warnings, []);
});

test("SpecSchema is exported and parseable directly", () => {
  const parsed = SpecSchema.parse({ nodes: [{ id: "x", label: "X" }] });
  assert.equal(parsed.nodes[0].type, "service"); // default applied
});
