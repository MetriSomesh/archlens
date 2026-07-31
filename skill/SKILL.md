---
name: archlens-architecture-diagrams
description: Use when a coding agent needs to show a system's architecture as a clear, interactive diagram, either for a system being planned or one that already exists. The agent authors a structured spec (nodes, groups, edges, flows) and calls Archlens to render a self-contained, taste-driven HTML diagram, returning a clickable localhost link plus a text outline the agent keeps as context.
---

# Archlens: Architecture Diagrams for AI Coding Agents

Archlens turns an architecture *description* into a beautiful, interactive diagram.
You (the agent) are the brain: you decide what the architecture is. Archlens is a
deterministic renderer: it validates the spec, auto-lays it out, and makes it look
great. No API key, works offline.

Visual taste is governed by [Taste Skill](https://github.com/Leonxlnx/taste-skill)
(`design-taste-frontend`). Install it so the whole toolchain inherits the same bar:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

## When to use this

- The user is *planning* a system and wants to see the shape of it before code exists.
- The user asks "how does this fit together?" about an existing repo. Explore the code
  with your own tools, then express what you found as a spec and render it.
- You want to explain a proposed change by drawing the before/after.

Do **not** reach for raw Mermaid when the goal is an interactive, explorable diagram.
Mermaid is only a fallback export here; the value is the typed spec + the viewer.

## How to use this

Prefer the MCP tools if your client supports MCP; otherwise use the CLI.

### MCP tools

- `render_architecture({ spec, name? })` create or fully replace the diagram.
- `update_architecture({ ...patch, name? })` patch the current diagram incrementally
  (`addNodes`, `updateNodes`, `removeNodes`, `addEdges`, `removeEdges`, `addGroups`,
  `removeGroups`, `addFlows`, `removeFlows`, `meta`). The browser hot-reloads.
- `export_diagram({ format })` save `html`, `svg`, `mermaid`, or `json`.

Every call returns a clickable `http://127.0.0.1:...` URL and a plain-text outline of
the diagram. Keep that outline: it is your source of truth for what the user is looking
at, so follow-up questions can be answered accurately.

MCP config:

```json
{
  "mcpServers": {
    "archlens": { "command": "npx", "args": ["-y", "archlens", "mcp"] }
  }
}
```

### CLI

```bash
npx archlens serve ./architecture.json   # clickable link + live reload
npx archlens render ./architecture.json  # one-shot self-contained .html
```

## Authoring a good spec

The spec is layout-free. Describe *logical structure*; let Archlens own the layout.
Never invent coordinates.

```json
{
  "meta": { "title": "Commute+", "theme": "auto" },
  "groups": [
    { "id": "client",  "label": "Android App",    "nodes": ["ui", "vm", "repo"] },
    { "id": "backend", "label": "Backend (Ktor)", "nodes": ["api", "fare"] },
    { "id": "data",    "label": "Data",           "nodes": ["gtfs", "osm"] }
  ],
  "nodes": [
    { "id": "ui",   "label": "Compose UI",       "type": "ui" },
    { "id": "vm",   "label": "ViewModels",        "type": "client" },
    { "id": "repo", "label": "Repository",        "type": "client" },
    { "id": "api",  "label": "REST API",          "type": "gateway", "tech": "Ktor" },
    { "id": "fare", "label": "Fare Engine",       "type": "service" },
    { "id": "gtfs", "label": "BMTC + Metro GTFS", "type": "datastore" },
    { "id": "osm",  "label": "OpenStreetMap",     "type": "datastore" }
  ],
  "edges": [
    { "from": "repo", "to": "api", "label": "HTTPS" },
    { "from": "api",  "to": "fare" },
    { "from": "api",  "to": "gtfs" }
  ],
  "flows": [
    { "name": "Plan a trip", "steps": ["ui", "vm", "repo", "api", "ui"] }
  ]
}
```

Guidance:

- **Pick the right `type`** for each node: `ui`, `client`, `gateway`, `service`, `job`,
  `queue`, `cache`, `datastore`, `external`. It drives the icon and semantic color.
- **Group by boundary** (app / backend / data / third-party), not by arbitrary buckets.
- **Label edges** with the protocol or intent (`REST`, `gRPC`, `publishes`), and use
  `"style": "dashed"` for async/eventual links.
- **Add a flow** for the primary request path. It powers the animated walkthrough and is
  the fastest way for a viewer to understand the system.
- **Add `tech`** (e.g. `Postgres`, `Kafka`) when it helps; keep `description` short.

## Taste rules you must respect

These come from Taste Skill and are enforced by the renderer (a render fails if violated):

- **Zero em-dashes** anywhere in labels, outlines, summaries, or output. Use `-`.
- One brand accent plus semantic per-type colors. No AI-purple, no neon glow.
- Light and dark both ship, with AA contrast. Motion is motivated and honors
  `prefers-reduced-motion`.
- Icons are Phosphor, one family. Type is a self-hosted grotesk (Geist), never Inter.

## Pre-flight before you present a diagram

- [ ] Every node has a sensible `type`; related nodes are grouped by boundary.
- [ ] Edges are directional and labeled where the relationship isn't obvious.
- [ ] At least one `flow` describes the primary path, if the system has one.
- [ ] You addressed any warnings returned (orphans, dangling edges, cycles).
- [ ] You kept the returned outline so you can discuss the diagram accurately.
