import { tripCosts } from './costs.js';
import { median } from './analytics.js';
import { describePoint } from '../data/cityModel.js';

// Answers common questions about driving data on the device, with no internet. The AI
// assistant (Netlify function → Claude) handles everything else; this also acts as its
// offline fallback.

const DAY = 86_400_000;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const hhmm = (h) => new Date(2000, 0, 1, Math.floor(h), Math.round((h % 1) * 60)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Pulls a time filter out of the question. */
export function parsePeriod(q, now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const filters = [];
  let label = 'in the last 6 weeks';
  // "September" or "sep"; "may" only in full since it's also a verb.
  const m = MONTHS.findIndex((name) => new RegExp(`\\b(${name}${name === 'may' ? '' : `|${name.slice(0, 3)}`})\\b`).test(q));
  if (m >= 0) {
    let y = today.getFullYear();
    if (m > today.getMonth()) y -= 1;
    const a = new Date(y, m, 1).getTime();
    const b = new Date(y, m + 1, 1).getTime();
    filters.push((t) => t.start >= a && t.start < b);
    label = `in ${MONTHS[m][0].toUpperCase()}${MONTHS[m].slice(1)}`;
  } else if (/last week/.test(q)) {
    filters.push((t) => t.start >= t0 - 7 * DAY);
    label = 'in the last 7 days';
  } else if (/this week/.test(q)) {
    const monday = t0 - ((today.getDay() + 6) % 7) * DAY;
    filters.push((t) => t.start >= monday);
    label = 'this week';
  } else if (/this month/.test(q)) {
    const a = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    filters.push((t) => t.start >= a);
    label = 'this month';
  } else if (/last month/.test(q)) {
    const a = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime();
    const b = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    filters.push((t) => t.start >= a && t.start < b);
    label = 'last month';
  } else if (/yesterday/.test(q)) {
    filters.push((t) => t.start >= t0 - DAY && t.start < t0);
    label = 'yesterday';
  } else if (/today/.test(q)) {
    filters.push((t) => t.start >= t0);
    label = 'today';
  } else {
    const n = q.match(/last (\d+) days/);
    if (n) {
      filters.push((t) => t.start >= t0 - Number(n[1]) * DAY);
      label = `in the last ${n[1]} days`;
    }
  }
  if (/weekend/.test(q)) {
    filters.push((t) => [0, 6].includes(new Date(t.start).getDay()));
    label = `on weekends ${label}`;
  } else if (/weekday/.test(q)) {
    filters.push((t) => ![0, 6].includes(new Date(t.start).getDay()));
    label = `on weekdays ${label}`;
  } else {
    const d = DOW.findIndex((name) => q.includes(name));
    if (d >= 0) {
      filters.push((t) => new Date(t.start).getDay() === d);
      label = `on ${DOW[d][0].toUpperCase()}${DOW[d].slice(1)}s ${label}`;
    }
  }
  return { filter: (t) => filters.every((f) => f(t)), label };
}

/**
 * @returns {{ answer: string, confident: boolean }} confident=false means "ask the AI instead".
 */
export function answerLocally(question, ctx) {
  const { trips, nameAt, fuel, parkingFees, drivers = [] } = ctx;
  const q = ` ${question.toLowerCase().replace(/[?.!,]/g, ' ')} `;
  const { filter, label } = parsePeriod(q, ctx.now);
  let ts = trips.filter(filter);
  const who = drivers.find((d) => q.includes(` ${d.name.toLowerCase()}`));
  if (who) ts = ts.filter((t) => t.driver === who.id);
  const place = ctx.places.find((p) => p.name && q.includes(p.name.toLowerCase()));
  const byWho = who ? ` by ${who.name}` : '';

  // "When do I usually leave office?"
  if (/\bleave\b|\bdepart|\bstart from\b/.test(q) && place) {
    const deps = ts.filter((t) => nameAt(t.samples[0]) === place.name).map((t) => { const d = new Date(t.start); return d.getHours() + d.getMinutes() / 60; });
    if (!deps.length) return { answer: `No trips leaving ${place.name} ${label}.`, confident: true };
    const sorted = [...deps].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    return { answer: `You usually leave ${place.name} around ${hhmm(median(deps))} (most trips between ${hhmm(q1)} and ${hhmm(q3)}), based on ${deps.length} departures ${label}.`, confident: true };
  }
  // "When do I usually arrive at the gym?"
  if (/\barrive|\breach|\bget to\b/.test(q) && place) {
    const arr = ts.filter((t) => nameAt(t.samples[t.samples.length - 1]) === place.name).map((t) => { const d = new Date(t.end); return d.getHours() + d.getMinutes() / 60; });
    if (!arr.length) return { answer: `No arrivals at ${place.name} ${label}.`, confident: true };
    return { answer: `You usually reach ${place.name} around ${hhmm(median(arr))} (${arr.length} visits ${label}).`, confident: true };
  }
  // Costs
  if (/cost|spend|spent|money|₹|rupee|fuel bill|expens|toll|parking/.test(q)) {
    const sel = place ? ts.filter((t) => nameAt(t.samples[t.samples.length - 1]) === place.name) : ts;
    const c = sel.map((t) => tripCosts(t, fuel, parkingFees));
    const total = c.reduce((a, x) => a + x.cost, 0);
    const tolls = c.reduce((a, x) => a + x.toll, 0);
    const parking = c.reduce((a, x) => a + x.parking, 0);
    const km = sel.reduce((a, t) => a + t.summary.distance, 0) / 1000;
    if (!sel.length) return { answer: `No trips${place ? ` to ${place.name}` : ''}${byWho} ${label}.`, confident: true };
    const parts = [`fuel ${inr(total - tolls - parking)}`];
    if (tolls) parts.push(`tolls ${inr(tolls)}`);
    if (parking) parts.push(`parking ${inr(parking)}`);
    return { answer: `${sel.length} trips${place ? ` to ${place.name}` : ''}${byWho} ${label} cost ${inr(total)} (${parts.join(', ')}) for ${Math.round(km)} km.`, confident: true };
  }
  // Distance / trip counts
  if (/how (many|much)|distance|\bkm\b|kilomet|how far|trips/.test(q) && !/harsh|brak|speed/.test(q)) {
    const km = ts.reduce((a, t) => a + t.summary.distance, 0) / 1000;
    const hrs = ts.reduce((a, t) => a + t.summary.duration, 0) / 3600;
    return { answer: `${ts.length} trips${byWho} ${label}: ${Math.round(km)} km in ${hrs.toFixed(1)} hours of driving.`, confident: true };
  }
  // Harsh events and where
  if (/harsh|brak|hard stop|launch/.test(q)) {
    const type = /launch|accel/.test(q) ? 'harsh_accel' : 'harsh_brake';
    const evs = ts.flatMap((t) => t.events.filter((e) => e.type === type));
    if (!evs.length) return { answer: `No ${type === 'harsh_brake' ? 'harsh braking' : 'hard launches'}${byWho} ${label}.`, confident: true };
    const places = {};
    evs.forEach((e) => { const p = describePoint(e); places[p] = (places[p] ?? 0) + 1; });
    const top = Object.entries(places).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} (${n})`).join(', ');
    return { answer: `${evs.length} ${type === 'harsh_brake' ? 'harsh brakes' : 'hard launches'}${byWho} ${label}. Most often at ${top}.`, confident: true };
  }
  // Speed
  if (/top speed|fastest|max(imum)? speed|how fast/.test(q)) {
    const best = ts.reduce((b, t) => (t.summary.maxV > (b?.summary.maxV ?? 0) ? t : b), null);
    if (!best) return { answer: `No trips ${label}.`, confident: true };
    return { answer: `Top speed${byWho} ${label} was ${Math.round(best.summary.maxV)} km/h, on ${new Date(best.start).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} near ${describePoint(best.samples.find((s) => s.v === best.summary.maxV) ?? best.samples[0])}.`, confident: true };
  }
  if (/average speed|avg speed/.test(q)) {
    const km = ts.reduce((a, t) => a + t.summary.distance, 0) / 1000;
    const mov = ts.reduce((a, t) => a + t.summary.moving, 0) / 3600;
    return { answer: `Average moving speed${byWho} ${label}: ${Math.round(km / Math.max(mov, 0.01))} km/h.`, confident: true };
  }
  if (/longest/.test(q)) {
    const l = [...ts].sort((a, b) => b.summary.distance - a.summary.distance)[0];
    if (!l) return { answer: `No trips ${label}.`, confident: true };
    return { answer: `Longest trip${byWho} ${label}: ${nameAt(l.samples[0]) ?? 'Unknown'} → ${nameAt(l.samples[l.samples.length - 1]) ?? 'Roadside'}, ${(l.summary.distance / 1000).toFixed(1)} km on ${new Date(l.start).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}.`, confident: true };
  }
  return { answer: 'I can answer that with the AI assistant when you’re online. Offline, try questions about costs, distance, departure times, harsh braking or top speed.', confident: false };
}

/** Compact trip table sent to the AI (one line per trip, CSV). Stable order → cache-friendly. */
export function tripTable(trips, { nameAt, fuel, parkingFees, drivers = [] }) {
  const name = (id) => drivers.find((d) => d.id === id)?.name ?? id;
  const rows = trips.map((t) => {
    const c = tripCosts(t, fuel, parkingFees);
    const d = new Date(t.start);
    const ev = {};
    t.events.forEach((e) => { ev[e.type] = (ev[e.type] ?? 0) + 1; });
    return [
      d.toISOString().slice(0, 10),
      d.toLocaleDateString('en-US', { weekday: 'short' }),
      d.toTimeString().slice(0, 5),
      new Date(t.end).toTimeString().slice(0, 5),
      nameAt(t.samples[0]) ?? 'Unknown',
      nameAt(t.samples[t.samples.length - 1]) ?? 'Roadside',
      name(t.driver),
      (t.summary.distance / 1000).toFixed(1),
      Math.round(t.summary.duration / 60),
      Math.round(t.summary.maxV),
      Math.round(c.fuel),
      c.toll,
      c.parking,
      t.score,
      Object.entries(ev).map(([k, n]) => `${k}:${n}`).join(' '),
    ].join(',');
  });
  return ['date,dow,start,end,from,to,driver,km,minutes,max_kmh,fuel_inr,toll_inr,parking_inr,score,events', ...rows].join('\n');
}

/** Offline fallback for the incident statement: a factual first draft from the sealed data. */
export function draftStatementLocally(inc, { road, transcript, typeLabel }) {
  const when = new Date(inc.t);
  const lines = [
    `On ${when.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at about ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, I was driving my vehicle on ${road}.`,
    inc.impact
      ? `According to the tracker, I was travelling at about ${Math.round(inc.impact.fromKmh)} km/h just before it happened.`
      : `According to the tracker, I was travelling at about ${Math.round(inc.speedAt ?? 0)} km/h at the time.`,
  ];
  if (inc.impact) lines.push(`The vehicle's speed dropped from ${Math.round(inc.impact.fromKmh)} km/h to ${Math.round(inc.impact.toKmh)} km/h within ${inc.impact.durationSec.toFixed(1)} seconds, consistent with a collision.`);
  lines.push(`Incident type: ${typeLabel}.`);
  if (transcript) lines.push(`Relevant cabin audio (transcript): "${transcript.trim().slice(0, 300)}"`);
  lines.push('[Add: what the other vehicle did, what you did, and what happened afterwards.]');
  return lines.join(' ');
}
