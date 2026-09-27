// Trip fuel cost: distance at the car's real-world mileage, plus fuel burnt while idling.
export const DEFAULT_FUEL = { type: 'Petrol', pricePerL: 103.5, kmPerL: 14, idleLph: 0.8 };

export function tripCost(summary, fuel = DEFAULT_FUEL) {
  const litres = summary.distance / 1000 / fuel.kmPerL + (summary.idle / 3600) * fuel.idleLph;
  const idleCost = (summary.idle / 3600) * fuel.idleLph * fuel.pricePerL;
  return { litres, cost: litres * fuel.pricePerL, idleCost };
}

export const fmtINR = (v, digits = 0) =>
  `₹${v.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT = (h) => (h < 6 ? 'Night (0–6)' : h < 11 ? 'Morning (6–11)' : h < 16 ? 'Midday (11–16)' : h < 21 ? 'Evening (16–21)' : 'Late (21–24)');

/**
 * Groups trips and totals their fuel spend.
 * by: 'destination' | 'route' | 'weekday' | 'timeofday'
 */
export function costBreakdown(trips, { by = 'destination', fuel = DEFAULT_FUEL, nameAt }) {
  const map = new Map();
  let total = 0;
  for (const t of trips) {
    const from = nameAt(t.samples[0]) ?? 'Other';
    const to = nameAt(t.samples[t.samples.length - 1]) ?? 'Roadside';
    const d = new Date(t.start);
    const key = by === 'route' ? `${from} → ${to}` : by === 'weekday' ? DOW[d.getDay()] : by === 'timeofday' ? SLOT(d.getHours()) : to;
    const c = tripCost(t.summary, fuel);
    const g = map.get(key) ?? { key, trips: [], cost: 0, distance: 0, litres: 0, idleCost: 0, duration: 0 };
    g.trips.push({ trip: t, ...c });
    g.cost += c.cost;
    g.litres += c.litres;
    g.idleCost += c.idleCost;
    g.distance += t.summary.distance;
    g.duration += t.summary.duration;
    map.set(key, g);
    total += c.cost;
  }
  const groups = [...map.values()].map((g) => ({ ...g, visits: g.trips.length, share: total ? g.cost / total : 0, perVisit: g.cost / g.trips.length }));
  return { groups, total };
}
