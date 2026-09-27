import { useMemo, useState } from 'react';
import { Sparkles, Moon, Timer, Gauge, Route as RouteIcon, ArrowRight, Lightbulb, MapPin } from 'lucide-react';
import { useApp } from '../state.jsx';
import { BarChart, Heatmap, ScoreRing, SpeedHistogram } from '../components/Charts.jsx';
import MapView, { Pin } from '../components/MapView.jsx';
import { Segmented, SectionTitle, EVENT_META, PlaceIcon, Sheet, CountUp } from '../components/ui.jsx';
import { dailyTotals, frequentPlaces, frequentRoutes, median, speedDistribution, timeOfDayMatrix } from '../lib/analytics.js';
import { fmtDuration, fmtHour, fmtKm } from '../lib/format.js';

const DOW = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export default function Insights({ push }) {
  const { trips, thresholds, savedPlaces, settings, setSettings, setToast } = useApp();
  const [period, setPeriod] = useState(30);
  const [naming, setNaming] = useState(null);
  const [name, setName] = useState('');

  const since = Date.now() - period * 86_400_000;
  const cur = useMemo(() => trips.filter((t) => t.start >= since), [trips, since]);
  const prev = useMemo(() => trips.filter((t) => t.start >= since - period * 86_400_000 && t.start < since), [trips, since, period]);

  const agg = (ts) => {
    const d = ts.reduce((a, t) => a + t.summary.distance, 0);
    const score = d ? Math.round(ts.reduce((a, t) => a + t.score * t.summary.distance, 0) / d) : 0;
    return { d, score };
  };
  const A = agg(cur);
  const P = agg(prev);

  const counts = useMemo(() => {
    const c = { crash: 0, harsh_brake: 0, harsh_accel: 0, overspeed: 0 };
    cur.forEach((t) => t.events.forEach((e) => { c[e.type] += 1; }));
    return c;
  }, [cur]);

  const days = useMemo(() => dailyTotals(cur, period), [cur, period]);
  const labelled = savedPlaces.filter((p) => p.name);
  const places = useMemo(() => frequentPlaces(cur, labelled), [cur, labelled]);
  const unlabeled = places.find((p) => !p.name);
  const routes = useMemo(() => frequentRoutes(cur, savedPlaces), [cur, savedPlaces]);
  const bins = useMemo(() => speedDistribution(cur, 10, 110), [cur]);
  const matrix = useMemo(() => timeOfDayMatrix(cur), [cur]);

  const habits = useMemo(() => {
    const tot = cur.reduce((a, t) => ({ dur: a.dur + t.summary.duration, night: a.night + t.summary.night, idle: a.idle + t.summary.idle, moving: a.moving + t.summary.moving, maxV: Math.max(a.maxV, t.summary.maxV) }), { dur: 0, night: 0, idle: 0, moving: 0, maxV: 0 });
    const overSec = cur.reduce((a, t) => a + t.samples.filter((s) => s.v > thresholds.overspeedKmh).length, 0);
    return { ...tot, avgV: tot.moving ? (A.d / tot.moving) * 3.6 : 0, overPct: tot.moving ? (overSec / tot.moving) * 100 : 0, avgTrip: cur.length ? A.d / cur.length : 0 };
  }, [cur, thresholds, A.d]);

  // Commute tip: compare departures before vs after the median departure time.
  const commuteTip = useMemo(() => {
    const r = routes.find((x) => x.from === 'Home' && x.to === 'Office');
    if (!r) return null;
    const ts = cur.filter((t) => {
      const a = savedPlaces.find((p) => Math.hypot(p.x - t.samples[0].x, p.y - t.samples[0].y) < 320);
      const z = t.samples[t.samples.length - 1];
      const b = savedPlaces.find((p) => Math.hypot(p.x - z.x, p.y - z.y) < 320);
      return a?.key === 'home' && b?.key === 'office';
    });
    const hour = (t) => new Date(t.start).getHours() + new Date(t.start).getMinutes() / 60;
    const cut = median(ts.map(hour));
    const early = ts.filter((t) => hour(t) <= cut).map((t) => t.summary.duration);
    const late = ts.filter((t) => hour(t) > cut).map((t) => t.summary.duration);
    if (early.length < 2 || late.length < 2) return null;
    return { cut, early: median(early), late: median(late), r };
  }, [routes, cur, savedPlaces]);

  const delta = A.score - P.score;
  const mapFit = { minX: -200, minY: -200, maxX: 8900, maxY: 12100 };

  return (
    <div className="screen">
      <div className="topbar"><h1>Insights</h1></div>
      <Segmented options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 42, label: '6 weeks' }]} value={period} onChange={setPeriod} />

      <div className="card fade" style={{ marginTop: 14 }}>
        <div className="row" style={{ gap: 16 }}>
          <ScoreRing value={A.score} size={96} stroke={8} />
          <div className="grow">
            <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Safety score</div>
            <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: '-0.02em' }}>
              {A.score >= 85 ? 'Excellent' : A.score >= 70 ? 'Good' : 'Needs attention'}
            </div>
            {P.d > 0 && (
              <div style={{ fontSize: 13, color: delta >= 0 ? 'var(--good-ink)' : 'var(--critical-ink)', fontWeight: 600 }}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} pts vs previous {period} days
              </div>
            )}
            <div className="muted num" style={{ fontSize: 13 }}>{cur.length} trips · {fmtKm(A.d, 0)}</div>
          </div>
        </div>
        <div className="grid-4" style={{ marginTop: 14 }}>
          {Object.entries(counts).map(([type, n]) => {
            const m = EVENT_META[type];
            const I = m.icon;
            return (
              <div key={type} style={{ textAlign: 'center', padding: '8px 0', borderRadius: 12, background: 'var(--surface-2)' }}>
                <I size={16} color={n ? (type === 'crash' ? 'var(--critical-ink)' : 'var(--warning)') : 'var(--ink-3)'} style={{ margin: '0 auto' }} />
                <div className="num" style={{ fontWeight: 750, fontSize: 18 }}>{n}</div>
                <div className="muted" style={{ fontSize: 10.5 }}>{m.short}</div>
              </div>
            );
          })}
        </div>
      </div>

      <SectionTitle>Distance</SectionTitle>
      <div className="card">
        <div className="row" style={{ alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em' }}><CountUp value={A.d / 1000} /> <span className="muted" style={{ fontSize: 14 }}>km</span></div>
          <div className="muted num" style={{ fontSize: 13 }}>≈ ₹{Math.round((A.d / 1000 / 14) * 103).toLocaleString('en-IN')} fuel</div>
        </div>
        <BarChart
          data={days.map((d) => ({ label: period <= 7 ? new Date(d.day).toLocaleDateString([], { weekday: 'narrow' }) : new Date(d.day).getDate(), value: d.distance / 1000, sub: `${new Date(d.day).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.trips} trips` }))}
          format={(v, axis) => (axis ? Math.round(v) : `${v.toFixed(1)} km`)}
        />
      </div>

      <SectionTitle>Frequent places</SectionTitle>
      {unlabeled && (
        <button className="banner info fade" style={{ marginBottom: 12 }} onClick={() => { setNaming(unlabeled); setName(''); }}>
          <div className="glyph accent"><Sparkles size={18} /></div>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>New frequent place detected</div>
            <div className="ink2" style={{ fontSize: 13 }}>
              Visited {unlabeled.visits}× · mostly {DOW[unlabeled.topDow]} around {fmtHour(unlabeled.typicalArrival)}. Tap to name it.
            </div>
          </div>
        </button>
      )}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapView fit={mapFit} fitKey="places" style={{ height: 260 }} detail={false} controls={false}>
          {(k) => {
            const max = Math.max(...places.map((p) => p.visits));
            return places.map((p) => (
              <g key={p.key}>
                <circle cx={p.x} cy={p.y} r={(12 + 20 * Math.sqrt(p.visits / max)) * k} fill={p.name ? 'var(--accent)' : 'var(--violet)'} fillOpacity={0.22} stroke={p.name ? 'var(--accent)' : 'var(--violet)'} strokeWidth={1.5 * k} />
                <Pin x={p.x} y={p.y} k={k} size={20} color={p.name ? 'var(--accent)' : 'var(--violet)'} icon={<PlaceIcon name={p.icon} size={24} />} />
              </g>
            ));
          }}
        </MapView>
        <div>
          {places.slice(0, 7).map((p, i) => (
            <div key={p.key} className="list-item" style={{ borderTop: i ? undefined : '1px solid var(--hairline)' }}>
              <div className={`glyph ${p.name ? 'accent' : 'violet'}`}><PlaceIcon name={p.icon} /></div>
              <div className="grow">
                <div className="title">{p.name ?? 'Unlabeled place'}</div>
                <div className="meta">Usually arrive {fmtHour(p.typicalArrival)}{p.avgDwellSec ? ` · stay ${fmtDuration(p.avgDwellSec)}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontWeight: 700 }}>{p.visits}</div>
                <div className="muted" style={{ fontSize: 11 }}>visits</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SectionTitle>Top routes</SectionTitle>
      {commuteTip && commuteTip.late > commuteTip.early + 90 && (
        <div className="banner info" style={{ marginBottom: 12 }}>
          <div className="glyph accent"><Lightbulb size={18} /></div>
          <div className="grow ink2" style={{ fontSize: 13.5 }}>
            <b style={{ color: 'var(--ink)' }}>Leave before {fmtHour(commuteTip.cut)}</b> — your Home → Office drive takes {fmtDuration(commuteTip.early)} vs {fmtDuration(commuteTip.late)} when you leave later.
          </div>
        </div>
      )}
      <div className="list">
        {routes.slice(0, 5).map((r) => (
          <div key={r.key} className="list-item">
            <div className="glyph"><RouteIcon size={18} /></div>
            <div className="grow">
              <div className="title row" style={{ gap: 6 }}>{r.from} <ArrowRight size={14} className="muted" /> {r.to}</div>
              <div className="meta num">{r.count} trips · typical {fmtDuration(r.median)} · best {fmtDuration(r.best)}</div>
              <RangeBar best={r.best} median={r.median} worst={r.worst} />
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Speed profile</SectionTitle>
      <div className="card">
        <div className="grid-3" style={{ marginBottom: 14 }}>
          <Mini icon={<Gauge size={14} />} label="Avg moving" value={`${Math.round(habits.avgV)}`} unit="km/h" />
          <Mini icon={<Gauge size={14} />} label="Top speed" value={`${Math.round(habits.maxV)}`} unit="km/h" />
          <Mini icon={<Timer size={14} />} label={`Over ${thresholds.overspeedKmh}`} value={habits.overPct.toFixed(1)} unit="% time" />
        </div>
        <div className="card-title">Share of driving time by speed (km/h)</div>
        <SpeedHistogram bins={bins} limit={thresholds.overspeedKmh} />
      </div>

      <SectionTitle>When you drive</SectionTitle>
      <div className="card">
        <Heatmap matrix={matrix} />
      </div>

      <SectionTitle>Habits</SectionTitle>
      <div className="grid-2">
        <div className="stat"><div className="label"><Moon size={13} /> Night driving</div><div className="value">{habits.dur ? ((habits.night / habits.dur) * 100).toFixed(1) : 0}<small>%</small></div><div className="delta">10 PM – 5 AM</div></div>
        <div className="stat"><div className="label"><Timer size={13} /> Idling</div><div className="value">{habits.dur ? Math.round((habits.idle / habits.dur) * 100) : 0}<small>%</small></div><div className="delta">{fmtDuration(habits.idle)} engine on, stopped</div></div>
        <div className="stat"><div className="label"><RouteIcon size={13} /> Avg trip</div><div className="value">{(habits.avgTrip / 1000).toFixed(1)}<small>km</small></div><div className="delta">{fmtDuration(habits.dur / (cur.length || 1))} per trip</div></div>
        <div className="stat"><div className="label"><MapPin size={13} /> Places</div><div className="value">{places.length}</div><div className="delta">visited 2+ times</div></div>
      </div>

      <Sheet open={!!naming} onClose={() => setNaming(null)}>
        <h3>Name this place</h3>
        <p className="muted" style={{ margin: '4px 0 14px' }}>You park here often on {naming ? DOW[naming.topDow] : ''}. Naming it improves trip labels and lets you add a geofence.</p>
        <div className="chips" style={{ marginBottom: 12 }}>
          {['Badminton court', 'Market', 'Friend’s place', 'Temple', 'Club'].map((s) => (
            <button key={s} className={`chip ${name === s ? 'on' : ''}`} onClick={() => setName(s)}>{s}</button>
          ))}
        </div>
        <div className="field"><label htmlFor="pname">Place name</label><input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Badminton court" /></div>
        <button
          className="btn primary"
          style={{ marginTop: 16 }}
          disabled={!name.trim()}
          onClick={() => {
            setSettings({ ...settings, placeNames: { ...settings.placeNames, mystery: name.trim() } });
            setToast(`Saved “${name.trim()}”`);
            setNaming(null);
          }}
        >
          Save place
        </button>
      </Sheet>
    </div>
  );
}

function Mini({ icon, label, value, unit }) {
  return (
    <div>
      <div className="muted row" style={{ gap: 4, fontSize: 11.5, fontWeight: 600 }}>{icon}{label}</div>
      <div className="num" style={{ fontSize: 20, fontWeight: 750 }}>{value}<span className="muted" style={{ fontSize: 11, fontWeight: 600, marginLeft: 3 }}>{unit}</span></div>
    </div>
  );
}

function RangeBar({ best, median: med, worst }) {
  const span = worst - best || 1;
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--surface-2)', marginTop: 8 }} title={`Best ${fmtDuration(best)} · typical ${fmtDuration(med)} · worst ${fmtDuration(worst)}`}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 3, background: 'linear-gradient(90deg, var(--seq-2), var(--seq-4))', opacity: 0.6 }} />
      <div style={{ position: 'absolute', left: `calc(${((med - best) / span) * 100}% - 5px)`, top: -2, width: 10, height: 10, borderRadius: 5, background: 'var(--ink)', border: '2px solid var(--surface)' }} />
    </div>
  );
}
