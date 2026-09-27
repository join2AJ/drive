import { mulberry32 } from './rng.js';

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Reminders: date-based (insurance, PUC, RC, FASTag KYC) and km-based (service, tyres).

export function defaultReminders(now = Date.now(), odometerKm = 28_431) {
  const d = (days) => now + days * DAY;
  return [
    { key: 'insurance', label: 'Insurance renewal', kind: 'date', due: d(23), everyDays: 365, note: 'Comprehensive policy · renew early to keep your NCB' },
    { key: 'puc', label: 'PUC certificate', kind: 'date', due: d(-4), everyDays: 365, note: 'Pollution Under Control — ₹500 fine for first offence' },
    { key: 'rc', label: 'Registration (RC)', kind: 'date', due: d(365 * 11 + 40), everyDays: 365 * 5, note: 'Private vehicle RC is valid 15 years' },
    { key: 'service', label: 'General service', kind: 'km', dueKm: 30_000, everyKm: 10_000, due: d(75), everyDays: 365, note: 'Engine oil, filters, brake check' },
    { key: 'tyres', label: 'Tyre rotation', kind: 'km', dueKm: odometerKm + 1_150, everyKm: 10_000, note: 'Rotate front ↔ rear for even wear' },
    { key: 'battery', label: 'Battery health check', kind: 'date', due: d(48), everyDays: 180, note: 'Tracker saw 11.6 V overnight twice this month' },
  ];
}

/** Status for one reminder. Date and km conditions both count; whichever is sooner wins. */
export function reminderStatus(r, now, odometerKm, kmPerDay = 30) {
  const daysLeft = r.due != null ? Math.floor((r.due - now) / DAY) : Infinity;
  const kmLeft = r.dueKm != null ? r.dueKm - odometerKm : Infinity;
  const daysFromKm = kmLeft === Infinity ? Infinity : Math.floor(kmLeft / kmPerDay);
  const effectiveDays = Math.min(daysLeft, daysFromKm);
  const state = effectiveDays < 0 ? 'overdue' : effectiveDays <= 30 ? 'soon' : 'ok';
  let text;
  if (kmLeft !== Infinity && (daysFromKm <= daysLeft)) {
    text = kmLeft < 0 ? `${Math.abs(Math.round(kmLeft)).toLocaleString('en-IN')} km overdue` : `in ${Math.round(kmLeft).toLocaleString('en-IN')} km (~${Math.max(0, daysFromKm)} days)`;
  } else {
    text = daysLeft < 0 ? `${Math.abs(daysLeft)} day${daysLeft === -1 ? '' : 's'} overdue` : daysLeft === 0 ? 'due today' : `in ${daysLeft} days`;
  }
  // Progress through the current interval, 0..1 (1 = due).
  let progress = 0;
  if (kmLeft !== Infinity && r.everyKm) progress = Math.max(progress, 1 - kmLeft / r.everyKm);
  if (daysLeft !== Infinity && r.everyDays) progress = Math.max(progress, 1 - daysLeft / r.everyDays);
  return { state, text, daysLeft, kmLeft, progress: Math.min(1, Math.max(0, progress)) };
}

export function markDone(r, now, odometerKm) {
  return {
    ...r,
    lastDone: now,
    due: r.everyDays ? now + r.everyDays * DAY : r.due,
    dueKm: r.everyKm ? Math.round(odometerKm + r.everyKm) : r.dueKm,
  };
}

// ---------------------------------------------------------------------------
// Fuel log: fill-ups → real mileage (full-tank to full-tank method).

const STATIONS = ['Indian Oil, Hebbal', 'HP, Nagawara', 'Bharat Petroleum, RT Nagar', 'Shell, Manyata'];

/** Plausible past fill-ups consistent with the trip history (true mileage ≈ 13.1 km/L). */
export function seedFuelLog(trips, odometerNow) {
  const rand = mulberry32(77);
  const totalKm = trips.reduce((a, t) => a + t.summary.distance, 0) / 1000;
  let odo = odometerNow - totalKm;
  let sinceFill = 0;
  const log = [];
  for (const t of trips) {
    const km = t.summary.distance / 1000;
    odo += km;
    sinceFill += km;
    if (sinceFill > 360 + rand() * 80) {
      const kmPerL = 12.6 + rand() * 1.1;
      const litres = +(sinceFill / kmPerL).toFixed(2);
      const price = +(102.9 + rand() * 0.8).toFixed(2);
      log.push({ id: `F${log.length + 1}`, t: t.end + 20 * 60_000, odometer: Math.round(odo), litres, pricePerL: price, total: Math.round(litres * price), full: true, station: STATIONS[Math.floor(rand() * STATIONS.length)] });
      sinceFill = 0;
    }
  }
  return log.reverse();
}

/** Mileage between consecutive full-tank fills (the litres of the later fill cover the distance). */
export function mileageFromLog(log) {
  const sorted = [...log].sort((a, b) => a.odometer - b.odometer);
  const legs = [];
  let lastFull = null;
  let litresSince = 0;
  for (const f of sorted) {
    if (lastFull) litresSince += f.litres;
    if (f.full) {
      if (lastFull && litresSince > 0) {
        const km = f.odometer - lastFull.odometer;
        legs.push({ t: f.t, km, litres: litresSince, kmPerL: km / litresSince });
      }
      lastFull = f;
      litresSince = 0;
    }
  }
  const km = legs.reduce((a, l) => a + l.km, 0);
  const litres = legs.reduce((a, l) => a + l.litres, 0);
  const spend = log.reduce((a, f) => a + f.total, 0);
  return { legs, average: litres ? km / litres : null, spend, avgPrice: log.length ? log.reduce((a, f) => a + f.pricePerL, 0) / log.length : null };
}

// ---------------------------------------------------------------------------
// Logbook: business / personal tags and a monthly export.

export function tagFor(trip, tags, rule, nameAt) {
  if (tags[trip.id]) return tags[trip.id];
  if (rule === 'office') {
    const a = nameAt(trip.samples[0]);
    const b = nameAt(trip.samples[trip.samples.length - 1]);
    if (a === 'Office' || b === 'Office') return 'business';
  }
  return 'personal';
}

export function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
}
