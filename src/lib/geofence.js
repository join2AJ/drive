import { city } from '../data/cityModel.js';

// Geofences come in three shapes:
//   circle  – { x, y, radius }                       straight-line distance
//   drive   – { x, y, minutes, traffic }             everywhere reachable by road in N minutes
//   polygon – { points: [{x,y}, ...] }               drawn by hand on the map

// Speed as a share of the posted limit, plus time lost at each junction (signals, turns).
// Tuned so "normal" averages ~20 km/h across town, typical for Bengaluru.
export const TRAFFIC = {
  light: { label: 'Light (night)', factor: 0.75, junctionSec: 8 },
  normal: { label: 'Normal', factor: 0.45, junctionSec: 22 },
  heavy: { label: 'Rush hour', factor: 0.28, junctionSec: 45 },
};

const BUFFER_M = 120; // how far off a reachable road still counts as "inside" a drive zone
const CELL = 300; // spatial index cell size (m)

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}

function nearestNode(pt) {
  let best = 0;
  let bd = Infinity;
  city.nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - pt.x, n.y - pt.y);
    if (d < bd) { bd = d; best = i; }
  });
  return { node: best, dist: bd };
}

const zoneCache = new Map();

/**
 * Drive-time zone (isochrone) on the road network: Dijkstra from the nearest junction using
 * each road's speed limit scaled by traffic, then the part of every road reachable in time.
 */
export function driveZone(center, minutes, traffic = 'normal') {
  const key = `${Math.round(center.x)}|${Math.round(center.y)}|${minutes}|${traffic}`;
  if (zoneCache.has(key)) return zoneCache.get(key);

  const { factor, junctionSec } = TRAFFIC[traffic] ?? TRAFFIC.normal;
  const speed = (e) => (e.limit * factor) / 3.6; // m/s
  const budget = minutes * 60;
  const start = nearestNode(center);
  const n = city.nodes.length;
  const t = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  // Getting from the pin to the first junction takes time too (at a slow 15 km/h).
  t[start.node] = start.dist / (15 / 3.6);
  for (;;) {
    let u = -1;
    let bu = Infinity;
    for (let k = 0; k < n; k++) if (!done[k] && t[k] < bu) { bu = t[k]; u = k; }
    if (u === -1 || bu > budget) break;
    done[u] = 1;
    for (const e of city.adj[u]) {
      const v = e.a === u ? e.b : e.a;
      const w = bu + e.len / speed(e) + junctionSec;
      if (w < t[v]) t[v] = w;
    }
  }

  const segments = [];
  let reachKm = 0;
  let roadKm = 0;
  for (const e of city.edges) {
    const A = city.nodes[e.a];
    const B = city.nodes[e.b];
    const ta = t[e.a];
    const tb = t[e.b];
    if (ta > budget && tb > budget) continue;
    const sp = speed(e);
    const fromA = ta <= budget ? Math.min(e.len, (budget - ta) * sp) : 0;
    const fromB = tb <= budget ? Math.min(e.len, (budget - tb) * sp) : 0;
    const lerp = (f) => ({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f });
    if (fromA + fromB >= e.len) {
      segments.push({ a: { x: A.x, y: A.y }, b: { x: B.x, y: B.y }, arterial: e.arterial });
      roadKm += e.len / 1000;
    } else {
      if (fromA > 0) { segments.push({ a: { x: A.x, y: A.y }, b: lerp(fromA / e.len), arterial: e.arterial }); roadKm += fromA / 1000; }
      if (fromB > 0) { segments.push({ a: lerp(1 - fromB / e.len), b: { x: B.x, y: B.y }, arterial: e.arterial }); roadKm += fromB / 1000; }
    }
  }
  for (const s of segments) {
    for (const p of [s.a, s.b]) reachKm = Math.max(reachKm, Math.hypot(p.x - center.x, p.y - center.y) / 1000);
  }

  // Spatial index for fast membership checks.
  const grid = new Map();
  segments.forEach((s, i) => {
    const x0 = Math.floor((Math.min(s.a.x, s.b.x) - BUFFER_M) / CELL);
    const x1 = Math.floor((Math.max(s.a.x, s.b.x) + BUFFER_M) / CELL);
    const y0 = Math.floor((Math.min(s.a.y, s.b.y) - BUFFER_M) / CELL);
    const y1 = Math.floor((Math.max(s.a.y, s.b.y) + BUFFER_M) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const k = `${gx},${gy}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  });

  const zone = { segments, grid, reachKm, roadKm, minutes, traffic, hull: convexHull(segments.flatMap((s) => [s.a, s.b])) };
  zoneCache.set(key, zone);
  return zone;
}

function insideDriveZone(zone, p) {
  const ids = zone.grid.get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`);
  if (!ids) return false;
  return ids.some((i) => distToSegment(p, zone.segments[i].a, zone.segments[i].b) <= BUFFER_M);
}

export function insideFence(f, p) {
  if (f.type === 'polygon') return f.points?.length >= 3 && pointInPolygon(p, f.points);
  if (f.type === 'drive') return insideDriveZone(driveZone(f, f.minutes, f.traffic), p);
  return Math.hypot(p.x - f.x, p.y - f.y) < f.radius;
}

/** Straight-line size of a fence, for the list ("~2 km across"). */
export function fenceSummary(f) {
  if (f.type === 'drive') {
    const z = driveZone(f, f.minutes, f.traffic);
    return `${f.minutes} min drive · reaches ${z.reachKm.toFixed(1)} km away · ${Math.round(z.roadKm)} km of roads`;
  }
  if (f.type === 'polygon') {
    const pts = f.points ?? [];
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    return `Drawn · ${pts.length} points · ${(Math.abs(area) / 2 / 1e6).toFixed(2)} km²`;
  }
  return `Circle · ${f.radius >= 1000 ? `${(f.radius / 1000).toFixed(1)} km` : `${f.radius} m`} radius`;
}

export function fenceBounds(f) {
  const pts = f.type === 'polygon' ? f.points : f.type === 'drive' ? driveZone(f, f.minutes, f.traffic).hull : [
    { x: f.x - f.radius, y: f.y - f.radius }, { x: f.x + f.radius, y: f.y + f.radius },
  ];
  if (!pts?.length) return { minX: f.x - 500, maxX: f.x + 500, minY: f.y - 500, maxY: f.y + 500 };
  return {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
  };
}

function convexHull(points) {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Enter/exit events for any fence shape. */
export function geofenceTransitions(trips, fences) {
  const out = [];
  for (const f of fences) {
    if (!f.enabled) continue;
    for (const t of trips) {
      let inside = insideFence(f, t.samples[0]);
      for (let i = 2; i < t.samples.length; i += 3) {
        const s = t.samples[i];
        const now = insideFence(f, s);
        if (now !== inside) {
          if ((now && f.alertEnter !== false) || (!now && f.alertExit !== false)) {
            out.push({ type: now ? 'geofence_enter' : 'geofence_exit', fence: f.name, fenceId: f.id, fenceType: f.type ?? 'circle', t: s.t, x: s.x, y: s.y, tripId: t.id });
          }
          inside = now;
        }
      }
    }
  }
  return out;
}
