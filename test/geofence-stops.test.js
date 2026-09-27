import { describe, expect, it } from 'vitest';
import { pointInPolygon, insideFence, driveZone, geofenceTransitions } from '../src/lib/geofence.js';
import { tripSegments, stateTimeline, stateTotals, stopReport, liveState } from '../src/lib/stops.js';
import { generateHistory } from '../src/data/simulator.js';
import { analyzeTrip } from '../src/lib/analytics.js';
import { places, city } from '../src/data/cityModel.js';

const NOW = new Date(2026, 8, 27, 18, 0).getTime();
const DAY = 86_400_000;
const trips = generateHistory(NOW).map((t) => analyzeTrip(t));
const home = places.home;

describe('geofence shapes', () => {
  it('circle uses straight-line distance', () => {
    const f = { type: 'circle', x: 0, y: 0, radius: 500 };
    expect(insideFence(f, { x: 300, y: 300 })).toBe(true);
    expect(insideFence(f, { x: 400, y: 400 })).toBe(false);
  });

  it('polygon uses the drawn shape', () => {
    const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
    const L = { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 200 }, { x: 0, y: 200 }] };
    expect(insideFence(L, { x: 25, y: 150 })).toBe(true);
    expect(insideFence(L, { x: 150, y: 150 })).toBe(false); // the notch of the L
  });

  it('drive-time zone grows with minutes and shrinks in traffic', () => {
    const z10 = driveZone(home, 10, 'normal');
    const z30 = driveZone(home, 30, 'normal');
    const rush = driveZone(home, 30, 'heavy');
    expect(z30.roadKm).toBeGreaterThan(z10.roadKm);
    expect(z30.reachKm).toBeGreaterThan(z10.reachKm);
    expect(rush.roadKm).toBeLessThan(z30.roadKm);
  });

  it('drive-time zone follows roads, not air distance', () => {
    // Every road point inside the zone is actually reachable: the zone is never a full circle.
    const z = driveZone(home, 15, 'normal');
    const f = { type: 'drive', x: home.x, y: home.y, minutes: 15, traffic: 'normal' };
    expect(insideFence(f, home)).toBe(true);
    // Sample the junctions within the zone's air radius: some are outside (slow to reach).
    const inAir = city.nodes.filter((n) => Math.hypot(n.x - home.x, n.y - home.y) < z.reachKm * 1000);
    const inside = inAir.filter((n) => insideFence(f, n));
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.length).toBeLessThan(inAir.length);
    // A point far off any road is outside even if it is close by air.
    expect(insideFence(f, { x: home.x + 270, y: home.y + 270 })).toBe(false);
  });

  it('raises enter/exit events for each shape and respects alert settings', () => {
    const week = trips.filter((t) => t.start > NOW - 7 * DAY);
    const f = { id: 'z', name: '20 min', type: 'drive', x: home.x, y: home.y, minutes: 10, traffic: 'normal', enabled: true };
    const ev = geofenceTransitions(week, [f]);
    expect(ev.some((e) => e.type === 'geofence_exit')).toBe(true);
    expect(ev.some((e) => e.type === 'geofence_enter')).toBe(true);
    const exitsOnly = geofenceTransitions(week, [{ ...f, alertEnter: false }]);
    expect(exitsOnly.every((e) => e.type === 'geofence_exit')).toBe(true);
  });
});

describe('vehicle states & stop report', () => {
  const stream = (speeds, t0 = 0) => ({ id: 'T', samples: speeds.map((v, i) => ({ t: t0 + i * 1000, x: i, y: 0, v })), start: t0, end: t0 + (speeds.length - 1) * 1000 });

  it('splits a trip into running and idle, ignoring short stops', () => {
    const t = stream([30, 30, 0, 0, 0, 30, 30, ...Array(40).fill(0), 30, 30]);
    const segs = tripSegments(t, 20);
    expect(segs.map((s) => s.state)).toEqual(['running', 'idle', 'running']);
    expect((segs[1].to - segs[1].from) / 1000).toBe(40);
  });

  it('accounts for every second of the day', () => {
    const [from, to] = [new Date(2026, 8, 25).getTime(), new Date(2026, 8, 26).getTime()];
    const tl = stateTimeline(trips, from, to);
    const tot = stateTotals(tl);
    expect(Math.round(tot.running + tot.idle + tot.stopped)).toBe(86_400);
    expect(tot.running).toBeGreaterThan(0);
    expect(tl[0].from).toBe(from);
    expect(tl[tl.length - 1].to).toBe(to);
  });

  it('lists parked stops between trips and long idling inside them', () => {
    const [from, to] = [NOW - 7 * DAY, NOW];
    const r = stopReport(trips, from, to, { minStopSec: 120, minIdleSec: 180, now: NOW });
    const parked = r.filter((s) => s.kind === 'parked');
    expect(parked.length).toBeGreaterThan(10);
    parked.forEach((s) => expect(s.sec).toBeGreaterThanOrEqual(120));
    // The collision left the car stationary with the engine on for ~6 min.
    expect(r.some((s) => s.kind === 'idle' && s.sec >= 300)).toBe(true);
  });

  it('reports the live state with its duration', () => {
    const samples = [30, 30, 0, 0, 0, 0].map((v, i) => ({ t: i * 1000, v }));
    expect(liveState(samples, 5, { idleMinSec: 3 })).toMatchObject({ state: 'idle', sec: 3 });
    expect(liveState(samples, 1).state).toBe('running');
    expect(liveState(samples, 5, { engineOn: false }).state).toBe('stopped');
  });
});
