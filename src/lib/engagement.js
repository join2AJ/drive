import { describePoint } from '../data/cityModel.js';
import { tripCosts } from './costs.js';

const DAY = 86_400_000;
const HARSH = ['harsh_brake', 'harsh_accel', 'crash'];

// ---------------------------------------------------------------------------
// Hotspots: places where harsh events keep happening.

export function hotspots(trips, { radius = 350, types = ['harsh_brake', 'harsh_accel', 'overspeed'] } = {}) {
  const clusters = [];
  for (const t of trips) {
    for (const e of t.events) {
      if (!types.includes(e.type)) continue;
      let c = clusters.find((k) => Math.hypot(k.x - e.x, k.y - e.y) < radius);
      if (!c) clusters.push((c = { x: e.x, y: e.y, events: [] }));
      c.events.push({ ...e, tripId: t.id });
      c.x = c.events.reduce((a, x) => a + x.x, 0) / c.events.length;
      c.y = c.events.reduce((a, x) => a + x.y, 0) / c.events.length;
    }
  }
  return clusters
    .filter((c) => c.events.length >= 2)
    .map((c) => {
      const byType = {};
      const hours = new Array(24).fill(0);
      c.events.forEach((e) => { byType[e.type] = (byType[e.type] ?? 0) + 1; hours[new Date(e.t).getHours()] += 1; });
      const peak = hours.indexOf(Math.max(...hours));
      return { ...c, name: describePoint(c), count: c.events.length, byType, peakHour: peak, last: Math.max(...c.events.map((e) => e.t)) };
    })
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Streaks and badges.

const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const smoothTrip = (t) => !t.events.some((e) => HARSH.includes(e.type)) && t.score >= 85;

/** Consecutive driving days where every trip was smooth. Days without driving don't break it. */
export function streaks(trips, now = Date.now()) {
  const byDay = new Map();
  trips.forEach((t) => {
    const k = dayStart(t.start);
    byDay.set(k, (byDay.get(k) ?? true) && smoothTrip(t));
  });
  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  let best = 0;
  let run = 0;
  for (const [, ok] of days) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best, days: days.slice(-14).map(([day, ok]) => ({ day, ok })), today: dayStart(now) };
}

export function badges(trips, now = Date.now()) {
  const recent = (d) => trips.filter((t) => t.start >= now - d * DAY);
  let smoothRun = 0;
  let bestSmoothRun = 0;
  trips.forEach((t) => { smoothRun = smoothTrip(t) ? smoothRun + 1 : 0; bestSmoothRun = Math.max(bestSmoothRun, smoothRun); });
  const last7 = recent(7);
  const overspeed7 = last7.some((t) => t.events.some((e) => e.type === 'overspeed'));
  const earlyCommutes = trips.filter((t) => t.from === 'home' && t.to === 'office' && new Date(t.start).getHours() + new Date(t.start).getMinutes() / 60 < 8.75).length;
  const idle7 = last7.reduce((a, t) => a + t.summary.idle, 0) / Math.max(1, last7.reduce((a, t) => a + t.summary.duration, 0));
  const km = trips.reduce((a, t) => a + t.summary.distance, 0) / 1000;
  const night30 = recent(30).filter((t) => { const h = new Date(t.start).getHours(); return h < 5; }).length;
  return [
    { key: 'smooth', title: 'Smooth operator', desc: '10 trips in a row with no harsh braking or launches', earned: bestSmoothRun >= 10, progress: Math.min(1, smoothRun / 10), detail: `${smoothRun} in a row now · best ${bestSmoothRun}` },
    { key: 'speed', title: 'Speed-sane week', desc: '7 days without overspeeding', earned: !overspeed7, progress: overspeed7 ? 0.4 : 1, detail: overspeed7 ? 'Overspeed this week — resets on the next clean 7 days' : 'No overspeeding in 7 days' },
    { key: 'early', title: 'Early bird', desc: 'Beat the rush: 5 commutes leaving before 8:45 AM', earned: earlyCommutes >= 5, progress: Math.min(1, earlyCommutes / 5), detail: `${earlyCommutes} early commutes` },
    { key: 'eco', title: 'Eco idler', desc: 'Keep idling under 12% of drive time for a week', earned: idle7 < 0.12, progress: Math.min(1, 0.12 / Math.max(idle7, 0.01)), detail: `${Math.round(idle7 * 100)}% idling this week` },
    { key: 'km', title: '1,000 km tracked', desc: 'Drive 1,000 km with the tracker', earned: km >= 1000, progress: Math.min(1, km / 1000), detail: `${Math.round(km).toLocaleString('en-IN')} km so far` },
    { key: 'night', title: 'Sleeps at night', desc: 'No driving between midnight and 5 AM for 30 days', earned: night30 === 0, progress: night30 === 0 ? 1 : 0.3, detail: night30 ? `${night30} late-night trip${night30 > 1 ? 's' : ''} this month` : 'All clear' },
  ];
}

// ---------------------------------------------------------------------------
// Safe-driving certificate for an insurer (telematics / pay-how-you-drive).

export function insurerScore(trips, now = Date.now(), days = 90) {
  const ts = trips.filter((t) => t.start >= now - days * DAY);
  const km = ts.reduce((a, t) => a + t.summary.distance, 0) / 1000;
  const dur = ts.reduce((a, t) => a + t.summary.duration, 0);
  const count = (type) => ts.reduce((a, t) => a + t.events.filter((e) => e.type === type).length, 0);
  const per100 = (n) => (km ? (n / km) * 100 : 0);
  const night = ts.reduce((a, t) => a + t.summary.night, 0) / Math.max(1, dur);
  const overSec = ts.reduce((a, t) => a + t.events.filter((e) => e.type === 'overspeed').reduce((b, e) => b + e.durationSec, 0), 0);
  const overPct = overSec / Math.max(1, dur);
  const score = Math.round(Math.max(0, Math.min(100,
    100 - per100(count('harsh_brake')) * 3 - per100(count('harsh_accel')) * 3 - overPct * 150 - night * 30 - count('crash') * 5,
  )));
  const grade = score >= 85 ? 'A' : score >= 75 ? 'B' : score >= 65 ? 'C' : 'D';
  return { score, grade, km, trips: ts.length, days: Math.min(days, Math.ceil((now - (ts[0]?.start ?? now)) / DAY)), harshPer100: per100(count('harsh_brake') + count('harsh_accel')), overPct, night, crashes: count('crash') };
}

// ---------------------------------------------------------------------------
// Weekly report card.

export function weeklyReport(trips, { end = Date.now(), fuel, parkingFees, driver } = {}) {
  const start = end - 7 * DAY;
  const pick = (a, b) => trips.filter((t) => t.start >= a && t.start < b && (!driver || t.driver === driver));
  const wk = pick(start, end);
  const prev = pick(start - 7 * DAY, start);
  const sum = (ts, f) => ts.reduce((a, t) => a + f(t), 0);
  const km = sum(wk, (t) => t.summary.distance) / 1000;
  const costs = wk.map((t) => tripCosts(t, fuel, parkingFees));
  const cost = costs.reduce((a, c) => a + c.cost, 0);
  const tolls = costs.reduce((a, c) => a + c.toll, 0);
  const parking = costs.reduce((a, c) => a + c.parking, 0);
  const score = (ts) => { const d = sum(ts, (t) => t.summary.distance); return d ? Math.round(sum(ts, (t) => t.score * t.summary.distance) / d) : null; };
  const events = wk.flatMap((t) => t.events.filter((e) => e.type !== 'overspeed').map((e) => ({ ...e, place: describePoint(e) })));
  const grouped = {};
  events.forEach((e) => {
    const k = `${e.type}|${e.place}`;
    grouped[k] = grouped[k] ?? { type: e.type, place: e.place, n: 0 };
    grouped[k].n += 1;
  });
  const overspeed = wk.reduce((a, t) => a + t.events.filter((e) => e.type === 'overspeed').length, 0);
  const best = [...wk].sort((a, b) => b.score - a.score || b.summary.distance - a.summary.distance)[0];
  const longest = [...wk].sort((a, b) => b.summary.distance - a.summary.distance)[0];
  const s = score(wk);
  const groups = Object.values(grouped).sort((a, b) => b.n - a.n);
  const label = { harsh_brake: 'harsh brake', harsh_accel: 'hard launch', crash: 'collision' };
  const line = [
    `Drove ${Math.round(km)} km`,
    `₹${Math.round(cost).toLocaleString('en-IN')}`,
    s != null ? `score ${s}` : null,
    ...groups.slice(0, 2).map((g) => `${g.n} ${label[g.type]}${g.n > 1 ? 's' : ''} at ${g.place}`),
  ].filter(Boolean).join(', ');
  return {
    start, end, trips: wk.length, km, cost, tolls, parking, fuel: cost - tolls - parking,
    score: s, prevScore: score(prev), prevKm: sum(prev, (t) => t.summary.distance) / 1000,
    driveSec: sum(wk, (t) => t.summary.duration), groups, overspeed, best, longest, line,
  };
}
