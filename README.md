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
- [ ] Phase 2 — MCP server + local server with live reload
- [ ] Phase 3 — flow animation + exports (SVG / PNG / Mermaid)
- [ ] Phase 4 — skill packaging + docs + CI

## License

MIT
