import { city, places, route } from './cityModel.js';
import { mulberry32, range } from '../lib/rng.js';

// Physics-lite driving simulator. Emits 1 Hz samples like a wired GPS tracker would:
// { t (ms epoch), x, y (metres), v (km/h), limit (km/h) }.
// Speed follows road limits, slows for turns, stops at some signals and can be
// scripted to brake hard, launch hard or crash so the analytics have real signal.

const KMH = 3.6;
const COMFORT_BRAKE = 2.0; // m/s², used to plan stops
const MAX_NORMAL_BRAKE = 2.9; // m/s², stays under the harsh-braking threshold

function buildPolyline(path) {
  const pts = path.nodes.map((n) => city.nodes[n]);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  return { pts, cum, total: cum[cum.length - 1] };
}

function pointAt(poly, s) {
  const { pts, cum } = poly;
  if (s <= 0) return { x: pts[0].x, y: pts[0].y, seg: 0 };
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo] || 1;
  const f = Math.min(1, (s - cum[lo]) / segLen);
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * f, y: pts[lo].y + (pts[hi].y - pts[lo].y) * f, seg: lo };
}

function buildConstraints(path, poly, rand) {
  const cons = [];
  for (let k = 1; k < poly.pts.length - 1; k++) {
    const a = poly.pts[k - 1], b = poly.pts[k], c = poly.pts[k + 1];
    const h1 = Math.atan2(b.y - a.y, b.x - a.x);
    const h2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = Math.abs(h2 - h1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const bothArterial = path.edges[k - 1].arterial && path.edges[k].arterial;
    const crossesArterial = city.adj[b.id].some((e) => e.arterial);
    if (crossesArterial && rand() < (bothArterial ? 0.2 : 0.12)) {
      cons.push({ d: poly.cum[k], v: 0, dwell: Math.round(range(rand, 10, 55)) });
    } else if (turn > 0.8) {
      cons.push({ d: poly.cum[k], v: range(rand, 18, 26) / KMH });
    }
  }
  cons.push({ d: poly.total, v: 0, dwell: 0, final: true });
  return cons;
}

/**
 * @param {object} o
 * @param {{nodes:number[], edges:object[]}} o.path
 * @param {number} o.start epoch ms
 * @param {number} o.seed
 * @param {number} [o.speedFactor] driver aggressiveness vs posted limit
 * @param {Array<{type:'harsh_brake'|'harsh_accel'|'crash', at:number}>} [o.inject] `at` is fraction of route
 */
export function simulateDrive({ path, start, seed, speedFactor = 1, inject = [], v0 = 0 }) {
  const rand = mulberry32(seed);
  const poly = buildPolyline(path);
  const cons = buildConstraints(path, poly, rand);
  const samples = [];
  const deviceEvents = [];
  const pending = inject.map((e) => ({ ...e, fired: false }));

  let s = 0;
  let v = v0 / KMH;
  let t = start;
  let ci = 0;
  let dwell = 0;
  let forced = null; // { decel:[m/s per step...], idx }
  let launchBoost = 0;
  let wander = 0;
  let crashed = false;
  const accel = range(rand, 1.4, 2.1);

  const push = () => {
    const p = pointAt(poly, s);
    const edge = path.edges[Math.min(p.seg, path.edges.length - 1)];
    const noise = v > 0.3 ? (rand() - 0.5) * 1.4 : 0;
    samples.push({ t, x: p.x, y: p.y, v: Math.max(0, v * KMH + noise), limit: edge ? edge.limit : 40 });
  };

  // Arrive: pull up gently at the kerb rather than teleporting to 0 km/h.
  const finish = () => {
    s = poly.total;
    push();
    while (v > 0) {
      t += 1000;
      v = Math.max(0, v - 2.4);
      push();
    }
    return { samples, deviceEvents, distance: poly.total };
  };

  push();
  for (let guard = 0; guard < 20_000; guard++) {
    t += 1000;
    const p = pointAt(poly, s);
    const edge = path.edges[Math.min(p.seg, path.edges.length - 1)];
    wander = Math.max(-0.08, Math.min(0.08, wander + (rand() - 0.5) * 0.03));
    const target = ((edge ? edge.limit : 40) * (speedFactor + wander)) / KMH;

    // Scripted events.
    for (const ev of pending) {
      if (ev.fired || forced || s < ev.at * poly.total) continue;
      if (ev.type === 'harsh_brake' && v * KMH > 45) {
        const d = range(rand, 4.6, 5.8);
        forced = { steps: [d, d * 0.9], idx: 0 };
        ev.fired = true;
        deviceEvents.push({ type: 'harsh_brake', t, gforce: +(d / 9.81).toFixed(2) });
      } else if (ev.type === 'crash' && v * KMH >= 78) {
        const v0 = v;
        const mid = v0 * 0.49;
        const end = 1.1;
        forced = { steps: [v0 - mid, mid - end, end], idx: 0, crash: true };
        ev.fired = true;
        deviceEvents.push({ type: 'crash', t: t + 2000, gforce: +((v0 - end) / 2 / 9.81).toFixed(2) });
      } else if (ev.type === 'harsh_accel' && dwell > 0) {
        launchBoost = 3;
        ev.fired = true;
        deviceEvents.push({ type: 'harsh_accel', t: t + dwell * 1000, gforce: 0.37 });
      }
    }

    if (forced) {
      v = Math.max(0, v - forced.steps[forced.idx]);
      forced.idx += 1;
      if (forced.idx >= forced.steps.length) {
        if (forced.crash) crashed = true;
        forced = null;
      }
    } else if (crashed) {
      v = 0;
    } else if (dwell > 0) {
      v = 0;
      dwell -= 1;
    } else {
      // Plan against upcoming constraints.
      let allowed = Infinity;
      for (let k = ci; k < cons.length && cons[k].d - s < 400; k++) {
        const d = Math.max(0, cons[k].d - s - 1);
        allowed = Math.min(allowed, Math.sqrt(cons[k].v ** 2 + 2 * COMFORT_BRAKE * d));
      }
      const desired = Math.min(target, allowed);
      if (v < desired) {
        const a = launchBoost > 0 ? 3.7 : accel * (0.75 + rand() * 0.3) * (v < 8 ? 1.15 : 0.8);
        if (launchBoost > 0) launchBoost -= 1;
        v = Math.min(desired, v + a);
      } else {
        v = Math.max(desired, v - MAX_NORMAL_BRAKE);
      }
    }

    s += v;
    // Pass / stop at constraints.
    while (ci < cons.length) {
      const c = cons[ci];
      if (c.v === 0 && c.d - s < 2.5 && v < 2.6 && !crashed) {
        // Roll the last metre or two this second; the stop itself shows from the next sample.
        s = Math.max(s, c.d - 0.5);
        dwell = c.dwell;
        ci += 1;
        if (c.final) return finish();
      } else if (s >= c.d) {
        ci += 1;
        if (c.final) return finish();
      } else break;
    }
    push();
    // After a crash the unit keeps reporting a stationary vehicle for a few minutes.
    if (crashed && samples.length && t - deviceEvents[deviceEvents.length - 1].t > 6 * 60_000) break;
  }
  return { samples, deviceEvents, distance: s };
}

// ---------------------------------------------------------------------------
// History generator: ~6 weeks of realistic commutes, errands and weekend trips.

const DAY = 86_400_000;

// Who drives: Arjun (owner) commutes; Priya does school runs and Sundays; Rohan (19, new
// driver) takes the car on Saturdays and some Friday nights.
function legsForDay(dow, dayIndex, rand) {
  const L = [];
  const jitter = (h, spread) => h + (rand() - 0.5) * spread;
  const R = { driver: 'rohan' };
  const P = { driver: 'priya' };
  if (dow >= 1 && dow <= 5) {
    if (dow === 2 || dow === 4) {
      L.push(['home', 'school', jitter(7.75, 0.3), null, P]);
      L.push(['school', 'office', null, 8, P]);
    } else {
      L.push(['home', 'office', jitter(8.7, 0.7)]);
    }
    if (rand() < 0.18) {
      L.push(['office', 'mall', jitter(13.1, 0.4)]);
      L.push(['mall', 'office', null, 55]);
    }
    L.push(['office', 'home', jitter(18.5, 1.1)]);
    if ((dow === 1 || dow === 3) && rand() < 0.8) {
      L.push(['home', 'gym', jitter(20.0, 0.5)]);
      L.push(['gym', 'home', null, 70]);
    }
    if (dow === 5 && rand() < 0.6) {
      // Friday night out — back after the 10 PM curfew.
      L.push(['home', 'mall', jitter(21.6, 0.3), null, R]);
      L.push(['mall', 'home', null, 85 + rand() * 30, R]);
    }
  } else if (dow === 6) {
    L.push(['home', 'mystery', jitter(7.1, 0.4), null, R]);
    L.push(['mystery', 'home', null, 95, R]);
    if (rand() < 0.75) {
      L.push(['home', 'mall', jitter(17.2, 1.0)]);
      L.push(['mall', 'home', null, 150]);
    }
  } else {
    L.push(['home', 'parents', jitter(11.0, 1.0), null, P]);
    L.push(['parents', 'home', null, 300 + rand() * 60, P]);
  }
  if (dayIndex === 33) {
    // 2 AM drive: unusual for this car, and outside the new driver's curfew.
    L.unshift(['home', 'mall', 1.9, null, R], ['mall', 'home', null, 25, R]);
  }
  if (dayIndex === 19) {
    // A late-night airport run with a heavier right foot.
    L.push(['home', 'airport', 23.2, null, { speedFactor: 1.22 }]);
  }
  if (dayIndex === 18) {
    L.unshift(['airport', 'home', 0.4, null, { speedFactor: 1.18 }]);
  }
  return L;
}

let tripSeq = 0;

export function generateHistory(now = Date.now(), days = 42) {
  const rand = mulberry32(2024);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const trips = [];
  let lastArrival = 0;

  for (let d = days - 1; d >= 0; d--) {
    const dayStart = today.getTime() - d * DAY;
    const dow = new Date(dayStart).getDay();
    const dayIndex = days - 1 - d;
    const crashDay = d === 3;
    const legs = legsForDay(dow, dayIndex, rand);
    if (crashDay) {
      // The day of the incident: an evening run to the airport along the Outer Ring Road.
      legs.length = 0;
      legs.push(['home', 'mall', 16.4]);
      legs.push(['mall', 'airport', null, 40, { crash: true, speedFactor: 1.1 }]);
    }

    for (const [from, to, hour, afterMin, opts = {}] of legs) {
      let start = Math.round(hour != null ? dayStart + hour * 3_600_000 : lastArrival + (afterMin ?? 30) * 60_000);
      start = Math.max(start, lastArrival + 8 * 60_000);
      if (start > now - 30 * 60_000) continue;
      const path = route(places[from].node, places[to].node);
      if (!path.edges.length) continue;
      const aggressive = rand() < 0.14;
      // Rush hour on weekdays slows everything down (8:45–10:00, 17:45–19:30).
      const h = new Date(start).getHours() + new Date(start).getMinutes() / 60;
      const rush = dow >= 1 && dow <= 5 && ((h >= 8.75 && h < 10) || (h >= 17.75 && h < 19.5));
      const traffic = rush ? range(rand, 0.68, 0.8) : 1;
      const driver = opts.driver ?? 'arjun';
      const young = driver === 'rohan';
      const base = aggressive || (young && rand() < 0.5) ? range(rand, 1.12, 1.22) : range(rand, 0.92, 1.06);
      const speedFactor = opts.speedFactor ?? base * traffic;
      const inject = [];
      if (opts.crash) inject.push({ type: 'crash', at: 0.35 });
      else {
        // Commutes cross the Hebbal flyover, where a queue regularly forces hard stops.
        const commute = (from === 'home' && to === 'office') || (from === 'office' && to === 'home');
        if (commute && rand() < 0.3) inject.push({ type: 'harsh_brake', at: from === 'home' ? 0.31 : 0.63 });
        else if (rand() < (young ? 0.3 : 0.1)) inject.push({ type: 'harsh_brake', at: range(rand, 0.2, 0.8) });
        if (rand() < (young ? 0.25 : 0.07)) inject.push({ type: 'harsh_accel', at: range(rand, 0.1, 0.6) });
      }
      const sim = simulateDrive({ path, start, seed: Math.floor(rand() * 1e9), speedFactor, inject });
      const end = sim.samples[sim.samples.length - 1].t;
      lastArrival = end;
      trips.push({
        id: `T${String(++tripSeq).padStart(4, '0')}`,
        driver,
        from: crashDay && opts.crash ? 'mall' : from,
        to: opts.crash ? null : to,
        start,
        end,
        samples: sim.samples,
        deviceEvents: sim.deviceEvents,
        pathNodes: path.nodes,
      });
    }
  }
  return trips;
}

// A live trip in progress: Office -> Home, started a few minutes ago.
export function generateLiveTrip(now = Date.now()) {
  const path = route(places.office.node, places.home.node);
  const sim = simulateDrive({ path, start: now - 5 * 60_000, seed: 99, speedFactor: 1.02 });
  return { path, ...sim };
}
