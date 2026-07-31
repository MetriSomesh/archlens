#!/usr/bin/env node
import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { ArchlensWorkspace } from "./workspace.js";
import { runMcpServer } from "./mcp.js";

/**
 * Archlens CLI. Three modes:
 *   render  one-shot: spec -> self-contained .html on disk
 *   serve   watch a spec file, render on change, live-reload the browser
 *   mcp     run as an MCP server over stdio (for AI coding agents)
 */

const program = new Command();
program
  .name("archlens")
  .description("Turn an architecture spec into a beautiful, interactive diagram.")
  .version("0.1.0");

async function readSpec(file: string): Promise<unknown> {
  const abs = path.resolve(file);
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    throw new Error(`Cannot read spec file: ${abs}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Spec is not valid JSON: ${(e as Error).message}`);
  }
}

program
  .command("render")
  .description("Render a spec file to a self-contained HTML diagram.")
  .argument("<spec>", "Path to the architecture spec (.json)")
  .option("-o, --out <dir>", "Output directory", ".archlens")
  .option("-n, --name <name>", "Diagram name / file stem")
  .option("--svg", "Also export an .svg alongside the .html")
  .option("--mermaid", "Also export a .mmd (Mermaid flowchart)")
  .option("--json", "Also export the normalized .json spec")
  .action(
    async (
      spec: string,
      opts: { out: string; name?: string; svg?: boolean; mermaid?: boolean; json?: boolean }
    ) => {
      const ws = new ArchlensWorkspace({ outDir: opts.out, serve: false });
      const input = await readSpec(spec);
      const result = await ws.render(input, opts.name);
      process.stdout.write(`Rendered "${result.name}" (${result.summary})\n`);
      process.stdout.write(`  ${result.file}\n`);
      if (opts.svg) process.stdout.write(`  ${(await ws.export("svg")).file}\n`);
      if (opts.mermaid) process.stdout.write(`  ${(await ws.export("mermaid")).file}\n`);
      if (opts.json) process.stdout.write(`  ${(await ws.export("json")).file}\n`);
      for (const w of result.warnings) process.stdout.write(`  warning: ${w}\n`);
    }
  );

program
  .command("serve")
  .description("Serve a spec file with live reload; re-renders when the file changes.")
  .argument("<spec>", "Path to the architecture spec (.json)")
  .option("-o, --out <dir>", "Output directory", ".archlens")
  .option("-n, --name <name>", "Diagram name / file stem")
  .option("-p, --port <port>", "Preferred port", (v) => parseInt(v, 10))
  .action(async (spec: string, opts: { out: string; name?: string; port?: number }) => {
    const ws = new ArchlensWorkspace({ outDir: opts.out, serve: true, port: opts.port });
    const specPath = path.resolve(spec);

    async function rerender(label: string) {
      try {
        const input = await readSpec(specPath);
        const result = await ws.render(input, opts.name);
        process.stdout.write(`${label} "${result.name}" (${result.summary})\n`);
        if (result.url) process.stdout.write(`  Open: ${result.url}\n`);
        for (const w of result.warnings) process.stdout.write(`  warning: ${w}\n`);
      } catch (e) {
        process.stderr.write(`  error: ${(e as Error).message}\n`);
      }
    }

    await rerender("Serving");

    let timer: NodeJS.Timeout | null = null;
    fsSync.watch(specPath, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => rerender("Re-rendered"), 120);
    });

    process.stdout.write("Watching for changes. Press Ctrl+C to stop.\n");
    const shutdown = async () => {
      await ws.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program
  .command("mcp")
  .description("Run Archlens as an MCP server over stdio (for AI coding agents).")
  .option("-o, --out <dir>", "Output directory", ".archlens")
  .option("-p, --port <port>", "Preferred server port", (v) => parseInt(v, 10))
  .option("--no-serve", "Do not start a local server (no clickable URL)")
  .action(async (opts: { out: string; port?: number; serve?: boolean }) => {
    await runMcpServer({ outDir: opts.out, port: opts.port, serve: opts.serve });
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`archlens: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
