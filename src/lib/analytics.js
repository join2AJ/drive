import { dist } from './geo.js';

// All insight logic runs on plain 1 Hz tracker samples ({t, x, y, v, limit}), so it works the
// same for recorded history, the live stream, or a real tracker's API once wired in.

export const DEFAULT_THRESHOLDS = {
  crashFromKmh: 60, // must be travelling at least this fast…
  crashToKmh: 10, // …and be (almost) stopped…
  crashWindowSec: 2, // …within this many seconds. e.g. 80 → 4 km/h in 2 s ≈ 1.1 g
  harshBrakeMs2: 3.5, // ≈ 0.36 g
  harshAccelMs2: 3.0, // ≈ 0.31 g
  overspeedKmh: 80,
  overspeedMinSec: 10,
};

const G = 9.81;

/** Detects crash, harsh braking, harsh acceleration and overspeed events in a sample stream. */
export function detectEvents(samples, th = DEFAULT_THRESHOLDS) {
  const events = [];
  const n = samples.length;
  let skipUntil = -1;

  // 1. Probable collisions: large speed collapse inside a short window.
  for (let i = 1; i < n; i++) {
    if (i <= skipUntil || samples[i].v > th.crashToKmh) continue;
    for (let j = i - 1; j >= 0; j--) {
      const dt = (samples[i].t - samples[j].t) / 1000;
      if (dt > th.crashWindowSec) break;
      if (samples[j].v >= th.crashFromKmh) {
        const dv = (samples[j].v - samples[i].v) / 3.6;
        // Confidence rises if the vehicle stays stopped afterwards (no drive-away).
        let stillFor = 0;
        for (let k = i + 1; k < n && samples[k].v < 3; k++) stillFor = (samples[k].t - samples[i].t) / 1000;
        const gforce = dv / dt / G;
        events.push({
          type: 'crash',
          i,
          startI: j,
          t: samples[i].t,
          x: samples[i].x,
          y: samples[i].y,
          fromKmh: samples[j].v,
          toKmh: samples[i].v,
          durationSec: dt,
          gforce,
          stationarySec: stillFor,
          confidence: Math.min(0.99, 0.55 + Math.min(0.25, (gforce - 0.8) * 0.5) + Math.min(0.19, stillFor / 600)),
        });
        skipUntil = i + 30;
        break;
      }
    }
  }
  const inCrash = (i) => events.some((e) => e.type === 'crash' && i >= e.startI - 1 && i <= e.i + 1);

  // 2. Harsh braking / acceleration: per-second change in speed, merged into episodes.
  let episode = null;
  const flush = () => {
    if (episode) {
      const s = samples[episode.peakI];
      events.push({
        type: episode.type,
        i: episode.peakI,
        t: s.t,
        x: s.x,
        y: s.y,
        fromKmh: samples[episode.startI].v,
        toKmh: samples[episode.endI].v,
        gforce: episode.peak / G,
        durationSec: (samples[episode.endI].t - samples[episode.startI].t) / 1000,
      });
    }
    episode = null;
  };
  for (let i = 1; i < n; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000 || 1;
    const a = (samples[i].v - samples[i - 1].v) / 3.6 / dt;
    const type = a <= -th.harshBrakeMs2 ? 'harsh_brake' : a >= th.harshAccelMs2 ? 'harsh_accel' : null;
    if (type && !inCrash(i)) {
      if (episode && episode.type === type) {
        episode.endI = i;
        if (Math.abs(a) > episode.peak) { episode.peak = Math.abs(a); episode.peakI = i; }
      } else {
        flush();
        episode = { type, startI: i - 1, endI: i, peak: Math.abs(a), peakI: i };
      }
    } else flush();
  }
  flush();

  // 3. Overspeed: sustained travel above the user's limit.
  let run = null;
  for (let i = 0; i <= n; i++) {
    const over = i < n && samples[i].v > th.overspeedKmh;
    if (over) {
      if (!run) run = { startI: i, maxI: i };
      if (samples[i].v > samples[run.maxI].v) run.maxI = i;
    } else if (run) {
      const dur = (samples[i - 1].t - samples[run.startI].t) / 1000;
      if (dur >= th.overspeedMinSec) {
        const s = samples[run.maxI];
        events.push({ type: 'overspeed', i: run.maxI, startI: run.startI, endI: i - 1, t: s.t, x: s.x, y: s.y, maxKmh: s.v, durationSec: dur });
      }
      run = null;
    }
  }

  return events.sort((a, b) => a.t - b.t);
}

export function summarizeTrip(samples) {
  let distance = 0;
  let moving = 0;
  let idle = 0;
  let maxV = 0;
  let night = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = (b.t - a.t) / 1000;
    distance += dist(a, b);
    if (b.v > 2) moving += dt;
    else idle += dt;
    if (b.v > maxV) maxV = b.v;
    const h = new Date(b.t).getHours();
    if (h >= 22 || h < 5) night += dt;
  }
  const duration = (samples[samples.length - 1].t - samples[0].t) / 1000;
  return { distance, duration, moving, idle, maxV, avgV: moving ? (distance / moving) * 3.6 : 0, night };
}

const PENALTY = { crash: 40, harsh_brake: 6, harsh_accel: 4, overspeed: 5 };

/** 0–100 safety score: penalties per event, normalised by distance so long trips aren't punished. */
export function safetyScore(events, distanceM) {
  const km = Math.max(distanceM / 1000, 3);
  const raw = events.reduce((p, e) => p + (PENALTY[e.type] ?? 0), 0);
  return Math.max(0, Math.round(100 - (raw * 10) / Math.sqrt(km * 10)));
}

export function analyzeTrip(trip, th) {
  const events = detectEvents(trip.samples, th);
  const summary = summarizeTrip(trip.samples);
  return { ...trip, events, summary, score: safetyScore(events, summary.distance) };
}

// ---------------------------------------------------------------------------
// Fleet-level insights across many trips.

/** Clusters trip end points (where the car was parked) into frequently visited places. */
export function frequentPlaces(trips, savedPlaces, radius = 300) {
  const clusters = [];
  trips.forEach((trip, idx) => {
    const last = trip.samples[trip.samples.length - 1];
    const next = trips[idx + 1];
    const dwell = next ? (next.start - last.t) / 1000 : null;
    let c = clusters.find((k) => Math.hypot(k.x - last.x, k.y - last.y) < radius);
    if (!c) {
      c = { x: last.x, y: last.y, visits: [], sumX: 0, sumY: 0 };
      clusters.push(c);
    }
    c.visits.push({ t: last.t, dwell });
    c.sumX += last.x;
    c.sumY += last.y;
    c.x = c.sumX / c.visits.length;
    c.y = c.sumY / c.visits.length;
  });

  return clusters
    .map((c) => {
      const saved = savedPlaces.find((p) => Math.hypot(p.x - c.x, p.y - c.y) < radius);
      const dwells = c.visits.map((v) => v.dwell).filter((d) => d != null && d < 20 * 3600);
      const hours = c.visits.map((v) => {
        const d = new Date(v.t);
        return d.getHours() + d.getMinutes() / 60;
      });
      const dows = new Array(7).fill(0);
      c.visits.forEach((v) => dows[new Date(v.t).getDay()]++);
      const topDow = dows.indexOf(Math.max(...dows));
      return {
        key: saved?.key ?? `c${Math.round(c.x)}_${Math.round(c.y)}`,
        name: saved?.name ?? null,
        icon: saved?.icon ?? 'pin',
        x: c.x,
        y: c.y,
        visits: c.visits.length,
        lastVisit: Math.max(...c.visits.map((v) => v.t)),
        avgDwellSec: dwells.length ? dwells.reduce((a, b) => a + b, 0) / dwells.length : 0,
        typicalArrival: median(hours),
        topDow,
        topDowShare: dows[topDow] / c.visits.length,
      };
    })
    .filter((p) => p.visits >= 2)
    .sort((a, b) => b.visits - a.visits);
}

export function frequentRoutes(trips, placesList) {
  const nameOf = (s) => {
    const p = placesList.find((pl) => Math.hypot(pl.x - s.x, pl.y - s.y) < 300);
    return p ? p.name ?? 'Unlabeled place' : null;
  };
  const map = new Map();
  for (const t of trips) {
    const a = nameOf(t.samples[0]);
    const b = nameOf(t.samples[t.samples.length - 1]);
    if (!a || !b || a === b) continue;
    const key = `${a} → ${b}`;
    const r = map.get(key) ?? { key, from: a, to: b, count: 0, durations: [], distance: 0 };
    r.count++;
    r.durations.push(t.summary.duration);
    r.distance = t.summary.distance;
    map.set(key, r);
  }
  return [...map.values()]
    .map((r) => ({ ...r, median: median(r.durations), best: Math.min(...r.durations), worst: Math.max(...r.durations) }))
    .sort((a, b) => b.count - a.count);
}

/** Minutes spent in each speed band, across all trips. */
export function speedDistribution(trips, band = 10, max = 120) {
  const bins = Array.from({ length: max / band + 1 }, (_, k) => ({ from: k * band, to: k === max / band ? null : (k + 1) * band, sec: 0 }));
  for (const t of trips) {
    for (let i = 1; i < t.samples.length; i++) {
      const v = t.samples[i].v;
      if (v < 2) continue;
      const k = Math.min(bins.length - 1, Math.floor(v / band));
      bins[k].sec += (t.samples[i].t - t.samples[i - 1].t) / 1000;
    }
  }
  return bins;
}

/** Driving minutes by weekday (0 = Sun) × hour. */
export function timeOfDayMatrix(trips) {
  const m = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const t of trips) {
    for (let i = 1; i < t.samples.length; i += 1) {
      const d = new Date(t.samples[i].t);
      m[d.getDay()][d.getHours()] += (t.samples[i].t - t.samples[i - 1].t) / 60_000;
    }
  }
  return m;
}

export function dailyTotals(trips, days, now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const out = [];
  for (let d = days - 1; d >= 0; d--) {
    const start = today.getTime() - d * 86_400_000;
    const end = start + 86_400_000;
    const ts = trips.filter((t) => t.start >= start && t.start < end);
    out.push({
      day: start,
      distance: ts.reduce((a, t) => a + t.summary.distance, 0),
      duration: ts.reduce((a, t) => a + t.summary.duration, 0),
      trips: ts.length,
    });
  }
  return out;
}

// Geofence entry/exit lives with the fence shapes (circle, drive-time, polygon).
export { geofenceTransitions } from './geofence.js';

export function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
