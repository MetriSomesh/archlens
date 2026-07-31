# Archlens — Project Plan

> **Provisional name:** Archlens *("a clear lens on your architecture")*. Alternatives at the end.
> **Status:** Draft for build. **Date:** 2026-07-30. **License (planned):** MIT.

An open-source tool that any AI coding CLI can call to turn an architecture *description* into a
**beautiful, interactive, taste-driven HTML diagram** — for both systems being *planned* and systems
that already *exist* — with **no API key of its own**.

---

## 1. Vision

The CLI agent already has the brain (the LLM). Archlens is a **deterministic renderer**, not another
AI wrapper. The agent decides *what* the architecture is; Archlens decides *how it looks* and
guarantees it looks great.

- **Agent = brain** → authors a structured architecture spec.
- **Archlens = renderer** → validates the spec, auto-lays it out, renders premium HTML, returns a
  clickable link + a summary the agent can reason about.

No API key, no cost, works offline, deterministic output. The project's value lives in two hard,
tasteful things: **the spec schema** and **the rendering quality**.

---

## 2. How it works, end to end

1. During a design (or code-exploration) conversation, the agent builds an **architecture spec**
   (JSON): nodes, groups/layers, labeled edges, and optional request flows.
2. The agent calls the tool: `render_architecture(spec)`.
3. Archlens: validates the spec → computes auto-layout → renders a self-contained interactive HTML
   using the **taste design system** → writes it to `./.archlens/<name>.html` → serves it on
   `http://127.0.0.1:<port>`.
4. The CLI prints a **clickable link**. The user clicks → the diagram opens in the browser: grouped
   layers, typed icons, labeled arrows, and a "▶ play flow" control that animates a request through
   the system.
5. Archlens **returns to the agent** a normalized spec + a text summary + element IDs, so the agent
   has the *full context of what is on screen* and can discuss it accurately.
6. As the user asks for changes, the agent edits the spec and re-renders → the browser **live-reloads**.

### Worked example (this is a real test case)
A commute-planner app: an Android client, a Ktor backend, an OpenTripPlanner service, a GraphHopper
service, a Photon geocoder, and GTFS/OSM data stores. The agent expresses that as a spec (see §5),
calls `render_architecture`, and the user gets a layered diagram (client / backend / data) with a
"Plan a trip" flow animation — before any code is written.

---

## 3. Two modes, one tool

- **Design / greenfield mode** — architecture invented during planning (no code yet).
- **Existing-code mode** — the agent explores the repo with its own file tools, builds the same kind
  of spec, and renders it.

Archlens is identical in both; only the agent's source of truth differs. This dual-use is the novel
part of the project.

---

## 4. Core design decisions (locked)

These resolve the subtle pitfalls found in review:

1. **Layout is precomputed in Node (the `core` package)** and serialized into the HTML. The viewer
   only *draws* and handles interaction. This keeps the standalone file deterministic, light, and
   compute-free to open. (Interactive group re-layout is a later enhancement; MVP collapses groups by
   hide/dim, not re-layout.)
2. **Two HTML variants from one render:**
   - *Served* HTML (via the local server) includes a **live-reload** client (SSE).
   - *Standalone exported* HTML omits the reload client so it opens cleanly from `file://` anywhere.
3. **Clickable link = a localhost URL by default** (`http://127.0.0.1:<port>/…`) because terminals
   hyperlink `http` links reliably; a `file://` standalone file is always written too, as a fallback.
4. **Local server binds `127.0.0.1` only** (never `0.0.0.0`) — no LAN exposure.
5. **Agent context is returned explicitly** (normalized spec + summary + IDs) *and* the spec is
   embedded in the HTML (`<script id="arch-spec" type="application/json">`) as the single source of
   truth for "update this diagram."
6. **Flow animation** highlights edges between consecutive flow steps *when such an edge exists*;
   otherwise it highlights the nodes in sequence.
7. **Accessibility + agent context in one:** every render also produces a **text outline** of the
   architecture (groups → nodes → edges), used both as the screen-reader/no-JS fallback and as the
   summary returned to the agent.

---

## 5. The spec schema (the contract)

Layout-free: the agent describes *logical structure*; Archlens owns *visual layout*. Defined in
**Zod** → runtime validation + TypeScript types + a JSON Schema the MCP client shows the agent.

Core types:
- **node** — `{ id, label, type, tech?, description?, group? }`
  where `type ∈ ui | client | gateway | service | job | queue | cache | datastore | external`
  (drives icon, color, and shape).
- **group** (layer/boundary) — `{ id, label, nodes[], kind?, parent? }` (nesting allowed).
- **edge** — `{ from, to, label?, protocol?, style? }` (direction + labeled relationship).
- **flow** — `{ name, steps[] }` (ordered node IDs for the "animate a request" feature).
- **meta** — `{ title, theme?, legend? }`.

Validation returns friendly errors and **warnings** (orphan nodes, dangling edges, cycles).

### Example spec
```json
{
  "meta": { "title": "Commute+", "theme": "light" },
  "groups": [
    { "id": "client",  "label": "Android App",     "nodes": ["ui", "vm", "repo"] },
    { "id": "backend", "label": "Backend (Ktor)",  "nodes": ["api", "fare"] },
    { "id": "routing", "label": "Routing",          "nodes": ["otp", "gh"] },
    { "id": "data",    "label": "Data",             "nodes": ["gtfs", "osm"] }
  ],
  "nodes": [
    { "id": "ui",   "label": "Compose UI",        "type": "ui" },
    { "id": "vm",   "label": "ViewModels",         "type": "client" },
    { "id": "repo", "label": "Repository",         "type": "client" },
    { "id": "api",  "label": "REST API",           "type": "gateway", "tech": "Ktor" },
    { "id": "fare", "label": "Fare Engine",        "type": "service" },
    { "id": "otp",  "label": "OpenTripPlanner",    "type": "service" },
    { "id": "gh",   "label": "GraphHopper",        "type": "service" },
    { "id": "gtfs", "label": "BMTC + Metro GTFS",  "type": "datastore" },
    { "id": "osm",  "label": "OpenStreetMap",      "type": "datastore" }
  ],
  "edges": [
    { "from": "repo", "to": "api",  "label": "HTTPS", "protocol": "REST" },
    { "from": "api",  "to": "otp",  "label": "GraphQL" },
    { "from": "api",  "to": "gh"  },
    { "from": "api",  "to": "fare" },
    { "from": "otp",  "to": "gtfs" },
    { "from": "otp",  "to": "osm"  },
    { "from": "gh",   "to": "osm"  }
  ],
  "flows": [
    { "name": "Plan a trip", "steps": ["ui", "vm", "repo", "api", "otp", "api", "ui"] }
  ]
}
```

---

## 6. The renderer & the "taste"

- **Auto-layout:** the agent never provides coordinates. ELK arranges nodes, nests groups, and routes
  edges (orthogonal routing for clean right-angle connectors).
- **Taste is governed by Taste Skill** (`design-taste-frontend`, from `Leonxlnx/taste-skill`) — see
  the dedicated **Taste Conformance** appendix below. In short: neutral base + one accent (no
  AI-purple/neon), self-hosted grotesk type (Geist, not Inter), motivated motion that honors
  `prefers-reduced-motion`, mandatory light + dark, WCAG-AA contrast, and a **zero em-dash** rule.
  The design tokens (color, type scale, spacing, elevation, per-node-type visual language) are
  implemented to satisfy Taste Skill and shipped as a documented, themeable "taste module."
- **Interactivity:** zoom/pan, click a node for its details/tech, hover to highlight connected edges,
  collapse/expand groups (MVP: hide/dim), and **flow animation**.
- **Exports:** SVG and PNG (for docs/READMEs); Mermaid + JSON as interop fallbacks.
- **No-JS / a11y fallback:** the embedded text outline renders if scripts are disabled.

---

## 7. Tech stack

- **Language:** TypeScript, Node ≥ 20.
- **Agent integration:** official **MCP SDK** (`@modelcontextprotocol/sdk`) exposing tools
  `render_architecture`, `update_architecture`, `export_diagram`.
- **CLI (fallback + testing):** `commander` — `npx archlens serve ./spec.json` for CLIs that don't
  speak MCP, and for local development.
- **Schema/validation:** **Zod** (validation + TS types + JSON-Schema export for the agent).
- **Auto-layout:** **elkjs** (ELK; hierarchical/layered layout with nested containers). `dagre`
  rejected — weaker with nested groups.
- **Viewer:** **Preact + TypeScript** (or vanilla TS — keep the inlined bundle small), bundled by
  **Vite** with **`vite-plugin-singlefile`** so the output is one self-contained `.html`.
  Renders SVG from the precomputed ELK layout; `svg-pan-zoom` (or custom) for zoom/pan.
- **Icons:** **Phosphor** (`@phosphor-icons/core` SVGs), inlined per node type, single family, one
  global stroke weight. *(Not Lucide — Taste Skill discourages it.)*
- **Type:** **Geist** (self-hosted / inlined `@font-face`, `font-display: swap`). *(Not Inter,
  not Google-Fonts `<link>` — per Taste Skill.)*
- **Design system:** CSS custom properties (tokens) + a small theming layer; light/dark; built to the
  Taste Conformance rules below.
- **Local server + live reload:** Node `http` (bound to `127.0.0.1`) + **SSE**.
- **Exports:** SVG native; PNG via **`@resvg/resvg-js`** (optional native dep); Mermaid emitter.
- **Testing:** **Vitest** — schema tests + golden/snapshot tests (spec → layout → HTML/SVG).
- **Tooling:** **pnpm** workspaces, ESLint + Prettier, `tsup` builds, **Changesets** releases,
  GitHub Actions CI.

---

## 8. Repository structure (monorepo)

```
archlens/
├─ packages/
│  ├─ core/        spec schema (Zod), layout (elkjs), render → HTML/SVG, taste tokens, text outline
│  ├─ viewer/      Preact interactive viewer (bundled + inlined into output HTML)
│  ├─ mcp/         MCP server exposing the tools
│  ├─ cli/         npx CLI (render / serve / export) for standalone use + testing
│  └─ skill/       "skill" packaging + taste guidance + spec-authoring examples
├─ examples/       sample specs (incl. Commute+) + rendered outputs
├─ docs/           schema reference, taste guide, integration guides
└─ .github/        CI, release workflows
```

---

## 9. Distribution & integration

- **npm**, `npx`-runnable: `npx archlens serve ./spec.json`.
- **MCP server** — drop-in config for MCP-compatible CLIs (Claude Code / OpenCode / Cursor / Kiro):
  ```json
  {
    "mcpServers": {
      "archlens": { "command": "npx", "args": ["-y", "archlens", "mcp"] }
    }
  }
  ```
- **Skill package** — a companion "skill" (aligned with the `npx skills add …` model) that teaches the
  agent *when* to call Archlens and *how* to author a good spec. Its visual taste is **sourced from
  Taste Skill** (`npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend`);
  our skill layers architecture-diagram-specific guidance on top. This is also the fallback path for
  CLIs without MCP.
- **License:** MIT.

---

## 10. MVP scope & phases

- **Phase 0 — Spike:** spec schema (Zod) + elkjs layout + static SVG render of the Commute+ example.
- **Phase 1 — Renderer + taste:** self-contained interactive HTML; node types/icons; groups; labeled
  edges; light/dark; zoom/pan; text-outline fallback.
- **Phase 2 — Agent loop:** MCP server; clickable localhost link; local server + SSE live-reload;
  `update_architecture`; context summary returned to the agent; spec embedded in HTML.
- **Phase 3 — Flows + exports:** flow animation; SVG/PNG/Mermaid export; warnings (cycles/orphans).
- **Phase 4 — Skill + polish:** skill packaging; docs; examples gallery; `npx` DX; CI + releases.
- **Phase 5 — Stretch:** existing-code helper (import/dependency-graph extractor the agent can feed
  in); theming API; VS Code webview preview.

---

## 11. Risks & honest notes

- **Don't collapse into "agent writes Mermaid."** Mermaid is only a fallback export; the value is the
  **typed spec + opinionated, auto-laid-out interactive viewer**. Guard that boundary.
- **Layout quality on large graphs** is the real engineering challenge — budget time for ELK tuning
  (grouping, orthogonal edge routing, label placement, avoiding crossings).
- **Terminal link clickability varies** — default to a localhost URL; keep `file://` as fallback.
- **Scope discipline** — the existing-code extractor (Phase 5) can balloon; keep it optional and let
  the agent read code itself at first.
- **Name availability** — verify `archlens` on npm + GitHub before committing to it.

---

## 12. Success criteria

- An agent can, from a natural-language design discussion, produce a spec and render a diagram a
  developer immediately understands — **without the developer touching a layout tool**.
- The same tool renders an existing repo's architecture from an agent-built spec.
- Diagrams look consistently premium (the taste), open from a clickable CLI link, and update live as
  the design evolves.
- The agent can answer follow-up questions accurately because it holds the returned spec + summary.

---

## 13. Name options

- **Archlens** *(recommended)* — "a clear lens on your architecture"; works for planned + existing.
- **Blueprintr** — leans into planning.
- **Topos** — Greek *tópos* (place/topology); short, techy.
- **Vantage** — a clear viewpoint over a system.
- **Constellate** — nodes connected into constellations; distinctive.

*(Check npm + GitHub availability before finalizing.)*

---

## Appendix A — Taste Conformance (Taste Skill)

**Source of taste:** [`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill), skill
`design-taste-frontend` (v2). Installed via:
```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```
It is the design authority for **all HTML Archlens generates** and for Archlens's own UI.

### A.1 Scope (honest)
Taste Skill is written for **landing pages, portfolios, and redesigns** — explicitly *not* dashboards,
data tables, or dense product UI. An architecture diagram is a specialized visualization, so:
- **We apply its principles** to Archlens's chrome + diagram styling: typography, color discipline,
  spacing/rhythm, dark mode, motion discipline, accessibility, and the anti-slop / em-dash rules.
- **We do not apply** its landing-page-specific rules (hero composition, eyebrows, bento rhythm,
  logo walls, etc.) to the diagram canvas — they don't map to a node/edge graph.

### A.2 The three dials → Archlens render options
Taste Skill's dials become **render parameters** the agent (or a preset) can set:
| Dial | Meaning for Archlens | Default |
|---|---|---|
| `VISUAL_DENSITY` | node/label compactness, spacing, whether to show descriptions | **4** (airy, readable) |
| `MOTION_INTENSITY` | flow-animation + reveal strength (0 = static, honor reduced-motion) | **4** |
| `DESIGN_VARIANCE` | layout expressiveness; kept **low** because diagrams favor clarity over art | **3** |

### A.3 Concrete rules Archlens must satisfy (from Taste Skill)
- **Zero em-dashes** (`—`/`–`) anywhere: node labels, edge labels, the text outline, the summary
  returned to the agent, and all CLI output. Use `-` or restructure. *(Non-negotiable — enforced by a
  lint step in the renderer + a test.)*
- **Color:** neutral base (zinc/slate/stone family) + **one** brand accent; no AI-purple defaults, no
  neon/outer glows, tinted shadows only. Semantic node/edge colors (e.g. a metro line's real color)
  are allowed because they *mean* something — one locked palette per diagram.
- **Type:** self-hosted **Geist** (not Inter); clear hierarchy via weight/size, not raw scale.
- **Icons:** **Phosphor** only, one family, one global stroke weight; never hand-rolled SVG glyphs.
- **Motion:** every animation motivated (the flow animation communicates sequence); animate only
  `transform`/`opacity`; **honor `prefers-reduced-motion`** (collapse to static).
- **Dual theme:** ship light **and** dark; off-black/off-white (no pure `#000`/`#fff`); AA contrast in
  both.
- **Shape + spacing locks:** one corner-radius scale, one spacing scale, applied consistently.
- **No slop tells:** no gratuitous gradients, no fake precision, no decorative status dots, no
  glassmorphism-for-show.

### A.4 Diagram-adapted pre-flight (run before returning a render)
- [ ] Zero em-dashes in any label / outline / summary / CLI text.
- [ ] One accent + semantic mode colors only; no AI-purple/neon glow.
- [ ] Geist loaded (self-hosted); no Inter, no Google-Fonts `<link>`.
- [ ] Phosphor icons only, single stroke weight.
- [ ] Light + dark both render with AA contrast; no pure black/white.
- [ ] Motion motivated and disabled under `prefers-reduced-motion`.
- [ ] One radius scale + one spacing scale throughout.
- [ ] Text-outline fallback present (a11y + agent context).

### A.5 How it's enforced
1. The `skill/` package installs/points to Taste Skill so any agent using Archlens inherits the taste.
2. The `core` renderer implements the tokens/rules above and runs an **em-dash + contrast lint** on
   every render (fails the render if violated).
3. `Vitest` golden tests assert: no `—`/`–` in output, Geist + Phosphor referenced, both themes
   present, and reduced-motion CSS emitted.
