# Examples

Sample specs and their rendered output. Regenerate any of these with:

```bash
npx archlens render examples/<name>.json --out examples --svg --mermaid
```

## Commute+

A multi-modal transit planner: an Android client, a Ktor backend, routing services
(OpenTripPlanner, GraphHopper), and GTFS/OSM data stores, with a "Plan a trip" flow.

| File | What it is |
|------|------------|
| [`commute-plus.json`](./commute-plus.json) | The input spec (what an agent authors) |
| [`commute-plus.html`](./commute-plus.html) | Self-contained interactive diagram (open in a browser) |
| [`commute-plus.svg`](./commute-plus.svg) | Static vector export |
| [`commute-plus.mmd`](./commute-plus.mmd) | Mermaid flowchart export |

Open the HTML file to pan/zoom, click components, toggle light/dark, play the flow
animation, and download a PNG.
