import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, detectEvents, frequentPlaces, safetyScore, summarizeTrip } from '../src/lib/analytics.js';
import { generateHistory } from '../src/data/simulator.js';
import { places } from '../src/data/cityModel.js';

// Build a 1 Hz stream from a list of speeds (km/h), moving along +x.
function stream(speeds, t0 = Date.UTC(2026, 0, 5, 9)) {
  let x = 0;
  return speeds.map((v, i) => {
    if (i) x += (speeds[i - 1] + v) / 2 / 3.6;
    return { t: t0 + i * 1000, x, y: 0, v, limit: 60 };
  });
}

describe('crash detection', () => {
  it('flags 80 → 4 km/h within 2 s as a probable collision', () => {
    const s = stream([60, 70, 80, 80, 41, 4, 0, 0, 0, 0, 0, 0]);
    const crashes = detectEvents(s).filter((e) => e.type === 'crash');
    expect(crashes).toHaveLength(1);
    expect(crashes[0].fromKmh).toBe(80);
    expect(crashes[0].toKmh).toBe(4);
    expect(crashes[0].durationSec).toBe(2);
    expect(crashes[0].gforce).toBeGreaterThan(1);
  });

  it('does not flag a firm but normal stop from 80 km/h', () => {
    const s = stream([80, 72, 64, 56, 48, 40, 32, 24, 16, 8, 0]);
    expect(detectEvents(s).some((e) => e.type === 'crash')).toBe(false);
  });

  it('respects custom thresholds', () => {
    const s = stream([50, 50, 25, 5, 0]);
    expect(detectEvents(s).some((e) => e.type === 'crash')).toBe(false);
    const loose = { ...DEFAULT_THRESHOLDS, crashFromKmh: 45 };
    expect(detectEvents(s, loose).some((e) => e.type === 'crash')).toBe(true);
  });

  it('does not double-count a crash as harsh braking', () => {
    const s = stream([80, 80, 41, 4, 0, 0]);
    const types = detectEvents(s).map((e) => e.type);
    expect(types).toContain('crash');
    expect(types).not.toContain('harsh_brake');
  });
});

describe('driving events', () => {
  it('detects harsh braking and harsh acceleration episodes', () => {
    const s = stream([0, 14, 28, 40, 50, 50, 50, 32, 16, 16, 16]);
    const types = detectEvents(s).map((e) => e.type);
    expect(types).toEqual(['harsh_accel', 'harsh_brake']);
  });

  it('detects sustained overspeed only', () => {
    const brief = stream([70, 85, 85, 70, ...Array(10).fill(70)]);
    expect(detectEvents(brief).some((e) => e.type === 'overspeed')).toBe(false);
    const long = stream([70, ...Array(15).fill(92), 70]);
    const o = detectEvents(long).find((e) => e.type === 'overspeed');
    expect(o.maxKmh).toBe(92);
  });
});

describe('trip summary & score', () => {
  it('computes distance and speeds', () => {
    const s = stream(Array(61).fill(36)); // 36 km/h = 10 m/s for 60 s
    const sum = summarizeTrip(s);
    expect(Math.round(sum.distance)).toBe(600);
    expect(Math.round(sum.avgV)).toBe(36);
  });

  it('penalises events', () => {
    expect(safetyScore([], 10_000)).toBe(100);
    expect(safetyScore([{ type: 'harsh_brake' }], 10_000)).toBeLessThan(100);
    expect(safetyScore([{ type: 'crash' }], 10_000)).toBeLessThan(safetyScore([{ type: 'harsh_brake' }], 10_000));
  });
});

describe('simulated history', () => {
  const trips = generateHistory(Date.UTC(2026, 8, 27, 12));

  it('detected events match what the simulated device recorded', () => {
    const count = (arr) => arr.reduce((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {});
    const detected = count(trips.flatMap((t) => detectEvents(t.samples).filter((e) => e.type !== 'overspeed')));
    const truth = count(trips.flatMap((t) => t.deviceEvents));
    expect(detected).toEqual(truth);
    expect(truth.crash).toBe(1);
  });

  it('discovers frequent places including an unlabeled one', () => {
    const labelled = Object.values(places).filter((p) => p.name);
    const found = frequentPlaces(trips, labelled);
    expect(found[0].name).toBe('Home');
    const mystery = found.find((p) => !p.name);
    expect(mystery).toBeTruthy();
    expect(mystery.topDow).toBe(6); // Saturdays
  });
});
