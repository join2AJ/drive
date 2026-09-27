import { memo, useMemo, useState } from 'react';
import { ArrowRight, Moon } from 'lucide-react';
import { useApp } from '../state.jsx';
import { boundsOf, pathD } from '../components/MapView.jsx';
import { ScoreRing } from '../components/Charts.jsx';
import { EVENT_META } from '../components/ui.jsx';
import { fmtDay, fmtDuration, fmtKm, fmtTime } from '../lib/format.js';

export const TripThumb = memo(function TripThumb({ samples, size = 76, crash }) {
  const b = boundsOf(samples);
  const w = Math.max(b.maxX - b.minX, 400);
  const h = Math.max(b.maxY - b.minY, 400);
  const s = Math.max(w, h) * 1.3;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const k = s / size;
  const a = samples[0];
  const z = samples[samples.length - 1];
  return (
    <svg viewBox={`${cx - s / 2} ${cy - s / 2} ${s} ${s}`} width={size} height={size} aria-hidden>
      <defs>
        <pattern id="thumbgrid" width={540} height={540} patternUnits="userSpaceOnUse">
          <path d="M540 0H0V540" fill="none" stroke="var(--map-road)" strokeWidth={30} />
        </pattern>
      </defs>
      <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill="url(#thumbgrid)" />
      <path d={pathD(samples, 6)} fill="none" stroke="var(--accent)" strokeWidth={3 * k} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={a.x} cy={a.y} r={4 * k} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2 * k} />
      <circle cx={z.x} cy={z.y} r={4.5 * k} fill={crash ? 'var(--critical)' : 'var(--accent)'} stroke="var(--surface)" strokeWidth={1.5 * k} />
    </svg>
  );
});

const FILTERS = [
  { key: 'all', label: 'All trips' },
  { key: 'alerts', label: 'With alerts' },
  { key: 'commute', label: 'Commute' },
  { key: 'night', label: 'Night' },
];

export default function Trips({ push }) {
  const { trips, placeNameAt } = useApp();
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(30);

  const list = useMemo(() => {
    const f = trips.filter((t) => {
      if (filter === 'alerts') return t.events.some((e) => e.type !== 'overspeed' || e.durationSec > 20);
      if (filter === 'night') return t.summary.night > 60;
      if (filter === 'commute') {
        const a = placeNameAt(t.samples[0]);
        const b = placeNameAt(t.samples[t.samples.length - 1]);
        return (a === 'Home' && b === 'Office') || (a === 'Office' && b === 'Home');
      }
      return true;
    });
    return [...f].reverse();
  }, [trips, filter, placeNameAt]);

  const week = useMemo(() => {
    const since = Date.now() - 7 * 86_400_000;
    const w = trips.filter((t) => t.start >= since);
    return {
      n: w.length,
      d: w.reduce((a, t) => a + t.summary.distance, 0),
      dur: w.reduce((a, t) => a + t.summary.duration, 0),
      score: Math.round(w.reduce((a, t) => a + t.score, 0) / (w.length || 1)),
    };
  }, [trips]);

  const groups = [];
  for (const t of list.slice(0, limit)) {
    const day = fmtDay(t.start);
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) groups.push((g = { day, trips: [], dist: 0 }));
    g.trips.push(t);
    g.dist += t.summary.distance;
  }

  return (
    <div className="screen">
      <div className="topbar"><h1>Trips</h1></div>

      <div className="card fade" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center', padding: '14px 8px' }}>
        {[
          ['Trips', week.n],
          ['Distance', fmtKm(week.d, 0)],
          ['Driving', fmtDuration(week.dur)],
          ['Avg score', week.score],
        ].map(([l, v]) => (
          <div key={l}>
            <div className="num" style={{ fontWeight: 700, fontSize: 17 }}>{v}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12, margin: '6px 4px 14px' }}>Last 7 days</div>

      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => { setFilter(f.key); setLimit(30); }}>{f.label}</button>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.day}>
          <div className="day-head"><span>{g.day}</span><span className="num">{fmtKm(g.dist)}</span></div>
          <div className="list">
            {g.trips.map((t) => <TripRow key={t.id} trip={t} onClick={() => push('trip', { id: t.id })} />)}
          </div>
        </div>
      ))}
      {list.length > limit && (
        <button className="btn" style={{ marginTop: 16 }} onClick={() => setLimit(limit + 30)}>Show older trips</button>
      )}
      {!list.length && <div className="muted" style={{ textAlign: 'center', padding: 40 }}>No trips match this filter.</div>}
    </div>
  );
}

export function TripRow({ trip, onClick }) {
  const { placeNameAt } = useApp();
  const from = placeNameAt(trip.samples[0]) ?? 'Unknown';
  const to = placeNameAt(trip.samples[trip.samples.length - 1]) ?? 'Roadside';
  const crash = trip.events.some((e) => e.type === 'crash');
  const counts = {};
  trip.events.forEach((e) => { counts[e.type] = (counts[e.type] ?? 0) + 1; });
  return (
    <button className="trip-card list-item" onClick={onClick} style={{ display: 'grid' }}>
      <div className="trip-thumb"><TripThumb samples={trip.samples} crash={crash} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <div className="trip-route grow">
            <span className="ellipsis">{from}</span>
            <ArrowRight size={14} style={{ flex: 'none', color: 'var(--ink-3)' }} />
            <span className="ellipsis">{to}</span>
          </div>
          <ScoreRing value={trip.score} size={32} stroke={3} />
        </div>
        <div className="trip-meta num">
          {fmtTime(trip.start)} – {fmtTime(trip.end)} · {fmtKm(trip.summary.distance)} · {fmtDuration(trip.summary.duration)}
        </div>
        <div className="trip-foot">
          {Object.entries(counts).map(([type, n]) => {
            const m = EVENT_META[type];
            const I = m.icon;
            return (
              <span key={type} className={`badge ${type === 'crash' ? 'crit' : 'warn'}`}><I size={12} />{n > 1 ? `${n} ` : ''}{m.short}</span>
            );
          })}
          {trip.summary.night > 60 && <span className="badge"><Moon size={12} />Night</span>}
          {!trip.events.length && <span className="badge good">Smooth drive</span>}
        </div>
      </div>
    </button>
  );
}
