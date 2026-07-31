import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A tiny static file server bound to loopback, with a Server-Sent-Events
 * live-reload channel at `/__reload`. Archlens uses it to give the agent a
 * clickable localhost URL and to hot-reload the browser whenever the diagram
 * is re-rendered. It never binds to a public interface.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

export interface ServerHandle {
  /** The base URL, e.g. http://127.0.0.1:5173 */
  readonly url: string;
  readonly host: string;
  readonly port: number;
  /** URL for a file served from the root directory. */
  urlFor(fileName: string): string;
  /** Point "/" at a specific file (302 redirect). */
  setDefaultFile(fileName: string): void;
  /** Tell every connected browser to reload. */
  notifyReload(): void;
  /** Number of live-reload clients currently connected. */
  clientCount(): number;
  close(): Promise<void>;
}

export interface ServerOptions {
  /** Directory whose files are served. */
  dir: string;
  /** Loopback host. Default 127.0.0.1. */
  host?: string;
  /** Preferred port; 0 (default) picks a free port. */
  port?: number;
}

export async function startServer(opts: ServerOptions): Promise<ServerHandle> {
  const dir = path.resolve(opts.dir);
  const host = opts.host ?? "127.0.0.1";
  await fs.mkdir(dir, { recursive: true });

  const clients = new Set<http.ServerResponse>();
  let defaultFile: string | null = null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/__reload") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write("retry: 1000\n\n");
      clients.add(res);
      const ping = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          /* ignore */
        }
      }, 15000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    if (pathname === "/" ) {
      if (defaultFile) {
        res.writeHead(302, { Location: "/" + defaultFile });
        res.end();
        return;
      }
    }

    const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(dir, rel);
    // Path-traversal guard: resolved path must stay inside dir.
    if (target !== dir && !target.startsWith(dir + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const data = await fs.readFile(target);
      const type = CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 0);
  const base = `http://${host}:${port}`;

  return {
    url: base,
    host,
    port,
    urlFor(fileName: string) {
      return base + "/" + fileName.replace(/^\/+/, "");
    },
    setDefaultFile(fileName: string) {
      defaultFile = fileName.replace(/^\/+/, "");
    },
    notifyReload() {
      for (const res of clients) {
        try {
          res.write("data: reload\n\n");
        } catch {
          clients.delete(res);
        }
      }
    },
    clientCount() {
      return clients.size;
    },
    async close() {
      for (const res of clients) {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
      clients.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// Allow `node dist/server.js <dir>` for ad-hoc debugging.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = process.argv[2] ?? ".archlens";
  startServer({ dir }).then((h) => {
    // eslint-disable-next-line no-console
    console.log("Serving " + dir + " at " + h.url);
  });
}
