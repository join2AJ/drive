import { describe, expect, it } from 'vitest';
import { generateHistory } from '../src/data/simulator.js';
import { analyzeTrip } from '../src/lib/analytics.js';
import { places, tollPlazas, describePoint, DEFAULT_PARKING_FEES } from '../src/data/cityModel.js';
import { tollsOnTrip, tripCosts } from '../src/lib/costs.js';
import { reminderStatus, markDone, mileageFromLog, seedFuelLog, tagFor } from '../src/lib/paperwork.js';
import { unusualMovement, driverViolations, DEFAULT_DRIVERS } from '../src/lib/security.js';
import { hotspots, streaks, badges, insurerScore, weeklyReport } from '../src/lib/engagement.js';
import { answerLocally, parsePeriod, tripTable } from '../src/lib/ask.js';

const NOW = new Date(2026, 8, 27, 18, 0).getTime();
const DAY = 86_400_000;
const trips = generateHistory(NOW).map((t) => ({
  ...analyzeTrip(t),
  tolls: tollsOnTrip(t.samples, tollPlazas),
  parkingKey: t.to && DEFAULT_PARKING_FEES[t.to] != null ? t.to : null,
}));
const saved = Object.values(places);
const nameAt = (pt) => {
  const p = saved.find((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < 320);
  return p ? p.name ?? 'Unlabeled place' : null;
};
const fuel = { type: 'Petrol', pricePerL: 100, kmPerL: 10, idleLph: 0 };

describe('tolls and parking', () => {
  it('charges the NH-44 toll on airport trips only', () => {
    const airport = trips.filter((t) => t.to === 'airport' || t.from === 'airport');
    expect(airport.length).toBeGreaterThan(0);
    airport.forEach((t) => expect(t.tolls.map((x) => x.fee)).toEqual([115]));
    expect(trips.filter((t) => t.to === 'office').every((t) => t.tolls.length === 0)).toBe(true);
  });

  it('adds parking at paid destinations to the trip total', () => {
    const mall = trips.find((t) => t.to === 'mall');
    const c = tripCosts(mall, fuel, DEFAULT_PARKING_FEES);
    expect(c.parking).toBe(60);
    expect(c.cost).toBeCloseTo(c.fuel + c.toll + 60, 5);
    expect(c.fuel).toBeCloseTo((mall.summary.distance / 1000 / 10) * 100, 5);
  });
});

describe('reminders', () => {
  const odo = 28_000;
  it('flags overdue dates and upcoming km-based items', () => {
    expect(reminderStatus({ due: NOW - 4 * DAY }, NOW, odo).state).toBe('overdue');
    expect(reminderStatus({ due: NOW + 10 * DAY }, NOW, odo).state).toBe('soon');
    expect(reminderStatus({ due: NOW + 200 * DAY }, NOW, odo).state).toBe('ok');
    const km = reminderStatus({ dueKm: 28_300, everyKm: 10_000 }, NOW, odo, 30);
    expect(km.state).toBe('soon'); // 300 km at 30 km/day = 10 days
    expect(km.text).toContain('300 km');
  });

  it('schedules the next one when marked done', () => {
    const r = markDone({ key: 'service', everyDays: 365, everyKm: 10_000, due: NOW - DAY, dueKm: 27_000 }, NOW, odo);
    expect(r.dueKm).toBe(38_000);
    expect(r.due).toBe(NOW + 365 * DAY);
  });
});

describe('fuel log', () => {
  it('computes mileage full-tank to full-tank', () => {
    const log = [
      { odometer: 1000, litres: 30, full: true, pricePerL: 100, total: 3000, t: 1 },
      { odometer: 1200, litres: 10, full: false, pricePerL: 100, total: 1000, t: 2 },
      { odometer: 1400, litres: 20, full: true, pricePerL: 100, total: 2000, t: 3 },
    ];
    const m = mileageFromLog(log);
    expect(m.legs).toHaveLength(1);
    expect(m.average).toBeCloseTo(400 / 30, 5);
  });

  it('seeds a realistic history (~13 km/L)', () => {
    const m = mileageFromLog(seedFuelLog(trips, 28_431));
    expect(m.average).toBeGreaterThan(12);
    expect(m.average).toBeLessThan(14.2);
  });
});

describe('logbook tags', () => {
  it('auto-tags office trips as business and respects overrides', () => {
    const office = trips.find((t) => t.to === 'office');
    const gym = trips.find((t) => t.to === 'gym');
    expect(tagFor(office, {}, 'office', nameAt)).toBe('business');
    expect(tagFor(gym, {}, 'office', nameAt)).toBe('personal');
    expect(tagFor(office, { [office.id]: 'personal' }, 'office', nameAt)).toBe('personal');
    expect(tagFor(office, {}, 'none', nameAt)).toBe('personal');
  });
});

describe('theft & new-driver rules', () => {
  it('flags the 2 AM drive as unusual night movement', () => {
    const flagged = unusualMovement(trips);
    expect(flagged.some((u) => new Date(u.t).getHours() === 1 || new Date(u.t).getHours() === 2)).toBe(true);
    // Normal daytime trips are never flagged.
    expect(flagged.every((u) => { const h = new Date(u.t).getHours(); return h >= 23 || h < 5; })).toBe(true);
  });

  it("catches the new driver's curfew and speed breaks", () => {
    const rules = DEFAULT_DRIVERS.find((d) => d.id === 'rohan').rules;
    const rohan = trips.filter((t) => t.driver === 'rohan');
    const v = rohan.flatMap((t) => driverViolations(t, rules));
    expect(v.some((x) => x.type === 'curfew')).toBe(true);
    expect(v.some((x) => x.type === 'speed')).toBe(true);
    expect(driverViolations(rohan[0], { ...rules, enabled: false })).toEqual([]);
  });
});

describe('engagement', () => {
  it('finds the Hebbal flyover as the top harsh-braking hotspot', () => {
    const hs = hotspots(trips, { types: ['harsh_brake'] });
    expect(hs[0].name).toBe('Hebbal flyover');
    expect(hs[0].count).toBeGreaterThanOrEqual(3);
  });

  it('builds a weekly report line with places', () => {
    const r = weeklyReport(trips, { end: NOW, fuel, parkingFees: DEFAULT_PARKING_FEES });
    expect(r.trips).toBeGreaterThan(5);
    expect(r.line).toMatch(/^Drove \d+ km, ₹[\d,]+/);
  });

  it('computes streaks, badges and an insurer score', () => {
    const s = streaks(trips, NOW);
    expect(s.best).toBeGreaterThanOrEqual(s.current);
    expect(badges(trips, NOW)).toHaveLength(6);
    const c = insurerScore(trips, NOW);
    expect(c.score).toBeGreaterThan(0);
    expect(c.score).toBeLessThanOrEqual(100);
    expect(c.crashes).toBe(1);
  });

  it('names points by landmark or road', () => {
    const hebbal = saved[0] && describePoint({ x: -1e6, y: -1e6 });
    expect(typeof hebbal).toBe('string');
  });
});

describe('ask (offline answers)', () => {
  const ctx = { trips, nameAt, places: saved, fuel, parkingFees: DEFAULT_PARKING_FEES, drivers: DEFAULT_DRIVERS, now: NOW };

  it('parses periods', () => {
    const p = parsePeriod(' weekend trips in september ', NOW);
    const sat = new Date(2026, 8, 12, 10).getTime();
    const mon = new Date(2026, 8, 14, 10).getTime();
    expect(p.filter({ start: sat })).toBe(true);
    expect(p.filter({ start: mon })).toBe(false);
    expect(p.label).toContain('September');
  });

  it('answers weekend cost questions with the right total', () => {
    const a = answerLocally('How much did weekend trips cost in September?', ctx);
    expect(a.confident).toBe(true);
    const sept = trips.filter((t) => { const d = new Date(t.start); return d.getMonth() === 8 && [0, 6].includes(d.getDay()); });
    const total = Math.round(sept.reduce((s, t) => s + tripCosts(t, fuel, DEFAULT_PARKING_FEES).cost, 0));
    expect(a.answer).toContain(`₹${total.toLocaleString('en-IN')}`);
  });

  it('answers when I usually leave office', () => {
    const a = answerLocally('When do I usually leave office?', ctx);
    expect(a.confident).toBe(true);
    expect(a.answer).toMatch(/leave Office around (5|6|7):\d\d/);
  });

  it('hands open-ended questions to the AI', () => {
    expect(answerLocally('Should I sell my car?', ctx).confident).toBe(false);
  });

  it('builds a compact CSV table for the AI', () => {
    const csv = tripTable(trips, ctx);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('fuel_inr');
    expect(lines).toHaveLength(trips.length + 1);
  });
});
