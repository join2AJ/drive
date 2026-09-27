// Trip fuel cost: distance at the car's real-world mileage, plus fuel burnt while idling.
export const DEFAULT_FUEL = { type: 'Petrol', pricePerL: 103.5, kmPerL: 14, idleLph: 0.8 };

export function tripCost(summary, fuel = DEFAULT_FUEL) {
  const litres = summary.distance / 1000 / fuel.kmPerL + (summary.idle / 3600) * fuel.idleLph;
  const idleCost = (summary.idle / 3600) * fuel.idleLph * fuel.pricePerL;
  return { litres, cost: litres * fuel.pricePerL, idleCost };
}

/** Tolls a trip's GPS track passes through (within 90 m of the plaza). */
export function tollsOnTrip(samples, plazas) {
  const out = [];
  for (const p of plazas) {
    for (let i = 0; i < samples.length; i += 2) {
      if (Math.hypot(samples[i].x - p.x, samples[i].y - p.y) < 90) {
        out.push({ name: p.name, fee: p.fee, t: samples[i].t });
        break;
      }
    }
  }
  return out;
}

/** Full cost of a trip: fuel (+ idle burn), FASTag tolls and parking at the destination. */
export function tripCosts(trip, fuel = DEFAULT_FUEL, parkingFees = {}) {
  const f = tripCost(trip.summary, fuel);
  const toll = (trip.tolls ?? []).reduce((a, x) => a + x.fee, 0);
  const parking = trip.parkingKey ? parkingFees[trip.parkingKey] ?? 0 : 0;
  return { litres: f.litres, fuel: f.cost, idleCost: f.idleCost, toll, parking, cost: f.cost + toll + parking };
}

export const fmtINR = (v, digits = 0) =>
  `₹${v.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT = (h) => (h < 6 ? 'Night (0–6)' : h < 11 ? 'Morning (6–11)' : h < 16 ? 'Midday (11–16)' : h < 21 ? 'Evening (16–21)' : 'Late (21–24)');

/**
 * Groups trips and totals their fuel spend.
 * by: 'destination' | 'route' | 'weekday' | 'timeofday'
 */
export function costBreakdown(trips, { by = 'destination', fuel = DEFAULT_FUEL, nameAt, parkingFees = {} }) {
  const map = new Map();
  let total = 0;
  for (const t of trips) {
    const from = nameAt(t.samples[0]) ?? 'Other';
    const to = nameAt(t.samples[t.samples.length - 1]) ?? 'Roadside';
    const d = new Date(t.start);
    const key = by === 'route' ? `${from} → ${to}` : by === 'weekday' ? DOW[d.getDay()] : by === 'timeofday' ? SLOT(d.getHours()) : to;
    const c = tripCosts(t, fuel, parkingFees);
    const g = map.get(key) ?? { key, trips: [], cost: 0, fuel: 0, toll: 0, parking: 0, distance: 0, litres: 0, idleCost: 0, duration: 0 };
    g.trips.push({ trip: t, ...c });
    g.cost += c.cost;
    g.fuel += c.fuel;
    g.toll += c.toll;
    g.parking += c.parking;
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
