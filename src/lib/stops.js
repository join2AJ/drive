// Vehicle states and stop reports, derived from 1 Hz samples.
//   running – ignition on and moving (> 2 km/h)
//   idle    – ignition on but stationary for at least `idleMinSec` (signals, traffic, waiting)
//   stopped – ignition off / parked (the gaps between trips)
// A trip is the span between ignition on and ignition off.

const DAY = 86_400_000;
export const STATE_META = {
  running: { label: 'Running', color: 'var(--good)' },
  idle: { label: 'Idle', color: 'var(--warning)' },
  stopped: { label: 'Stopped', color: 'var(--state-stopped)' },
};

/** Splits one trip into running / idle segments. Short standstills (< idleMinSec) count as running. */
export function tripSegments(trip, idleMinSec = 20) {
  const s = trip.samples;
  const out = [];
  let i = 0;
  while (i < s.length) {
    const still = s[i].v <= 2;
    let j = i;
    while (j + 1 < s.length && (s[j + 1].v <= 2) === still) j++;
    const from = s[i].t;
    const to = j + 1 < s.length ? s[j + 1].t : s[j].t;
    const state = still && (to - from) / 1000 >= idleMinSec ? 'idle' : 'running';
    const last = out[out.length - 1];
    if (last && last.state === state) last.to = to;
    else out.push({ state, from, to, x: s[i].x, y: s[i].y, tripId: trip.id });
    i = j + 1;
  }
  return out;
}

/** Full state timeline for [from, to): running / idle inside trips, stopped between them. */
export function stateTimeline(trips, from, to, idleMinSec = 20) {
  const ts = trips.filter((t) => t.end > from && t.start < to).sort((a, b) => a.start - b.start);
  const out = [];
  let cursor = from;
  let lastPos = null;
  const before = trips.filter((t) => t.end <= from).sort((a, b) => b.end - a.end)[0];
  if (before) lastPos = before.samples[before.samples.length - 1];
  for (const t of ts) {
    if (t.start > cursor) out.push({ state: 'stopped', from: cursor, to: t.start, x: lastPos?.x, y: lastPos?.y });
    for (const seg of tripSegments(t, idleMinSec)) {
      const a = Math.max(seg.from, from);
      const b = Math.min(seg.to, to);
      if (b > a) out.push({ ...seg, from: a, to: b });
    }
    cursor = Math.max(cursor, Math.min(t.end, to));
    lastPos = t.samples[t.samples.length - 1];
  }
  if (cursor < to) out.push({ state: 'stopped', from: cursor, to, x: lastPos?.x, y: lastPos?.y, ongoing: true });
  return out;
}

export function stateTotals(timeline) {
  const tot = { running: 0, idle: 0, stopped: 0 };
  timeline.forEach((s) => { tot[s.state] += (s.to - s.from) / 1000; });
  return tot;
}

/**
 * Stop report: parked stops between trips, plus long idling inside trips.
 * Each: { kind: 'parked'|'idle', arrive, leave, sec, x, y, ongoing }
 */
export function stopReport(trips, from, to, { minStopSec = 120, minIdleSec = 180, now = Date.now() } = {}) {
  const ts = [...trips].sort((a, b) => a.start - b.start);
  const out = [];
  for (let k = 0; k < ts.length; k++) {
    const t = ts[k];
    const next = ts[k + 1];
    // Long idling within the trip (engine on, not moving).
    for (const seg of tripSegments(t, minIdleSec)) {
      if (seg.state !== 'idle' || seg.to < from || seg.from >= to) continue;
      out.push({ kind: 'idle', arrive: seg.from, leave: seg.to, sec: (seg.to - seg.from) / 1000, x: seg.x, y: seg.y, tripId: t.id });
    }
    // Parked between this trip and the next.
    const arrive = t.end;
    const leave = next ? next.start : null;
    const end = leave ?? now;
    if (arrive >= to || end <= from) continue;
    const sec = (end - arrive) / 1000;
    if (sec < minStopSec) continue;
    const p = t.samples[t.samples.length - 1];
    out.push({ kind: 'parked', arrive, leave, sec, x: p.x, y: p.y, tripId: t.id, nextTripId: next?.id, ongoing: !next });
  }
  return out.sort((a, b) => a.arrive - b.arrive);
}

export function dayBounds(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return [d.getTime(), d.getTime() + DAY];
}

/** Current state of the live vehicle and how long it's been in it. */
export function liveState(samples, idx, { engineOn = true, idleMinSec = 20 } = {}) {
  if (!engineOn) return { state: 'stopped', sec: 0 };
  const cur = samples[idx];
  const still = cur.v <= 2;
  let j = idx;
  while (j > 0 && (samples[j - 1].v <= 2) === still) j--;
  const sec = (cur.t - samples[j].t) / 1000;
  return { state: still && sec >= idleMinSec ? 'idle' : 'running', sec, waiting: still && sec < idleMinSec };
}
