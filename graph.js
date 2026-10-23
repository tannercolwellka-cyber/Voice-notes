// The graph view: every note is a dot, every [[link]] is a line, and dots push apart
// while lines pull together until the web settles. Drawn on a canvas, no libraries.

import { linksIn, findByTitle } from './library.js';

const PALETTE = ['#7aa7ff', '#ff9f43', '#4cd4a0', '#ff6b9a', '#b18cff', '#ffd166', '#4dd0e1', '#e57373',
  '#a3e635', '#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#c084fc', '#fb7185', '#94a3b8'];

// Builds dots and lines from notes. With byArea, notes that share an area are tied together too.
// similar is a list of [id, id] pairs of notes with a lot of words in common.
export function buildGraph(notes, { byArea = false, similar = [] } = {}) {
  const real = notes.filter(n => !n.waiting);
  const nodes = real.map(n => ({ id: n.id, note: n, x: 0, y: 0, vx: 0, vy: 0, degree: 0 }));
  const byId = new Map(nodes.map(d => [d.id, d]));
  const seen = new Set();
  const edges = [];
  const add = (a, b, kind) => {
    if (a === b) return;
    const key = a.id < b.id ? a.id + b.id : b.id + a.id;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b, kind });
    // Only real links make a dot bigger.
    if (kind === 'link') { a.degree++; b.degree++; }
  };
  for (const d of nodes) {
    for (const title of linksIn(d.note.body)) {
      const target = findByTitle(real, title);
      if (target) add(d, byId.get(target.id), 'link');
    }
  }
  if (byArea) {
    // Tie each note to the next one in the same area, so an area forms a loose cluster
    // without drawing a line between every pair.
    const groups = new Map();
    for (const d of nodes) for (const a of d.note.areas || []) {
      if (!groups.has(a)) groups.set(a, []);
      groups.get(a).push(d);
    }
    for (const members of groups.values()) {
      for (let i = 1; i < members.length; i++) add(members[i - 1], members[i], 'area');
    }
  }
  for (const [a, b] of similar) {
    if (byId.has(a) && byId.has(b)) add(byId.get(a), byId.get(b), 'similar');
  }
  // Colors follow each note's first area.
  const areaNames = [...new Set(real.flatMap(n => n.areas || []))].sort();
  const colorOf = new Map(areaNames.map((a, i) => [a, PALETTE[i % PALETTE.length]]));
  for (const d of nodes) {
    d.group = byArea ? (d.note.areas || [])[0] || null : null;
    d.color = colorOf.get((d.note.areas || [])[0]) || '#9a9aa2';
  }
  return { nodes, edges, legend: areaNames.map(a => ({ name: a, color: colorOf.get(a) })) };
}

// Draws the graph on a canvas and handles dragging, zooming and tapping.
// onOpen(note) runs when a dot is tapped. Returns { update(graph), stop() }.
export function mountGraph(canvas, graph, onOpen) {
  const ctx = canvas.getContext('2d');
  let { nodes, edges } = graph;
  let view = { x: 0, y: 0, k: 1 };       // pan and zoom
  let heat = 1;                          // how much the dots still move; 0 = settled
  let hover = null;
  let dragging = null;
  let frame = 0;

  function place() {
    // Start in a spiral so the first frames don't explode. Notes in an area start
    // around that area's own spot on a big ring.
    const groups = [...new Set(nodes.map(d => d.group).filter(Boolean))];
    const ring = 60 * Math.sqrt(nodes.length);
    nodes.forEach((d, i) => {
      if (d.x || d.y) return;
      const g = groups.indexOf(d.group);
      const ox = g < 0 ? 0 : Math.cos(g / groups.length * Math.PI * 2) * ring;
      const oy = g < 0 ? 0 : Math.sin(g / groups.length * Math.PI * 2) * ring;
      const r = 12 * Math.sqrt(i % 40 + 1), t = i * 2.4;
      d.x = ox + Math.cos(t) * r;
      d.y = oy + Math.sin(t) * r;
    });
  }

  const radius = d => 4 + Math.min(10, Math.sqrt(d.degree) * 2.2);

  function step() {
    const n = nodes.length;
    // Every dot pushes the others away.
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist2 = dx * dx + dy * dy || 0.01;
        if (dist2 > 160000) continue;
        const f = 900 / dist2;
        const dist = Math.sqrt(dist2);
        dx /= dist; dy /= dist;
        a.vx -= dx * f; a.vy -= dy * f;
        b.vx += dx * f; b.vy += dy * f;
      }
    }
    // Lines pull their two dots toward a set length.
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const want = e.kind === 'link' ? 55 : 70;
      const f = (dist - want) * 0.02;
      e.a.vx += dx / dist * f; e.a.vy += dy / dist * f;
      e.b.vx -= dx / dist * f; e.b.vy -= dy / dist * f;
    }
    // Notes in the same area drift toward that area's middle, so areas form clusters.
    const centers = new Map();
    for (const d of nodes) if (d.group) {
      const c = centers.get(d.group) || { x: 0, y: 0, n: 0 };
      c.x += d.x; c.y += d.y; c.n++;
      centers.set(d.group, c);
    }
    for (const d of nodes) if (d.group) {
      const c = centers.get(d.group);
      d.vx += (c.x / c.n - d.x) * 0.08;
      d.vy += (c.y / c.n - d.y) * 0.08;
    }
    // A gentle pull to the middle keeps loose notes from drifting away.
    for (const d of nodes) {
      const pull = d.group ? 0.0015 : 0.004;
      d.vx -= d.x * pull;
      d.vy -= d.y * pull;
      if (d === dragging) { d.vx = d.vy = 0; continue; }
      d.x += d.vx * heat;
      d.y += d.vy * heat;
      d.vx *= 0.6;
      d.vy *= 0.6;
    }
    heat = Math.max(0, heat - 0.006);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fit() {
    if (!nodes.length) return;
    const xs = nodes.map(d => d.x), ys = nodes.map(d => d.y);
    const w = Math.max(...xs) - Math.min(...xs) + 80, h = Math.max(...ys) - Math.min(...ys) + 80;
    const r = canvas.getBoundingClientRect();
    view.k = Math.min(2, Math.max(0.2, Math.min(r.width / w, r.height / h)));
    view.x = -(Math.max(...xs) + Math.min(...xs)) / 2 * view.k;
    view.y = -(Math.max(...ys) + Math.min(...ys)) / 2 * view.k;
  }

  const toScreen = d => {
    const r = canvas.getBoundingClientRect();
    return [r.width / 2 + view.x + d.x * view.k, r.height / 2 + view.y + d.y * view.k];
  };

  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    const near = hover ? new Set([hover, ...edges.filter(e => e.a === hover || e.b === hover).flatMap(e => [e.a, e.b])]) : null;

    for (const e of edges) {
      const [x1, y1] = toScreen(e.a), [x2, y2] = toScreen(e.b);
      const lit = near && (e.a === hover || e.b === hover);
      ctx.strokeStyle = lit ? 'rgba(237,237,237,.75)'
        : e.kind === 'link' ? 'rgba(255,255,255,.28)'
        : e.kind === 'area' ? 'rgba(255,255,255,.3)' : 'rgba(122,167,255,.5)';
      ctx.lineWidth = lit ? 1.6 : e.kind === 'link' ? 1 : 1.3;
      ctx.setLineDash(e.kind === 'area' ? [4, 4] : e.kind === 'similar' ? [2, 3] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const d of nodes) {
      const [x, y] = toScreen(d);
      const faded = near && !near.has(d);
      ctx.globalAlpha = faded ? 0.18 : 1;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, radius(d) * Math.sqrt(view.k), 0, Math.PI * 2);
      ctx.fill();
      if (d === hover) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Names show when zoomed in, for well-linked notes, and for whatever is under your finger.
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (const d of nodes) {
      const show = d === hover || (near && near.has(d)) || view.k > 1.3 || (d.degree >= 3 && view.k > 0.7);
      if (!show || (near && !near.has(d))) continue;
      const [x, y] = toScreen(d);
      const label = d.note.title.length > 32 ? d.note.title.slice(0, 30) + '…' : d.note.title;
      ctx.globalAlpha = d === hover ? 1 : 0.8;
      ctx.fillStyle = '#ededed';
      ctx.fillText(label, x, y + radius(d) * Math.sqrt(view.k) + 14);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    if (heat > 0) step();
    draw();
    frame = requestAnimationFrame(loop);
  }

  function nodeAt(px, py) {
    let best = null, bestD = Infinity;
    for (const d of nodes) {
      const [x, y] = toScreen(d);
      const dist = Math.hypot(x - px, y - py);
      if (dist < Math.max(14, radius(d) * Math.sqrt(view.k) + 6) && dist < bestD) { best = d; bestD = dist; }
    }
    return best;
  }

  // ---- pointer: drag a dot, drag the background to pan, pinch or scroll to zoom, tap to open ----
  const pointers = new Map();
  let downAt = null, moved = false, pinch = null;

  const local = e => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k };
      dragging = null;
      return;
    }
    const [px, py] = local(e);
    downAt = [px, py, view.x, view.y];
    moved = false;
    dragging = nodeAt(px, py);
    hover = dragging;
  });

  canvas.addEventListener('pointermove', e => {
    const [px, py] = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [px, py]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      view.k = Math.min(4, Math.max(0.15, pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.dist));
      return;
    }
    if (!downAt) {
      hover = nodeAt(px, py);
      canvas.style.cursor = hover ? 'pointer' : 'grab';
      return;
    }
    if (Math.hypot(px - downAt[0], py - downAt[1]) > 4) moved = true;
    if (dragging) {
      const r = canvas.getBoundingClientRect();
      dragging.x = (px - r.width / 2 - view.x) / view.k;
      dragging.y = (py - r.height / 2 - view.y) / view.k;
      heat = Math.max(heat, 0.3);
    } else {
      view.x = downAt[2] + px - downAt[0];
      view.y = downAt[3] + py - downAt[1];
    }
  });

  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!downAt) return;
    if (!moved && dragging) onOpen(dragging.note);
    if (e.pointerType !== 'mouse') hover = null;
    downAt = null;
    dragging = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!downAt) hover = null; });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [px, py] = local(e);
    const r = canvas.getBoundingClientRect();
    const k = Math.min(4, Math.max(0.15, view.k * Math.exp(-e.deltaY * 0.0015)));
    // Zoom toward the mouse.
    const cx = px - r.width / 2, cy = py - r.height / 2;
    view.x = cx - (cx - view.x) * k / view.k;
    view.y = cy - (cy - view.y) * k / view.k;
    view.k = k;
  }, { passive: false });

  const onResize = () => resize();
  addEventListener('resize', onResize);

  resize();
  place();
  // Let it settle a bit before the first frame, then frame everything.
  for (let i = 0; i < 120; i++) step();
  fit();
  loop();

  return {
    update(next) {
      // Keep positions of notes that were already on screen.
      const old = new Map(nodes.map(d => [d.id, d]));
      const regroup = next.nodes.some(d => (old.get(d.id)?.group ?? null) !== d.group);
      for (const d of next.nodes) {
        const o = old.get(d.id);
        if (o && !regroup) { d.x = o.x; d.y = o.y; }
      }
      nodes = next.nodes;
      edges = next.edges;
      place();
      heat = regroup ? 1 : 0.6;
      if (regroup) { for (let i = 0; i < 120; i++) step(); fit(); }
    },
    fit,
    stop() {
      cancelAnimationFrame(frame);
      removeEventListener('resize', onResize);
    },
  };
}
