import { useMemo, useState } from 'react';
import { Share2, TrendingUp, TrendingDown, OctagonAlert, Zap, Gauge, Trophy, Route as RouteIcon } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented } from '../components/ui.jsx';
import { ScoreRing } from '../components/Charts.jsx';
import { weeklyReport, streaks } from '../lib/engagement.js';
import { fmtINR } from '../lib/costs.js';
import { fmtDay, fmtDuration } from '../lib/format.js';

const DAY = 86_400_000;
const LABEL = { harsh_brake: ['harsh brake', OctagonAlert], harsh_accel: ['hard launch', Zap], crash: ['collision', OctagonAlert] };

export default function WeeklyReport({ pop, push, driver: initialDriver = null }) {
  const { trips, settings, drivers, placeNameAt, setToast, thresholds } = useApp();
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [driver, setDriver] = useState(initialDriver);
  const end = Date.now() - weeksAgo * 7 * DAY;
  const r = useMemo(() => weeklyReport(trips, { end, fuel: settings.fuel, parkingFees: settings.parkingFees, driver }), [trips, end, settings.fuel, settings.parkingFees, driver]);
  const st = useMemo(() => streaks(trips), [trips]);
  const delta = r.score != null && r.prevScore != null ? r.score - r.prevScore : null;
  const kmDelta = r.prevKm ? Math.round(((r.km - r.prevKm) / r.prevKm) * 100) : null;
  const name = (t) => `${placeNameAt(t.samples[0]) ?? 'Unknown'} → ${placeNameAt(t.samples[t.samples.length - 1]) ?? 'Roadside'}`;

  const share = async () => {
    const text = `My week in the car: ${r.line}.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Weekly driving report', text });
      else { await navigator.clipboard.writeText(text); setToast('Report copied'); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="screen pushed">
      <NavBar title="Weekly report" onBack={pop} right={<button className="icon-btn ghost" aria-label="Share" onClick={share}><Share2 size={20} /></button>} />
      <Segmented options={[{ value: 0, label: 'This week' }, { value: 1, label: 'Last week' }, { value: 2, label: '2 weeks ago' }]} value={weeksAgo} onChange={setWeeksAgo} />
      <div className="chips" style={{ marginTop: 10 }}>
        <button className={`chip ${!driver ? 'on' : ''}`} onClick={() => setDriver(null)}>Everyone</button>
        {drivers.map((d) => <button key={d.id} className={`chip ${driver === d.id ? 'on' : ''}`} onClick={() => setDriver(d.id)}>{d.name}</button>)}
      </div>

      <div className="cert fade" style={{ marginTop: 12 }}>
        <div className="muted num" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtDay(r.start + 1)} – {fmtDay(r.end)}</div>
        <div style={{ fontSize: 19, fontWeight: 750, lineHeight: 1.3, margin: '6px 0 14px', textWrap: 'balance' }}>{r.trips ? `${r.line}.` : 'No driving this week.'}</div>
        <div className="row" style={{ gap: 14 }}>
          {r.score != null && <ScoreRing value={r.score} size={70} stroke={6} />}
          <div className="grid-2 grow" style={{ gap: 8 }}>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Distance</div><div className="num" style={{ fontWeight: 750, fontSize: 18 }}>{Math.round(r.km)} km</div>{kmDelta != null && <div className="muted num" style={{ fontSize: 11.5 }}>{kmDelta >= 0 ? '+' : ''}{kmDelta}% vs prior</div>}</div>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Spent</div><div className="num" style={{ fontWeight: 750, fontSize: 18 }}>{fmtINR(r.cost)}</div><div className="muted num" style={{ fontSize: 11.5 }}>fuel {fmtINR(r.fuel)}</div></div>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Trips</div><div className="num" style={{ fontWeight: 750, fontSize: 18 }}>{r.trips}</div></div>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Driving</div><div className="num" style={{ fontWeight: 750, fontSize: 18 }}>{fmtDuration(r.driveSec)}</div></div>
          </div>
        </div>
        {delta != null && (
          <div className="row" style={{ gap: 6, marginTop: 12, fontSize: 13, fontWeight: 600, color: delta >= 0 ? 'var(--good-ink)' : 'var(--critical-ink)' }}>
            {delta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} Safety score {delta >= 0 ? 'up' : 'down'} {Math.abs(delta)} from {r.prevScore} the week before
          </div>
        )}
      </div>

      {(r.tolls > 0 || r.parking > 0) && (
        <div className="muted num" style={{ fontSize: 12.5, margin: '8px 4px 0' }}>Includes {[r.tolls ? `FASTag tolls ${fmtINR(r.tolls)}` : null, r.parking ? `parking ${fmtINR(r.parking)}` : null].filter(Boolean).join(' and ')}.</div>
      )}

      <SectionTitle action={r.groups.length ? 'Hotspots' : undefined} onAction={() => push('hotspots')}>Where it got rough</SectionTitle>
      <div className="list">
        {r.groups.map((g) => {
          const [label, I] = LABEL[g.type];
          return (
            <div key={`${g.type}${g.place}`} className="list-item">
              <div className={`glyph ${g.type === 'crash' ? 'crit' : 'warn'}`}><I size={17} /></div>
              <div className="grow"><div className="title">{g.n} {label}{g.n > 1 ? 's' : ''}</div><div className="meta">at {g.place}</div></div>
            </div>
          );
        })}
        {r.overspeed > 0 && (
          <div className="list-item"><div className="glyph warn"><Gauge size={17} /></div><div className="grow"><div className="title">{r.overspeed} overspeed stretch{r.overspeed > 1 ? 'es' : ''}</div><div className="meta">above {thresholds.overspeedKmh} km/h for 10 s or more</div></div></div>
        )}
        {!r.groups.length && !r.overspeed && <div className="list-item muted">A clean week — no harsh events.</div>}
      </div>

      <SectionTitle>Highlights</SectionTitle>
      <div className="list">
        {r.best && (
          <button className="list-item" onClick={() => push('trip', { id: r.best.id })}>
            <div className="glyph good"><Trophy size={17} /></div>
            <div className="grow"><div className="title">Smoothest drive · {r.best.score}</div><div className="meta">{name(r.best)} · {fmtDay(r.best.start)}</div></div>
          </button>
        )}
        {r.longest && (
          <button className="list-item" onClick={() => push('trip', { id: r.longest.id })}>
            <div className="glyph accent"><RouteIcon size={17} /></div>
            <div className="grow"><div className="title">Longest trip · {(r.longest.summary.distance / 1000).toFixed(1)} km</div><div className="meta">{name(r.longest)} · {fmtDay(r.longest.start)}</div></div>
          </button>
        )}
        <button className="list-item" onClick={() => push('achievements')}>
          <div className="glyph warn"><Trophy size={17} /></div>
          <div className="grow"><div className="title">Smooth-driving streak · {st.current} day{st.current === 1 ? '' : 's'}</div><div className="meta">Best ever {st.best} days</div></div>
        </button>
      </div>
    </div>
  );
}
