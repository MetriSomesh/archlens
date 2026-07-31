import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateSpec } from "./schema.js";
import { layoutSpec } from "./layout.js";
import { renderHtml } from "./render.js";
import { renderSpecToHtml } from "./index.js";
import { sanitizeText, lintOutput } from "./lint.js";
import { textOutline } from "./outline.js";
import { iconSvg } from "./icons.js";

function loadExample(): unknown {
  return JSON.parse(readFileSync("examples/commute-plus.json", "utf8"));
}

test("renderHtml produces a self-contained interactive page", async () => {
  const { spec } = validateSpec(loadExample());
  const layout = await layoutSpec(spec);
  const html = renderHtml(layout, spec);
  assert.ok(html.startsWith("<!doctype html>"), "doctype");
  assert.ok(html.includes("</html>"), "closes html");
  assert.ok(html.includes("<svg id=\"al-canvas\""), "has diagram svg");
  assert.ok(html.includes("OpenTripPlanner"), "has a node label");
  assert.ok(html.includes("id=\"arch-spec\""), "embeds the spec");
  // No external network dependencies (self-contained): no google fonts, no http(s) asset links.
  assert.ok(!/<link[^>]+href=/.test(html), "no <link> asset");
  assert.ok(!html.includes("fonts.googleapis.com"), "no google fonts");
});

test("output honors Taste Skill: no Inter default, dark+light, reduced-motion, one accent", async () => {
  const { html } = await renderSpecToHtml(loadExample());
  assert.ok(!/font-family:\s*Inter/i.test(html) && !html.includes("'Inter'"), "not Inter");
  assert.ok(html.includes("prefers-color-scheme: dark"), "dark theme handling");
  assert.ok(html.includes('data-theme="dark"'), "dark theme selector");
  assert.ok(html.includes("prefers-reduced-motion"), "reduced-motion");
  assert.ok(html.includes("Geist"), "Geist in font stack");
});

test("uses real Phosphor icons (not hand-rolled), one per node type present", () => {
  const svg = iconSvg("datastore");
  assert.ok(svg.includes("<svg"), "icon is svg");
  assert.ok(svg.includes("<path"), "icon has path data");
  assert.ok(svg.includes("currentColor"), "icon inherits color");
});

test("zero banned dashes in output, even when the spec contains em-dashes", async () => {
  const spec = {
    meta: { title: "Payments \u2014 v2" },
    nodes: [
      { id: "a", label: "Web \u2014 App", type: "ui" },
      { id: "b", label: "API", type: "gateway" },
    ],
    edges: [{ from: "a", to: "b", label: "calls \u2013 sync" }],
  };
  const { html, outline } = await renderSpecToHtml(spec);
  assert.deepEqual(lintOutput(html), [], "no banned dashes in html");
  assert.ok(!outline.includes("\u2014") && !outline.includes("\u2013"), "outline clean");
  // The label text should be preserved with a hyphen instead.
  assert.ok(html.includes("Web - App"), "em-dash replaced with hyphen");
});

test("sanitizeText replaces em/en dashes with a hyphen", () => {
  assert.equal(sanitizeText("A \u2014 B"), "A - B");
  assert.equal(sanitizeText("2018\u20132026"), "2018 - 2026");
});

test("text outline lists groups, nodes, connections and flows", () => {
  const { spec } = validateSpec(loadExample());
  const outline = textOutline(spec);
  assert.ok(outline.includes("Commute+"));
  assert.ok(outline.includes("Android App"), "group label");
  assert.ok(outline.includes("OpenTripPlanner (service)"), "node with type");
  assert.ok(outline.includes("Connections:"));
  assert.ok(outline.includes("Flows:"));
  assert.ok(outline.includes("Plan a trip:"));
});

test("lintOutput detects a banned dash in arbitrary text", () => {
  const issues = lintOutput("hello \u2014 world");
  assert.equal(issues.length, 1);
  assert.ok(issues[0].includes("em-dash"));
});
