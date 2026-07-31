// Ad-hoc smoke test: spawn the MCP server over stdio, list tools, call one.
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["dist/cli.js", "mcp", "--no-serve"], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buf = "";
const pending = new Map();
child.stdout.on("data", (c) => {
  buf += c.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function send(obj) {
  return new Promise((resolve) => {
    if (obj.id) pending.set(obj.id, resolve);
    child.stdin.write(JSON.stringify(obj) + "\n");
    if (!obj.id) resolve();
  });
}

const init = await send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  },
});
console.log("initialize ->", init.result.serverInfo);

await send({ jsonrpc: "2.0", method: "notifications/initialized" });

const tools = await send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
console.log("tools ->", tools.result.tools.map((t) => t.name).join(", "));

const call = await send({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "render_architecture",
    arguments: {
      name: "smoke",
      spec: {
        meta: { title: "Smoke" },
        nodes: [
          { id: "a", label: "A", type: "ui" },
          { id: "b", label: "B", type: "service" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
    },
  },
});
console.log("call ->", call.result.content[0].text.split("\n").slice(0, 3).join(" | "));

child.stdin.end();
child.kill();
process.exit(0);
