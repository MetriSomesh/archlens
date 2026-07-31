import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { ArchlensWorkspace, applyPatch, countsSummary } from "./workspace.js";
import { validateSpec } from "./schema.js";
import { startServer } from "./server.js";
import { createMcpServer } from "./mcp.js";

const SPEC = {
  meta: { title: "Test System" },
  nodes: [
    { id: "web", label: "Web App", type: "ui" as const },
    { id: "api", label: "API", type: "service" as const, tech: "Node" },
    { id: "db", label: "Database", type: "datastore" as const },
  ],
  edges: [
    { from: "web", to: "api", label: "REST" },
    { from: "api", to: "db" },
  ],
};

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "archlens-test-"));
}

test("workspace renders a spec to a self-contained html file", async () => {
  const dir = await tmpDir();
  const ws = new ArchlensWorkspace({ outDir: dir, serve: false });
  const result = await ws.render(SPEC, "test-system");
  assert.equal(result.name, "test-system");
  assert.equal(path.basename(result.file), "test-system.html");
  assert.equal(result.url, undefined); // not serving
  const html = await fs.readFile(result.file, "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Test System/);
  assert.ok(result.summary.includes("3 components"));
  assert.ok(result.summary.includes("2 connections"));
  await ws.close();
});

test("countsSummary pluralizes correctly", () => {
  const { spec } = validateSpec(SPEC);
  assert.equal(countsSummary(spec), "3 components, 2 connections");
  const { spec: one } = validateSpec({ nodes: [{ id: "a", label: "A" }] });
  assert.equal(countsSummary(one), "1 component, 0 connections");
});

test("applyPatch adds, updates and removes nodes and edges", () => {
  const { spec } = validateSpec(SPEC);
  const patched = applyPatch(spec, {
    addNodes: [{ id: "cache", label: "Cache", type: "cache", group: "" }] as any,
    updateNodes: [{ id: "api", label: "Gateway API" }],
    removeNodes: ["db"],
    addEdges: [{ from: "api", to: "cache", style: "solid" } as any],
  });
  const { spec: next } = validateSpec(patched);
  const ids = next.nodes.map((n) => n.id).sort();
  assert.deepEqual(ids, ["api", "cache", "web"]);
  assert.equal(next.nodes.find((n) => n.id === "api")!.label, "Gateway API");
  // edge api->db must be dropped because db was removed
  assert.ok(!next.edges.some((e) => e.to === "db"));
  assert.ok(next.edges.some((e) => e.from === "api" && e.to === "cache"));
});

test("workspace.update requires a prior render", async () => {
  const dir = await tmpDir();
  const ws = new ArchlensWorkspace({ outDir: dir, serve: false });
  await assert.rejects(() => ws.update({ removeNodes: ["x"] }), /render_architecture first/);
  await ws.close();
});

test("workspace.update patches the current diagram", async () => {
  const dir = await tmpDir();
  const ws = new ArchlensWorkspace({ outDir: dir, serve: false });
  await ws.render(SPEC, "sys");
  const result = await ws.update({ addNodes: [{ id: "q", label: "Queue", type: "queue" }] as any });
  assert.ok(result.summary.includes("4 components"));
  assert.ok(result.outline.includes("Queue"));
  await ws.close();
});

test("workspace exports svg and json", async () => {
  const dir = await tmpDir();
  const ws = new ArchlensWorkspace({ outDir: dir, serve: false });
  await ws.render(SPEC, "sys");
  const svg = await ws.export("svg");
  const json = await ws.export("json");
  assert.match(await fs.readFile(svg.file, "utf8"), /^<svg/);
  const parsed = JSON.parse(await fs.readFile(json.file, "utf8"));
  assert.equal(parsed.nodes.length, 3);
  await ws.close();
});

test("server serves files, redirects root, and pushes reload over SSE", async () => {
  const dir = await tmpDir();
  await fs.writeFile(path.join(dir, "d.html"), "<h1>hi</h1>", "utf8");
  const server = await startServer({ dir });
  server.setDefaultFile("d.html");
  try {
    // static file
    const body = await httpGet(server.urlFor("d.html"));
    assert.equal(body.status, 200);
    assert.match(body.text, /hi/);

    // root redirects to default file
    const root = await httpGet(server.url + "/", false);
    assert.equal(root.status, 302);
    assert.equal(root.headers.location, "/d.html");

    // path traversal blocked
    const bad = await httpGet(server.url + "/../secret", false);
    assert.ok(bad.status === 403 || bad.status === 404);

    // SSE reload
    const got = await sseExpectReload(server.url + "/__reload", () => {
      // give the client a tick to connect before notifying
      setTimeout(() => server.notifyReload(), 50);
    });
    assert.equal(got, "reload");
  } finally {
    await server.close();
  }
});

test("mcp tools render, update and export through the server", async () => {
  const dir = await tmpDir();
  const { workspace } = createMcpServer({ outDir: dir, serve: true, host: "127.0.0.1" });
  try {
    const r = await workspace.render(SPEC, "mcp-sys");
    assert.ok(r.url && r.url.startsWith("http://127.0.0.1:"));
    // the served page should include the live-reload client
    const page = await httpGet(r.url);
    assert.match(page.text, /EventSource\("\/__reload"\)/);

    const u = await workspace.update({ addNodes: [{ id: "w", label: "Worker", type: "job" }] as any });
    assert.ok(u.summary.includes("4 components"));
  } finally {
    await workspace.close();
  }
});

// ---- tiny http helpers (no deps) ----

function httpGet(
  url: string,
  follow = true
): Promise<{ status: number; text: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text, headers: res.headers }));
    });
    req.on("error", reject);
  });
}

function sseExpectReload(url: string, onConnected: () => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let buf = "";
      res.on("data", (c) => {
        buf += c.toString();
        const m = /data:\s*(\S+)/.exec(buf);
        if (m) {
          req.destroy();
          resolve(m[1]);
        }
      });
      res.on("error", reject);
      onConnected();
    });
    req.on("error", reject);
    setTimeout(() => reject(new Error("SSE timeout")), 3000);
  });
}
