# Archlens

> A clear lens on your architecture.

Archlens turns an AI coding agent's **architecture description** into a **beautiful, interactive,
taste-driven diagram** — for systems you're *planning* and systems that already *exist*. It has
**no API/LLM key of its own**: the agent (in your CLI) is the brain and authors a structured spec;
Archlens is the deterministic renderer that makes it look great.

- **Agent = brain** → authors a structured architecture spec (nodes, groups, edges, flows).
- **Archlens = renderer** → validates, auto-lays-out (ELK), renders a self-contained interactive
  HTML, and returns a clickable link the agent can reason about.

Works offline. No API key. Diagrams follow [Taste Skill](https://github.com/Leonxlnx/taste-skill)
(`design-taste-frontend`) design principles.

See [`docs/PLAN.md`](docs/PLAN.md) for the full architecture and roadmap.

## Status

Under active construction. Built in phases:

- [x] Phase 0 — spec schema + ELK layout + static render
- [x] Phase 1 — interactive HTML renderer + taste
- [x] Phase 2 — MCP server + local server with live reload
- [x] Phase 3 — flow animation + exports (SVG / PNG / Mermaid) + cycle warnings
- [x] Phase 4 — skill packaging + docs + CI

## Usage

### CLI

```bash
# One-shot: render a spec file to a self-contained .html
archlens render architecture.json --name my-system

# Live mode: serve with a clickable localhost URL, hot-reload on file change
archlens serve architecture.json

# Run as an MCP server over stdio (for AI coding agents)
archlens mcp
```

`render` and `serve` write into `.archlens/` by default (override with `--out`).
`serve` prints a `http://127.0.0.1:<port>/...` link and reloads the open tab
whenever the spec file changes.

### MCP (for AI coding agents)

Archlens speaks the Model Context Protocol, so an agent in your CLI can drive it
directly. Point your MCP client at the `archlens mcp` command:

```json
{
  "mcpServers": {
    "archlens": {
      "command": "npx",
      "args": ["-y", "@someshmetri/archlens", "mcp"]
    }
  }
}
```

It exposes three tools:

- `render_architecture` — render/replace the diagram from a full spec.
- `update_architecture` — patch the current diagram incrementally
  (add/update/remove nodes, edges, groups, flows) with a live hot-reload.
- `export_diagram` — save the current diagram as `html`, `svg`, `mermaid`, or `json`.

Every tool call returns a clickable localhost URL plus a plain-text outline of
the diagram, so the agent always keeps full context of what it drew.

## Interactive diagram

The generated HTML is self-contained and offline-friendly. In the browser you get:

- **Pan / zoom / fit**, click a component for its details and connections.
- **Flow animation** — pick a named flow to trace a request path; a marker travels
  the route while off-path nodes dim. Respects `prefers-reduced-motion`.
- **Light / dark** toggle and a **PNG** download button (client-side, no server).
- An accessible **text outline** fallback for no-JS / screen readers.

Cycles and orphan components are surfaced as warnings on every render.

## The spec

The spec is layout-free: you describe *logical structure*, Archlens owns the *layout*.

- **node** `{ id, label, type, tech?, description?, group? }` where `type` is one of
  `ui`, `client`, `gateway`, `service`, `job`, `queue`, `cache`, `datastore`, `external`
  (drives icon + semantic color).
- **group** `{ id, label, nodes[], parent? }` a boundary/layer (nesting allowed).
- **edge** `{ from, to, label?, protocol?, style? }` a directed, labeled relationship
  (`style: "dashed"` for async).
- **flow** `{ name, steps[] }` an ordered path for the animated walkthrough.
- **meta** `{ title, theme?, legend? }`.

See [`examples/commute-plus.json`](examples/commute-plus.json) for a full example and
[`examples/`](examples/) for its rendered outputs.

## Skill

Archlens ships a [skill](skill/SKILL.md) that teaches an agent when to reach for a
diagram and how to author a good spec. Its visual taste is sourced from
[Taste Skill](https://github.com/Leonxlnx/taste-skill) (`design-taste-frontend`):

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

## Development

```bash
corepack enable          # use the pinned pnpm
pnpm install
pnpm run build           # tsc -> dist/
pnpm test                # build + node --test
```

The toolchain is deliberately lean (TypeScript + the Node test runner, no bundler).
ESM with NodeNext, so relative imports carry `.js` extensions.

## License

MIT
