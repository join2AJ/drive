import { describe, expect, it } from 'vitest';
import { simplifyRoute, offRoute, findDeviations } from '../src/lib/route.js';
import { quote, volumeDiscount, PLANS, GST, INSTALL_FEE } from '../src/lib/plans.js';
import { generateFleet, fleetPosition } from '../src/data/fleet.js';

// A straight 2 km road east, sampled every second at 10 m/s.
const line = Array.from({ length: 201 }, (_, i) => ({ t: i * 1000, x: i * 10, y: 0 }));

describe('route deviation', () => {
  it('simplifies but keeps both ends', () => {
    const r = simplifyRoute(line, 100);
    expect(r[0]).toEqual({ x: 0, y: 0 });
    expect(r[r.length - 1]).toEqual({ x: 2000, y: 0 });
    expect(r.length).toBeLessThan(30);
  });

  it('measures distance off route and progress along it', () => {
    const r = simplifyRoute(line, 100);
    const o = offRoute({ x: 1000, y: 350 }, r);
    expect(o.dist).toBeCloseTo(350, 5);
    expect(o.progress).toBeCloseTo(0.5, 2);
    expect(offRoute({ x: 2300, y: 0 }, r).dist).toBeCloseTo(300, 5);
  });

  it('ignores detours shorter than the grace time', () => {
    const r = simplifyRoute(line, 50);
    // 10 s at 400 m off the road, then back.
    const drive = line.map((s, i) => (i >= 50 && i < 60 ? { ...s, y: 400 } : s));
    expect(findDeviations(drive, r, { corridorM: 200, graceSec: 20 })).toHaveLength(0);
    expect(findDeviations(drive, r, { corridorM: 200, graceSec: 5 })).toHaveLength(1);
  });

  it('reports a long detour with its furthest point and return', () => {
    const r = simplifyRoute(line, 50);
    const drive = line.map((s, i) => (i >= 80 && i < 140 ? { ...s, y: i < 110 ? (i - 79) * 25 : (140 - i) * 25 } : s));
    const [d] = findDeviations(drive, r, { corridorM: 200, graceSec: 20 });
    expect(d.maxOff).toBe(750);
    expect(d.back).toBe(true);
    expect((d.to - d.from) / 1000).toBeGreaterThanOrEqual(20);
  });

  it('a detour still in progress is reported as not back', () => {
    const r = simplifyRoute(line, 50);
    const drive = line.map((s, i) => (i >= 150 ? { ...s, y: 600 } : s));
    const [d] = findDeviations(drive, r, { corridorM: 200, graceSec: 20 });
    expect(d.back).toBe(false);
  });
});

describe('plans & pricing', () => {
  it('volume discounts step at 50 and 200 vehicles', () => {
    expect(volumeDiscount(49)).toBe(0);
    expect(volumeDiscount(50)).toBe(0.1);
    expect(volumeDiscount(199)).toBe(0.1);
    expect(volumeDiscount(200)).toBe(0.15);
  });

  it('personal Plus with a bought tracker', () => {
    const q = quote({ plan: 'plus', billing: 'monthly', hw: 'tracker', hwMode: 'buy' });
    expect(q.upfront).toBe(3999 + INSTALL_FEE);
    expect(q.period).toBe(99);
    expect(q.firstBill).toBeCloseTo((3999 + 499 + 99) * (1 + GST), 6);
  });

  it('yearly is ten months and reports the saving', () => {
    const q = quote({ plan: 'plus', billing: 'yearly', hw: 'none' });
    expect(q.period).toBe(990);
    expect(q.yearlySaving).toBe(198);
  });

  it('business is per vehicle, with free install from 10 and a volume discount', () => {
    const ten = quote({ plan: 'pro', vehicles: 10, hw: 'cam', hwMode: 'buy' });
    expect(ten.install).toBe(0);
    expect(ten.subMonthly).toBe(2490);
    const sixty = quote({ plan: 'fleet', vehicles: 60, hw: 'tracker', hwMode: 'rent' });
    expect(sixty.discount).toBe(0.1);
    expect(sixty.subMonthly).toBeCloseTo(149 * 60 * 0.9, 6);
    expect(sixty.rentMonthly).toBe(149 * 60); // rent is not discounted
    expect(sixty.upfront).toBe(0);
  });

  it('clamps vehicles to the plan range and has no quote for Enterprise', () => {
    expect(quote({ plan: 'family', vehicles: 9, hw: 'none' }).vehicles).toBe(3);
    expect(quote({ plan: 'fleet', vehicles: 1, hw: 'none' }).vehicles).toBe(2);
    expect(quote({ plan: 'enterprise', vehicles: 2000 })).toBeNull();
  });

  it('every plan is labelled for one audience', () => {
    for (const p of Object.values(PLANS)) expect(['personal', 'business']).toContain(p.audience);
  });
});

describe('demo fleet', () => {
  const fleet = generateFleet();

  it('has every vehicle type and state', () => {
    expect(new Set(fleet.map((v) => v.type))).toEqual(new Set(['taxi', 'auto', 'bus', 'truck', 'bike']));
    const states = new Set(fleet.map((v) => fleetPosition(v, 1000).state));
    for (const s of ['idle', 'stopped', 'offline']) expect(states.has(s)).toBe(true);
    expect(states.has('running') || states.has('idle')).toBe(true);
  });

  it('moving vehicles move and parked ones stay put', () => {
    const moving = fleet.find((v) => v.mode === 'running');
    const a = fleetPosition(moving, 100);
    const b = fleetPosition(moving, 160);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0);
    const parked = fleet.find((v) => v.mode === 'stopped');
    expect(fleetPosition(parked, 100)).toEqual(fleetPosition(parked, 5000));
    expect(fleetPosition(parked, 100).v).toBe(0);
  });

  it('is deterministic', () => {
    expect(generateFleet().map((v) => v.plate)).toEqual(fleet.map((v) => v.plate));
  });
});
