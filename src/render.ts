import type { Layout, Point } from "./layout.js";
import type { NormalizedSpec, NodeType } from "./schema.js";
import { iconSvg } from "./icons.js";
import { themeCss, NODE_HUE, FONT_STACK } from "./theme.js";
import { textOutline } from "./outline.js";
import { sanitizeText, assertNoBannedDashes } from "./lint.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The point halfway along a polyline by arc length. Using the geometric middle
 * (not the middle vertex) keeps edge labels centered even for 2-point edges,
 * where the middle vertex would otherwise be the endpoint.
 */
export function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  let target = total / 2;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (seg >= target) {
      const t = seg === 0 ? 0 : target / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    target -= seg;
  }
  return points[points.length - 1];
}

/** Deep copy of the spec with all user-facing text sanitized (removes banned dashes). */
function sanitizeSpec(spec: NormalizedSpec): NormalizedSpec {
  return {
    meta: { ...spec.meta, title: sanitizeText(spec.meta.title) },
    nodes: spec.nodes.map((n) => ({
      ...n,
      label: sanitizeText(n.label),
      tech: n.tech ? sanitizeText(n.tech) : undefined,
      description: n.description ? sanitizeText(n.description) : undefined,
    })),
    groups: spec.groups.map((g) => ({ ...g, label: sanitizeText(g.label) })),
    edges: spec.edges.map((e) => ({ ...e, label: e.label ? sanitizeText(e.label) : undefined })),
    flows: spec.flows.map((f) => ({ ...f, name: sanitizeText(f.name) })),
  };
}

/* ------------------------------------------------------------------ *
 * Phase 0 static SVG (kept for simple SVG export; taste export in P3) *
 * ------------------------------------------------------------------ */
export function renderSvg(layout: Layout, spec: NormalizedSpec): string {
  const margin = 8;
  const w = Math.ceil(layout.width + margin * 2);
  const h = Math.ceil(layout.height + margin * 2);
  const groups = layout.groups
    .map(
      (g) =>
        `<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="14" fill="#f4f5f7" stroke="#d7dae0"/>` +
        `<text x="${g.x + 16}" y="${g.y + 22}" font-size="12" font-weight="600" fill="#5a5f6a" font-family="${FONT_STACK}">${esc(sanitizeText(g.label))}</text>`
    )
    .join("");
  const edges = layout.edges
    .map((e) => {
      if (e.points.length < 2) return "";
      const pts = e.points.map((p) => `${p.x},${p.y}`).join(" ");
      const dash = e.style === "dashed" ? ` stroke-dasharray="6 5"` : "";
      return `<polyline points="${pts}" fill="none" stroke="#9aa0aa" stroke-width="1.6" marker-end="url(#arrow)"${dash}/>`;
    })
    .join("");
  const nodes = layout.nodes
    .map(
      (n) =>
        `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="12" fill="#ffffff" stroke="#cfd3da"/>` +
        `<text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + 5}" text-anchor="middle" font-size="14" font-weight="500" fill="#1f2430" font-family="${FONT_STACK}">${esc(sanitizeText(n.label))}</text>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(sanitizeText(spec.meta.title))} architecture"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa0aa"/></marker></defs><rect width="${w}" height="${h}" fill="#ffffff"/><g transform="translate(${margin},${margin})">${groups}${edges}${nodes}</g></svg>`;
}

/* ------------------------------------------------------------------ *
 * Interactive diagram SVG (styled by page CSS via classes)           *
 * ------------------------------------------------------------------ */
function renderDiagramSvg(layout: Layout, spec: NormalizedSpec): string {
  const labelById = new Map(spec.nodes.map((n) => [n.id, n]));

  const groups = layout.groups
    .map(
      (g) =>
        `<g class="group"><rect class="group-box" x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="14"/>` +
        `<text class="group-label" x="${g.x + 16}" y="${g.y + 22}">${esc(g.label)}</text></g>`
    )
    .join("\n");

  const edges = layout.edges
    .map((e, i) => {
      if (e.points.length < 2) return "";
      const pts = e.points.map((p) => `${p.x},${p.y}`).join(" ");
      const cls = e.style === "dashed" ? "edge edge-dashed" : "edge";
      const mid = polylineMidpoint(e.points);
      const label = e.label
        ? `<text class="edge-label" x="${mid.x.toFixed(1)}" y="${(mid.y - 5).toFixed(1)}" text-anchor="middle">${esc(e.label)}</text>`
        : "";
      return `<g class="edge-g" data-edge="${i}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"><polyline class="${cls}" points="${pts}" marker-end="url(#al-arrow)"/>${label}</g>`;
    })
    .join("\n");

  const nodes = layout.nodes
    .map((n) => {
      const node = labelById.get(n.id)!;
      const hue = NODE_HUE[n.type as NodeType];
      const cy = n.y + n.height / 2;
      const iconX = n.x + 14;
      const iconY = cy - 10;
      const textX = n.x + 44;
      let labels: string;
      if (node.tech) {
        labels =
          `<text class="node-label" x="${textX}" y="${cy - 3}">${esc(n.label)}</text>` +
          `<text class="node-tech" x="${textX}" y="${cy + 13}">${esc(node.tech)}</text>`;
      } else {
        labels = `<text class="node-label" x="${textX}" y="${cy + 5}">${esc(n.label)}</text>`;
      }
      return (
        `<g class="node" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.label)}">` +
        `<rect class="node-box" x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="12"/>` +
        `<g class="node-ic" style="color:${hue}" transform="translate(${iconX},${iconY})">${iconSvg(n.type as NodeType)}</g>` +
        `${labels}</g>`
      );
    })
    .join("\n");

  const margin = 12;
  const w = Math.ceil(layout.width + margin * 2);
  const h = Math.ceil(layout.height + margin * 2);

  return `<svg id="al-canvas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(spec.meta.title)} architecture diagram">
  <defs>
    <marker id="al-arrow" class="al-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z"/>
    </marker>
  </defs>
  <g id="al-viewport" transform="translate(${margin},${margin})">
${groups}
${edges}
${nodes}
  </g>
</svg>`;
}

function componentCss(): string {
  return `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--text); font-family: var(--font); }
#al-app { display: flex; flex-direction: column; height: 100vh; }
header.al-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
  background: var(--surface); min-height: 56px;
}
.al-title { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
.al-spacer { flex: 1; }
.al-btn {
  appearance: none; border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text); border-radius: var(--radius-sm); height: 34px; min-width: 34px;
  padding: 0 10px; font-family: var(--font); font-size: 13px; cursor: pointer;
}
.al-btn:hover { border-color: var(--border-strong); }
.al-btn:active { transform: translateY(1px); }
main.al-main { position: relative; flex: 1; overflow: hidden; }
#al-canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
#al-canvas.grabbing { cursor: grabbing; }

.group-box { fill: var(--surface-2); stroke: var(--border); stroke-width: 1; }
.group-label { fill: var(--text-dim); font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
.node-box { fill: var(--surface); stroke: var(--border); stroke-width: 1.2px; }
.node:hover .node-box, .node:focus .node-box { stroke: var(--accent); outline: none; }
.node.selected .node-box { stroke: var(--accent); stroke-width: 2px; }
.node { cursor: pointer; }
.node-label { fill: var(--text); font-size: 14px; font-weight: 500; }
.node-tech { fill: var(--text-dim); font-size: 11px; font-family: var(--mono); }
.node-ic { }
.edge { fill: none; stroke: var(--edge); stroke-width: 1.6px; }
.edge-dashed { stroke-dasharray: 6 5; }
.edge-label { fill: var(--text-dim); font-size: 11px; paint-order: stroke; stroke: var(--edge-label-bg); stroke-width: 3px; }
.al-arrow path { fill: var(--edge); }
.node.dim, .edge-g.dim { opacity: 0.18; }
.edge-g.flow-active .edge { stroke: var(--accent); stroke-width: 2.6px; }
.node.flow-node .node-box { stroke: var(--accent); stroke-width: 2px; }
.flow-dot { fill: var(--accent); stroke: var(--surface); stroke-width: 1.5px; }
.flow-dot.pulse { animation: al-pulse 1.4s ease-in-out infinite; }
@keyframes al-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

.al-flow { display: inline-flex; align-items: center; gap: 8px; }
select.al-select {
  appearance: none; border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text); border-radius: var(--radius-sm); height: 34px; padding: 0 10px;
  font-family: var(--font); font-size: 13px; cursor: pointer;
}
select.al-select:hover { border-color: var(--border-strong); }

aside.al-detail {
  position: absolute; top: 12px; right: 12px; width: 280px; max-width: calc(100% - 24px);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px; display: none; box-shadow: 0 8px 30px rgba(0,0,0,0.10);
}
aside.al-detail.open { display: block; }
.al-detail h2 { margin: 0 0 4px; font-size: 15px; }
.al-detail .al-type { color: var(--text-dim); font-size: 12px; text-transform: capitalize; }
.al-detail .al-tech { font-family: var(--mono); font-size: 12px; color: var(--accent); margin-top: 6px; }
.al-detail p { font-size: 13px; color: var(--text); line-height: 1.5; margin: 10px 0 0; }
.al-detail ul { margin: 8px 0 0; padding-left: 16px; font-size: 12px; color: var(--text-dim); }
.al-detail .al-close { position: absolute; top: 10px; right: 10px; }

.al-legend { display: flex; flex-wrap: wrap; gap: 10px 16px; padding: 8px 16px; border-top: 1px solid var(--border); background: var(--surface); }
.al-legend span { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); }
.al-legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

details.al-outline { padding: 8px 16px 16px; border-top: 1px solid var(--border); background: var(--surface); }
details.al-outline summary { cursor: pointer; font-size: 13px; color: var(--text-dim); }
details.al-outline pre { font-family: var(--mono); font-size: 12px; color: var(--text); white-space: pre-wrap; margin: 10px 0 0; }

@media (prefers-reduced-motion: no-preference) {
  .al-btn, .node-box, .edge-g, .node { transition: opacity 0.2s ease, stroke 0.15s ease, transform 0.05s ease; }
}
@media (prefers-reduced-motion: reduce) {
  .flow-dot.pulse { animation: none; }
}
`.trim();
}

function viewerScript(): string {
  // Vanilla JS: pan/zoom, node selection + detail panel, connection highlighting, theme toggle.
  return `
(function () {
  var spec = JSON.parse(document.getElementById("arch-spec").textContent);
  var nodeById = {}; spec.nodes.forEach(function (n) { nodeById[n.id] = n; });
  var svg = document.getElementById("al-canvas");
  var vp = document.getElementById("al-viewport");
  var state = { x: 0, y: 0, k: 1 };
  var base = { x: 0, y: 0 };
  // capture base translate from initial transform
  var m = /translate\\(([-0-9.]+),([-0-9.]+)\\)/.exec(vp.getAttribute("transform") || "");
  if (m) { base.x = parseFloat(m[1]); base.y = parseFloat(m[2]); }
  function apply() {
    vp.setAttribute("transform", "translate(" + (base.x + state.x) + "," + (base.y + state.y) + ") scale(" + state.k + ")");
  }
  // fit to view
  function fit() {
    var vb = svg.viewBox.baseVal; var r = svg.getBoundingClientRect();
    if (!vb.width || !r.width) return;
    var k = Math.min(r.width / vb.width, r.height / vb.height) * 0.94;
    state.k = k > 0 ? k : 1;
    state.x = (r.width - vb.width * state.k) / 2;
    state.y = (r.height - vb.height * state.k) / 2;
    // base was in svg user units; recompute using no base for fit
    base.x = 0; base.y = 0; apply();
  }
  // pan
  var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  svg.addEventListener("mousedown", function (e) {
    if (e.target.closest(".node")) return;
    dragging = true; sx = e.clientX; sy = e.clientY; ox = state.x; oy = state.y;
    svg.classList.add("grabbing");
  });
  window.addEventListener("mousemove", function (e) {
    if (!dragging) return; state.x = ox + (e.clientX - sx); state.y = oy + (e.clientY - sy); apply();
  });
  window.addEventListener("mouseup", function () { dragging = false; svg.classList.remove("grabbing"); });
  // zoom
  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    var r = svg.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    var nk = Math.max(0.15, Math.min(4, state.k * factor));
    // zoom toward cursor
    state.x = mx - (mx - state.x) * (nk / state.k);
    state.y = my - (my - state.y) * (nk / state.k);
    state.k = nk; apply();
  }, { passive: false });
  function zoom(f) { var nk = Math.max(0.15, Math.min(4, state.k * f)); var r = svg.getBoundingClientRect(); var cx = r.width/2, cy = r.height/2; state.x = cx - (cx - state.x) * (nk/state.k); state.y = cy - (cy - state.y) * (nk/state.k); state.k = nk; apply(); }
  document.getElementById("al-zin").addEventListener("click", function(){ zoom(1.2); });
  document.getElementById("al-zout").addEventListener("click", function(){ zoom(1/1.2); });
  document.getElementById("al-reset").addEventListener("click", fit);

  // selection + detail
  var detail = document.getElementById("al-detail");
  function connectionsFor(id) {
    var outs = spec.edges.filter(function(e){return e.from===id;}).map(function(e){ return (nodeById[e.to]?nodeById[e.to].label:e.to) + (e.label?" ("+e.label+")":""); });
    var ins = spec.edges.filter(function(e){return e.to===id;}).map(function(e){ return (nodeById[e.from]?nodeById[e.from].label:e.from) + (e.label?" ("+e.label+")":""); });
    return { outs: outs, ins: ins };
  }
  function select(id) {
    var all = svg.querySelectorAll(".node");
    all.forEach(function(g){ g.classList.toggle("selected", g.getAttribute("data-id")===id); });
    var n = nodeById[id]; if (!n) return;
    var c = connectionsFor(id);
    var html = '<button class="al-btn al-close" id="al-close" aria-label="Close">x</button>';
    html += '<h2></h2><div class="al-type"></div>';
    detail.innerHTML = html;
    detail.querySelector("h2").textContent = n.label;
    detail.querySelector(".al-type").textContent = n.type;
    if (n.tech) { var t = document.createElement("div"); t.className="al-tech"; t.textContent = n.tech; detail.appendChild(t); }
    if (n.description) { var p = document.createElement("p"); p.textContent = n.description; detail.appendChild(p); }
    if (c.outs.length || c.ins.length) {
      var ul = document.createElement("ul");
      c.outs.forEach(function(x){ var li=document.createElement("li"); li.textContent = "to " + x; ul.appendChild(li); });
      c.ins.forEach(function(x){ var li=document.createElement("li"); li.textContent = "from " + x; ul.appendChild(li); });
      detail.appendChild(ul);
    }
    detail.classList.add("open");
    document.getElementById("al-close").addEventListener("click", clearSel);
  }
  function clearSel() {
    svg.querySelectorAll(".node").forEach(function(g){ g.classList.remove("selected"); });
    detail.classList.remove("open");
  }
  svg.querySelectorAll(".node").forEach(function(g){
    g.addEventListener("click", function(){ select(g.getAttribute("data-id")); });
    g.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); select(g.getAttribute("data-id")); } });
  });

  // theme toggle
  var tbtn = document.getElementById("al-theme");
  tbtn.addEventListener("click", function(){
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    tbtn.textContent = next === "dark" ? "Light" : "Dark";
  });

  // ---- flow animation ----
  var geo = (function(){ var el = document.getElementById("arch-geo"); return el ? JSON.parse(el.textContent) : { nodes:{}, edges:[], flows:[] }; })();
  var edgeMap = {}; geo.edges.forEach(function(e){ edgeMap[e.from + ">" + e.to] = e.points; });
  var flowSel = document.getElementById("al-flow");
  var playBtn = document.getElementById("al-play");
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var anim = null, dot = null;

  function clearFlow() {
    if (anim) { cancelAnimationFrame(anim); anim = null; }
    if (dot) { dot.remove(); dot = null; }
    svg.querySelectorAll(".edge-g").forEach(function(g){ g.classList.remove("flow-active","dim"); });
    svg.querySelectorAll(".node").forEach(function(g){ g.classList.remove("flow-node","dim"); });
  }
  function flowPath(flow) {
    var pts = [];
    function push(p){ if(pts.length){ var l=pts[pts.length-1]; if(l[0]===p[0]&&l[1]===p[1]) return; } pts.push(p); }
    for (var i=0;i<flow.steps.length-1;i++){
      var a=flow.steps[i], b=flow.steps[i+1];
      var seg=edgeMap[a+">"+b], rev=false;
      if(!seg){ seg=edgeMap[b+">"+a]; rev=!!seg; }
      if(seg){ var s=seg.slice(); if(rev) s=s.slice().reverse(); s.forEach(push); }
      else { var na=geo.nodes[a], nb=geo.nodes[b]; if(na) push([na.cx,na.cy]); if(nb) push([nb.cx,nb.cy]); }
    }
    return pts;
  }
  function highlightFlow(flow) {
    var edgeSet={}, nodeSet={};
    for(var i=0;i<flow.steps.length-1;i++){ var a=flow.steps[i],b=flow.steps[i+1]; edgeSet[a+">"+b]=1; edgeSet[b+">"+a]=1; }
    flow.steps.forEach(function(s){ nodeSet[s]=1; });
    svg.querySelectorAll(".edge-g").forEach(function(g){
      var key=g.getAttribute("data-from")+">"+g.getAttribute("data-to");
      if(edgeSet[key]){ g.classList.add("flow-active"); g.classList.remove("dim"); }
      else { g.classList.add("dim"); g.classList.remove("flow-active"); }
    });
    svg.querySelectorAll(".node").forEach(function(g){
      if(nodeSet[g.getAttribute("data-id")]){ g.classList.add("flow-node"); g.classList.remove("dim"); }
      else { g.classList.add("dim"); g.classList.remove("flow-node"); }
    });
  }
  function animateFlow(flow) {
    var pts=flowPath(flow); if(pts.length<2) return;
    var seglen=[], total=0;
    for(var i=1;i<pts.length;i++){ var dx=pts[i][0]-pts[i-1][0], dy=pts[i][1]-pts[i-1][1]; var d=Math.sqrt(dx*dx+dy*dy); seglen.push(d); total+=d; }
    dot=document.createElementNS("http://www.w3.org/2000/svg","circle");
    dot.setAttribute("class","flow-dot"+(reduce?" pulse":"")); dot.setAttribute("r","6");
    vp.appendChild(dot);
    function at(dist){ if(dist<=0) return pts[0]; var acc=0; for(var i=0;i<seglen.length;i++){ if(acc+seglen[i]>=dist){ var t=(dist-acc)/(seglen[i]||1); return [pts[i][0]+(pts[i+1][0]-pts[i][0])*t, pts[i][1]+(pts[i+1][1]-pts[i][1])*t]; } acc+=seglen[i]; } return pts[pts.length-1]; }
    if(reduce){ var mid=at(total/2); dot.setAttribute("cx",mid[0]); dot.setAttribute("cy",mid[1]); return; }
    var dur=Math.max(1400,total*3), start=null;
    function frame(ts){ if(start===null)start=ts; var el=(ts-start)%dur; var p=at((el/dur)*total); dot.setAttribute("cx",p[0]); dot.setAttribute("cy",p[1]); anim=requestAnimationFrame(frame); }
    anim=requestAnimationFrame(frame);
  }
  function playFlow(idx){ clearFlow(); var flow=geo.flows[idx]; if(!flow) return; highlightFlow(flow); animateFlow(flow); }
  if (flowSel) {
    flowSel.addEventListener("change", function(){ var v=flowSel.value; if(v==="") clearFlow(); else playFlow(parseInt(v,10)); });
    playBtn.addEventListener("click", function(){ var v=flowSel.value; if(v===""&&geo.flows.length){ flowSel.value="0"; v="0"; } if(v!=="") playFlow(parseInt(v,10)); });
  }

  // ---- PNG export (client-side, self-contained) ----
  var pngBtn=document.getElementById("al-png");
  if(pngBtn) pngBtn.addEventListener("click", exportPng);
  function exportPng(){
    var vb=svg.viewBox.baseVal;
    var clone=svg.cloneNode(true);
    clone.setAttribute("width",vb.width); clone.setAttribute("height",vb.height); clone.removeAttribute("style");
    var vpc=clone.querySelector("#al-viewport"); if(vpc) vpc.setAttribute("transform","translate(12,12)");
    var srcAll=svg.querySelectorAll("*"), dstAll=clone.querySelectorAll("*");
    var props=["fill","stroke","stroke-width","stroke-dasharray","stroke-linecap","stroke-linejoin","font-size","font-weight","font-family","color","opacity","text-anchor"];
    for(var i=0;i<srcAll.length;i++){ var cs=getComputedStyle(srcAll[i]); var s=""; for(var j=0;j<props.length;j++){ var v=cs.getPropertyValue(props[j]); if(v) s+=props[j]+":"+v+";"; } dstAll[i].setAttribute("style",s); }
    var bg=getComputedStyle(document.body).backgroundColor||"#ffffff";
    var rect=document.createElementNS("http://www.w3.org/2000/svg","rect");
    rect.setAttribute("x","0"); rect.setAttribute("y","0"); rect.setAttribute("width",vb.width); rect.setAttribute("height",vb.height); rect.setAttribute("fill",bg);
    clone.insertBefore(rect,clone.firstChild);
    var xml=new XMLSerializer().serializeToString(clone);
    var url=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml;charset=utf-8"}));
    var img=new Image();
    img.onload=function(){ var scale=2, canvas=document.createElement("canvas"); canvas.width=vb.width*scale; canvas.height=vb.height*scale; var ctx=canvas.getContext("2d"); ctx.scale(scale,scale); ctx.drawImage(img,0,0); URL.revokeObjectURL(url); canvas.toBlob(function(blob){ if(!blob) return; var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=(document.title||"diagram").replace(/[^a-z0-9]+/gi,"-").replace(/^-+|-+$/g,"").toLowerCase()+".png"; a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); },1000); }); };
    img.onerror=function(){ URL.revokeObjectURL(url); };
    img.src=url;
  }

  window.addEventListener("resize", fit);
  fit();
})();
`.trim();
}

export interface HtmlOptions {
  /** Include the live-reload client (served mode only). Default false (standalone file). */
  liveReload?: boolean;
}

/** Render a full, self-contained interactive HTML page for the diagram. */
export function renderHtml(
  layoutInput: Layout,
  specInput: NormalizedSpec,
  opts: HtmlOptions = {}
): string {
  const spec = sanitizeSpec(specInput);
  const layout = sanitizeLayout(layoutInput);
  const diagram = renderDiagramSvg(layout, spec);
  const outline = textOutline(spec);
  const specJson = JSON.stringify(spec).replace(/<\//g, "<\\/");
  const title = esc(spec.meta.title);

  const legend = spec.meta.legend
    ? `<div class="al-legend">${usedTypes(spec)
        .map(
          (t) =>
            `<span><i style="background:${NODE_HUE[t]}"></i>${t}</span>`
        )
        .join("")}</div>`
    : "";

  const initialTheme =
    spec.meta.theme === "light" ? "light" : spec.meta.theme === "dark" ? "dark" : "";

  const reload = opts.liveReload
    ? `<script>(function(){try{var es=new EventSource("/__reload");es.onmessage=function(){location.reload();};}catch(e){}})();</script>`
    : "";

  // Geometry the viewer needs to animate flows (node centers + edge polylines).
  const geo = {
    nodes: Object.fromEntries(
      layout.nodes.map((n) => [n.id, { cx: n.x + n.width / 2, cy: n.y + n.height / 2 }])
    ),
    edges: layout.edges.map((e) => ({
      from: e.from,
      to: e.to,
      points: e.points.map((p) => [Math.round(p.x), Math.round(p.y)]),
    })),
    flows: spec.flows.map((f) => ({ name: f.name, steps: f.steps })),
  };
  const geoJson = JSON.stringify(geo).replace(/<\//g, "<\\/");

  const flowControls =
    spec.flows.length > 0
      ? `<span class="al-flow">
      <label class="al-title" for="al-flow" style="font-weight:500">Flow</label>
      <select class="al-select" id="al-flow" aria-label="Select a flow to animate">
        <option value="">None</option>
        ${spec.flows.map((f, i) => `<option value="${i}">${esc(f.name)}</option>`).join("")}
      </select>
      <button class="al-btn" id="al-play" aria-label="Play flow">Play</button>
    </span>`
      : "";

  const html = `<!doctype html>
<html lang="en"${initialTheme ? ` data-theme="${initialTheme}"` : ""}>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} - Archlens</title>
<style>
${themeCss()}
${componentCss()}
</style>
</head>
<body>
<div id="al-app">
  <header class="al-bar">
    <span class="al-title">${title}</span>
    <span class="al-spacer"></span>
    ${flowControls}
    <button class="al-btn" id="al-zout" aria-label="Zoom out">-</button>
    <button class="al-btn" id="al-reset" aria-label="Fit to view">Fit</button>
    <button class="al-btn" id="al-zin" aria-label="Zoom in">+</button>
    <button class="al-btn" id="al-png" aria-label="Download PNG">PNG</button>
    <button class="al-btn" id="al-theme" aria-label="Toggle theme">Theme</button>
  </header>
  <main class="al-main">
    ${diagram}
    <aside class="al-detail" id="al-detail" aria-live="polite"></aside>
  </main>
  ${legend}
  <details class="al-outline">
    <summary>Text outline (accessible view)</summary>
    <pre>${esc(outline)}</pre>
  </details>
</div>
<script id="arch-spec" type="application/json">${specJson}</script>
<script id="arch-geo" type="application/json">${geoJson}</script>
<script>
${viewerScript()}
</script>
${reload}
</body>
</html>`;

  // Final taste guard: zero banned dashes anywhere in the output.
  assertNoBannedDashes(html);
  return html;
}

function usedTypes(spec: NormalizedSpec): NodeType[] {
  const seen = new Set<NodeType>();
  const order: NodeType[] = [];
  for (const n of spec.nodes) {
    const t = n.type as NodeType;
    if (!seen.has(t)) {
      seen.add(t);
      order.push(t);
    }
  }
  return order;
}

function sanitizeLayout(layout: Layout): Layout {
  return {
    ...layout,
    nodes: layout.nodes.map((n) => ({
      ...n,
      label: sanitizeText(n.label),
      tech: n.tech ? sanitizeText(n.tech) : undefined,
      description: n.description ? sanitizeText(n.description) : undefined,
    })),
    groups: layout.groups.map((g) => ({ ...g, label: sanitizeText(g.label) })),
    edges: layout.edges.map((e) => ({ ...e, label: e.label ? sanitizeText(e.label) : undefined })),
  };
}
