// Theft & tamper intelligence derived from trips.

const inWindow = (h, [from, to]) => (from <= to ? h >= from && h < to : h >= from || h < to);

/**
 * Movement at an hour this car is almost never driven (e.g. 2 AM when the history shows
 * nothing between midnight and 5 AM). Uses a leave-one-out hour histogram so one late trip
 * can't make itself look normal.
 */
export function unusualMovement(trips, { minShare = 0.04, night = [23, 5] } = {}) {
  const hours = new Array(24).fill(0);
  trips.forEach((t) => { hours[new Date(t.start).getHours()] += 1; });
  const out = [];
  for (const t of trips) {
    const h = new Date(t.start).getHours();
    if (!inWindow(h, night)) continue;
    const around = hours[(h + 23) % 24] + hours[h] + hours[(h + 1) % 24] - 1;
    const share = around / Math.max(1, trips.length - 1);
    if (share < minShare) {
      out.push({ type: 'unusual_night', t: t.start, x: t.samples[0].x, y: t.samples[0].y, tripId: t.id, share, detail: `Moved at ${new Date(t.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — only ${Math.round(share * 100)}% of trips start near this hour` });
    }
  }
  return out;
}

/** New-driver rules: max speed and curfew. Returns violations per trip. */
export function driverViolations(trip, rules) {
  if (!rules?.enabled) return [];
  const out = [];
  // One speed violation per trip: peak speed and total time over (runs of 5 s or more).
  let run = null;
  let first = null;
  let peak = 0;
  let overSec = 0;
  for (let i = 0; i <= trip.samples.length; i++) {
    const s = trip.samples[i];
    const over = s && s.v > rules.maxKmh;
    if (over && !run) run = { i };
    if (over) peak = Math.max(peak, s.v);
    if (!over && run) {
      const dur = (trip.samples[i - 1].t - trip.samples[run.i].t) / 1000;
      if (dur >= 5) { overSec += dur; first = first ?? trip.samples[run.i]; }
      run = null;
    }
  }
  if (first) out.push({ type: 'speed', t: first.t, x: first.x, y: first.y, detail: `Up to ${Math.round(peak)} km/h (limit ${rules.maxKmh}) · ${Math.round(overSec)} s over` });
  const curfew = [rules.curfewFrom, rules.curfewTo];
  const bad = trip.samples.find((s) => { const d = new Date(s.t); return inWindow(d.getHours() + d.getMinutes() / 60, curfew); });
  if (bad) out.push({ type: 'curfew', t: bad.t, x: bad.x, y: bad.y, detail: `Driving at ${new Date(bad.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} (curfew ${fmtH(rules.curfewFrom)}–${fmtH(rules.curfewTo)})` });
  return out;
}

const fmtH = (h) => new Date(2000, 0, 1, Math.floor(h), Math.round((h % 1) * 60)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const DEFAULT_DRIVERS = [
  { id: 'arjun', name: 'Arjun', role: 'Owner', key: 'Phone (Bluetooth)', color: 'var(--accent)', rules: { enabled: false, maxKmh: 80, curfewFrom: 22, curfewTo: 5 } },
  { id: 'priya', name: 'Priya', role: 'Family', key: 'Key fob #2', color: 'var(--violet)', rules: { enabled: false, maxKmh: 80, curfewFrom: 22, curfewTo: 5 } },
  { id: 'rohan', name: 'Rohan', role: 'New driver · 19', key: 'RFID tag', color: 'var(--serious)', rules: { enabled: true, maxKmh: 60, curfewFrom: 22, curfewTo: 5, weeklyReport: true } },
];
