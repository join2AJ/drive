import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Fuel, Lightbulb, Timer } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, Segmented, SectionTitle } from '../components/ui.jsx';
import { costBreakdown, fmtINR } from '../lib/costs.js';
import { fmtDay, fmtKm, fmtTime } from '../lib/format.js';

const GROUPS = [
  { key: 'destination', label: 'Destination' },
  { key: 'route', label: 'Route' },
  { key: 'weekday', label: 'Weekday' },
  { key: 'timeofday', label: 'Time of day' },
];

export default function Costs({ pop, push, by: initialBy = 'destination' }) {
  const { trips, settings, placeNameAt } = useApp();
  const fuel = settings.fuel;
  const [period, setPeriod] = useState(30);
  const [by, setBy] = useState(initialBy);
  const [sort, setSort] = useState('cost');
  const [open, setOpen] = useState(null);

  const since = Date.now() - period * 86_400_000;
  const cur = useMemo(() => trips.filter((t) => t.start >= since), [trips, since]);
  const { groups, total } = useMemo(() => costBreakdown(cur, { by, fuel, nameAt: placeNameAt }), [cur, by, fuel, placeNameAt]);
  const sorted = [...groups].sort((a, b) => (sort === 'visits' ? b.visits - a.visits : sort === 'distance' ? b.distance - a.distance : b.cost - a.cost));
  const km = cur.reduce((a, t) => a + t.summary.distance, 0) / 1000;
  const litres = groups.reduce((a, g) => a + g.litres, 0);
  const idle = groups.reduce((a, g) => a + g.idleCost, 0);
  const top = [...groups].sort((a, b) => b.cost - a.cost)[0];
  const maxCost = Math.max(...groups.map((g) => g.cost), 1);

  return (
    <div className="screen pushed">
      <NavBar title="Fuel & costs" onBack={pop} />
      <Segmented options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 42, label: '6 weeks' }]} value={period} onChange={setPeriod} />

      <div className="card fade" style={{ marginTop: 12 }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Fuel spend · {cur.length} trips</div>
        <div className="num" style={{ fontSize: 34, fontWeight: 750, letterSpacing: '-0.02em' }}>{fmtINR(total)}</div>
        <div className="grid-3" style={{ marginTop: 10 }}>
          <div><div className="muted" style={{ fontSize: 11.5 }}>Fuel used</div><div className="num" style={{ fontWeight: 700 }}>{litres.toFixed(1)} L</div></div>
          <div><div className="muted" style={{ fontSize: 11.5 }}>Cost per km</div><div className="num" style={{ fontWeight: 700 }}>{fmtINR(km ? total / km : 0, 2)}</div></div>
          <div><div className="muted" style={{ fontSize: 11.5 }}>Per day</div><div className="num" style={{ fontWeight: 700 }}>{fmtINR(total / period)}</div></div>
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8, fontSize: 12.5 }}>
          <Timer size={14} className="muted" />
          <span className="ink2">Idling burnt <b className="num">{fmtINR(idle)}</b> ({total ? Math.round((idle / total) * 100) : 0}%) at signals and in traffic.</span>
        </div>
      </div>

      {top && (
        <div className="banner info" style={{ marginTop: 12 }}>
          <div className="glyph accent"><Lightbulb size={18} /></div>
          <div className="ink2" style={{ fontSize: 13.5 }}>
            <b style={{ color: 'var(--ink)' }}>{top.key}</b> costs you the most: {top.visits} {by === 'destination' ? 'visits' : 'trips'}, {fmtINR(top.cost)} ({Math.round(top.share * 100)}% of spend), about {fmtINR(top.perVisit)} each.
          </div>
        </div>
      )}

      <SectionTitle>Breakdown</SectionTitle>
      <div className="chips" style={{ marginBottom: 10 }}>
        {GROUPS.map((g) => <button key={g.key} className={`chip ${by === g.key ? 'on' : ''}`} onClick={() => { setBy(g.key); setOpen(null); }}>{g.label}</button>)}
      </div>
      <Segmented options={[{ value: 'cost', label: 'By cost' }, { value: 'visits', label: 'By visits' }, { value: 'distance', label: 'By km' }]} value={sort} onChange={setSort} />

      <div className="list" style={{ marginTop: 12 }}>
        {sorted.map((g) => (
          <div key={g.key} style={{ borderTop: '1px solid var(--hairline)' }}>
            <button className="bar-row" onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={open === g.key}>
              <div className="row" style={{ gap: 8 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 650 }}>{g.key}</div>
                  <div className="muted num" style={{ fontSize: 12.5 }}>{g.visits} {g.visits === 1 ? 'trip' : 'trips'} · {fmtKm(g.distance, 0)} · {fmtINR(g.perVisit)} each</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontWeight: 750 }}>{fmtINR(g.cost)}</div>
                  <div className="muted num" style={{ fontSize: 11.5 }}>{Math.round(g.share * 100)}%</div>
                </div>
                {open === g.key ? <ChevronDown size={16} className="muted" /> : <ChevronRight size={16} className="muted" />}
              </div>
              <div className="bar-track"><div style={{ width: `${(g.cost / maxCost) * 100}%` }} /></div>
            </button>
            {open === g.key && (
              <div style={{ background: 'var(--surface-2)' }}>
                {[...g.trips].reverse().map(({ trip, cost }) => (
                  <button key={trip.id} className="list-item plain" onClick={() => push('trip', { id: trip.id })}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>{placeNameAt(trip.samples[0]) ?? 'Unknown'} → {placeNameAt(trip.samples[trip.samples.length - 1]) ?? 'Roadside'}</div>
                      <div className="muted num" style={{ fontSize: 12 }}>{fmtDay(trip.start)}, {fmtTime(trip.start)} · {fmtKm(trip.summary.distance)}</div>
                    </div>
                    <span className="num" style={{ fontWeight: 650 }}>{fmtINR(cost)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="row muted" style={{ fontSize: 12, marginTop: 14, gap: 6, justifyContent: 'center' }}>
        <Fuel size={13} /> {fuel.type} at {fmtINR(fuel.pricePerL, 2)}/L · {fuel.kmPerL} km/L · idle {fuel.idleLph} L/h
        <button className="link" style={{ color: 'var(--accent)', fontWeight: 600 }} onClick={() => push('settings')}>Edit</button>
      </div>
    </div>
  );
}
