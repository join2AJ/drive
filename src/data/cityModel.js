import { mulberry32 } from '../lib/rng.js';

// A procedurally generated road network the simulator drives on. Coordinates are metres.
// A real deployment replaces this with map-matched GPS points from the tracker; the UI
// only needs the road polylines for the basemap.

const COLS = 17;
const ROWS = 23;
const SPACING = 540;

export const RING_ROW = 10; // fast arterial ("Outer Ring Road")

function isArterial(i, j) {
  return i % 4 === 0 || j % 5 === 0;
}

function limitFor(kind, i, j) {
  if (kind === 'h' && j === RING_ROW) return 80;
  if (kind === 'v' && i === 16) return 70;
  if (kind === 'h' ? j % 5 === 0 : i % 4 === 0) return 60;
  return 40;
}

function buildCity() {
  const rand = mulberry32(7);
  const nodes = [];
  const id = (i, j) => j * COLS + i;
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const arterialCol = i % 4 === 0;
      const arterialRow = j % 5 === 0;
      const jx = arterialCol ? 30 : 110;
      const jy = arterialRow ? 30 : 110;
      // Gentle curvature so the grid reads as a city rather than graph paper.
      const bendX = Math.sin(j / 3.2) * 90;
      const bendY = Math.sin(i / 2.7) * 70;
      nodes.push({
        id: id(i, j),
        i,
        j,
        x: i * SPACING + bendX + (rand() - 0.5) * jx,
        y: j * SPACING + bendY + (rand() - 0.5) * jy,
      });
    }
  }

  const edges = [];
  const adj = nodes.map(() => []);
  const addEdge = (a, b, kind, arterial, limit, name) => {
    const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    const e = { id: edges.length, a, b, kind, arterial, limit, len, name };
    edges.push(e);
    adj[a].push(e);
    adj[b].push(e);
  };

  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      if (i < COLS - 1) {
        const arterial = j % 5 === 0;
        // Thin out some local streets so the network feels organic (never arterials).
        if (arterial || rand() > 0.14) addEdge(id(i, j), id(i + 1, j), 'h', arterial, limitFor('h', i, j), roadName('h', j));
      }
      if (j < ROWS - 1) {
        const arterial = i % 4 === 0;
        if (arterial || rand() > 0.14) addEdge(id(i, j), id(i, j + 1), 'v', arterial, limitFor('v', i, j), roadName('v', i));
      }
    }
  }

  // Decorative features: a lake, a river and parks.
  const parks = [];
  for (let k = 0; k < 9; k++) {
    const i = 1 + Math.floor(rand() * (COLS - 3));
    const j = 1 + Math.floor(rand() * (ROWS - 3));
    if (isArterial(i, j)) continue;
    const a = nodes[id(i, j)], b = nodes[id(i + 1, j)], c = nodes[id(i + 1, j + 1)], d = nodes[id(i, j + 1)];
    parks.push([a, b, c, d].map((n) => [n.x, n.y]));
  }
  const river = [];
  for (let t = -1; t <= ROWS; t += 0.5) {
    river.push([6.5 * SPACING + Math.sin(t / 2.4) * 900 + t * 120, t * SPACING]);
  }
  const lake = { cx: 13.5 * SPACING, cy: 15.4 * SPACING, rx: 520, ry: 330 };

  const bounds = { minX: -400, minY: -400, maxX: (COLS - 1) * SPACING + 400, maxY: (ROWS - 1) * SPACING + 400 };
  return { nodes, edges, adj, parks, river, lake, bounds, id };
}

const H_NAMES = ['Sankey Rd', 'Bellary Rd', 'Outer Ring Rd', 'Hebbal Main Rd', 'Airport Rd'];
const V_NAMES = ['Tumkur Rd', 'CV Raman Rd', 'Old Madras Rd', 'Hennur Main Rd', 'Thanisandra Rd'];

function roadName(kind, n) {
  if (kind === 'h') return n === RING_ROW ? 'Outer Ring Rd' : n % 5 === 0 ? H_NAMES[(n / 5) % H_NAMES.length] : `${n + 1}th Cross`;
  return n === 16 ? 'Airport Rd' : n % 4 === 0 ? V_NAMES[(n / 4) % V_NAMES.length] : `${n + 1}th Main`;
}

export const city = buildCity();

// Saved places (what the user labelled in the app) plus one spot they visit often but
// never labelled — the frequent-places insight should surface it on its own.
export const PLACE_DEFS = [
  { key: 'home', name: 'Home', icon: 'home', i: 3, j: 17 },
  { key: 'office', name: 'Office', icon: 'briefcase', i: 12, j: 4 },
  { key: 'gym', name: 'Gym', icon: 'dumbbell', i: 5, j: 13 },
  { key: 'mall', name: 'Phoenix Mall', icon: 'shopping', i: 9, j: 8 },
  { key: 'parents', name: "Parents' house", icon: 'heart', i: 15, j: 20 },
  { key: 'school', name: 'School', icon: 'school', i: 1, j: 6 },
  { key: 'airport', name: 'Airport', icon: 'plane', i: 16, j: 0 },
  { key: 'mystery', name: null, icon: 'pin', i: 8, j: 21 },
];

export const places = Object.fromEntries(
  PLACE_DEFS.map((p) => {
    const n = city.nodes[city.id(p.i, p.j)];
    return [p.key, { ...p, node: n.id, x: n.x, y: n.y }];
  }),
);

// Dijkstra on travel time.
export function route(fromNode, toNode) {
  const n = city.nodes.length;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Array(n).fill(null);
  const done = new Uint8Array(n);
  best[fromNode] = 0;
  for (;;) {
    let u = -1;
    let bu = Infinity;
    for (let k = 0; k < n; k++) if (!done[k] && best[k] < bu) { bu = best[k]; u = k; }
    if (u === -1 || u === toNode) break;
    done[u] = 1;
    for (const e of city.adj[u]) {
      const v = e.a === u ? e.b : e.a;
      const w = bu + e.len / (e.limit * (e.arterial ? 1 : 0.8));
      if (w < best[v]) { best[v] = w; prev[v] = { node: u, edge: e }; }
    }
  }
  const path = [];
  let cur = toNode;
  while (cur !== fromNode && prev[cur]) {
    path.push({ node: cur, edge: prev[cur].edge });
    cur = prev[cur].node;
  }
  path.reverse();
  return { nodes: [fromNode, ...path.map((p) => p.node)], edges: path.map((p) => p.edge) };
}

/** Nearest road segment to a point (for road names and speed limits). */
export function roadAt(pt) {
  let best = null;
  let bd = Infinity;
  for (const e of city.edges) {
    const a = city.nodes[e.a];
    const b = city.nodes[e.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(a.x + dx * t - pt.x, a.y + dy * t - pt.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Named junctions so insights can say "Hebbal flyover" instead of coordinates.
const LANDMARK_DEFS = [
  [0, 10, 'Goraguntepalya junction'], [4, 10, 'Hebbal flyover'], [8, 10, 'Nagawara junction'], [12, 10, 'Manyata Tech Park gate'],
  [16, 10, 'KR Puram bridge'], [4, 5, 'Mekhri circle'], [8, 5, 'Kempapura junction'], [12, 5, 'Thanisandra main road'],
  [16, 5, 'Bagalur cross'], [4, 15, 'RT Nagar signal'], [8, 15, 'Kalyan Nagar signal'], [12, 15, 'HRBR layout junction'],
  [16, 15, 'Tin Factory'], [4, 20, 'Sadashivanagar'], [8, 20, 'Frazer Town'], [12, 20, 'Banaswadi ROB'], [0, 5, 'Yeshwanthpur circle'],
  [0, 15, 'Malleshwaram 18th cross'], [4, 13, 'Ganganagar'], [16, 0, 'Kempegowda Airport'],
];
export const landmarks = LANDMARK_DEFS.map(([i, j, name]) => {
  const n = city.nodes[city.id(i, j)];
  return { name, x: n.x, y: n.y };
});

/** Human name for a point: nearest landmark within 450 m, else the road name. */
export function describePoint(pt) {
  let best = null;
  let bd = Infinity;
  for (const l of landmarks) {
    const d = Math.hypot(l.x - pt.x, l.y - pt.y);
    if (d < bd) { bd = d; best = l; }
  }
  if (best && bd < 450) return best.name;
  return roadAt(pt)?.name ?? 'Unknown road';
}

// FASTag toll plazas (fee for a car, single journey).
export const tollPlazas = [
  (() => { const a = city.nodes[city.id(16, 2)]; const b = city.nodes[city.id(16, 3)]; return { name: 'Sadahalli toll plaza (NH-44)', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, fee: 115 }; })(),
];

// Default parking fees charged at saved places (₹ per visit).
export const DEFAULT_PARKING_FEES = { mall: 60, airport: 150 };

/** Closest junction to a point. */
export function nearestNode(pt) {
  let best = 0;
  let bd = Infinity;
  city.nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - pt.x, n.y - pt.y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
