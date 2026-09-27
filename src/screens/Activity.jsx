import { useMemo, useState } from 'react';
import { ParkingSquare, Timer, FileSpreadsheet, FileText, Play, ChevronRight } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented } from '../components/ui.jsx';
import MapView, { Route, Pin, boundsOf } from '../components/MapView.jsx';
import { STATE_META, stateTimeline, stateTotals, stopReport, dayBounds, liveState } from '../lib/stops.js';
import { describePoint } from '../data/cityModel.js';
import { fmtDay, fmtDuration, fmtTime } from '../lib/format.js';
import { fmtINR } from '../lib/costs.js';
import { exportPdf, exportXlsx } from '../lib/exporters.js';

const DAY = 86_400_000;
const MIN_OPTIONS = [2, 5, 15, 30];

function Timeline({ segments, from, onPick, picked }) {
  const pct = (t) => ((t - from) / DAY) * 100;
  return (
    <div>
      <div style={{ position: 'relative', height: 34, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }} role="img" aria-label="Vehicle state over the day">
        {segments.map((s, i) => (
          <button
            key={i}
            aria-label={`${STATE_META[s.state].label} ${fmtTime(s.from)} to ${fmtTime(s.to)}`}
            onClick={() => onPick(i)}
            onPointerEnter={() => onPick(i)}
            style={{
              position: 'absolute', top: 0, bottom: 0, left: `${pct(s.from)}%`, width: `max(1.5px, ${pct(s.to) - pct(s.from)}%)`,
              background: STATE_META[s.state].color, opacity: picked == null || picked === i ? 1 : 0.55,
              outline: picked === i ? '2px solid var(--ink)' : 'none', outlineOffset: -2,
            }}
          />
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
        {['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'].map((l, i) => <span key={i} className="num">{l}</span>)}
      </div>
    </div>
  );
}

export default function Activity({ pop, push }) {
  const { trips, settings, setSettings, live, controls, placeNameAt, vehicle, setToast } = useApp();
  const today = dayBounds(Date.now())[0];
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState(null);
  const minStop = settings.stopMinMin ?? 2;
  const [from, to] = [day, day + DAY];
  const end = Math.min(to, Date.now());

  const timeline = useMemo(() => stateTimeline(trips, from, end), [trips, from, end]);
  const totals = useMemo(() => stateTotals(timeline), [timeline]);
  const stops = useMemo(() => stopReport(trips, from, to, { minStopSec: minStop * 60, minIdleSec: 180 }), [trips, from, to, minStop]);
  const shown = stops.filter((s) => filter === 'all' || s.kind === filter);
  const dayTrips = trips.filter((t) => t.start >= from && t.start < to);
  const km = dayTrips.reduce((a, t) => a + t.summary.distance, 0) / 1000;
  const idleCost = (totals.idle / 3600) * settings.fuel.idleLph * settings.fuel.pricePerL;
  const now = liveState(live.samples, live.idx, { engineOn: controls.engine === 'on' });
  const seg = picked != null ? timeline[picked] : null;
  const name = (p) => (p?.x != null ? placeNameAt(p) ?? describePoint(p) : '—');
  const allPts = dayTrips.flatMap((t) => t.samples.filter((_, i) => i % 10 === 0));

  const exportRows = () => ({
    columns: [
      { header: '#', key: 'n', width: 4, type: 'number' },
      { header: 'Type', key: 'kind', width: 9 },
      { header: 'Place', key: 'place', width: 26 },
      { header: 'Arrived', key: 'arrive', width: 10 },
      { header: 'Left', key: 'leave', width: 10 },
      { header: 'Duration', key: 'dur', width: 10 },
      { header: 'Engine', key: 'engine', width: 8 },
    ],
    rows: shown.map((s, i) => ({ n: i + 1, kind: s.kind === 'parked' ? 'Parked' : 'Idling', place: name(s), arrive: fmtTime(s.arrive), leave: s.leave ? fmtTime(s.leave) : 'now', dur: fmtDuration(s.sec), engine: s.kind === 'parked' ? 'Off' : 'On' })),
  });
  const doExport = async (kind) => {
    const { columns, rows } = exportRows();
    const d = new Date(day).toISOString().slice(0, 10);
    const title = `Stop report · ${fmtDay(day)} · ${vehicle.plate}`;
    try {
      if (kind === 'xlsx') await exportXlsx({ fileName: `stops-${d}.xlsx`, title, columns, rows });
      else await exportPdf({ fileName: `stops-${d}.pdf`, title, subtitle: `Running ${fmtDuration(totals.running)} · Idle ${fmtDuration(totals.idle)} · Stopped ${fmtDuration(totals.stopped)} · ${km.toFixed(1)} km`, columns, rows });
      setToast('Stop report downloaded');
    } catch {
      setToast('Export failed — try again');
    }
  };

  return (
    <div className="screen pushed">
      <NavBar title="Stops & activity" onBack={pop} />
      <div className="chips" style={{ marginBottom: 12 }}>
        {Array.from({ length: 7 }, (_, i) => today - i * DAY).map((d) => (
          <button key={d} className={`chip ${day === d ? 'on' : ''}`} onClick={() => { setDay(d); setPicked(null); }}>{fmtDay(d)}</button>
        ))}
      </div>

      {day === today && (
        <div className="card fade" style={{ marginBottom: 12 }}>
          <div className="row">
            <div className="glyph" style={{ background: `color-mix(in srgb, ${STATE_META[now.state].color} 22%, transparent)`, color: now.state === 'stopped' ? 'var(--ink-2)' : STATE_META[now.state].color }}>
              {now.state === 'running' ? <Play size={18} /> : now.state === 'idle' ? <Timer size={18} /> : <ParkingSquare size={18} />}
            </div>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>Now: {STATE_META[now.state].label}{now.waiting ? ' (at a signal)' : ''}</div>
              <div className="muted num" style={{ fontSize: 12.5 }}>{now.state === 'stopped' ? 'Ignition off' : `${fmtDuration(now.sec)} · ${Math.round(live.cur.v)} km/h · ${describePoint(live.cur)}`}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <Timeline segments={timeline} from={from} onPick={setPicked} picked={picked} />
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8, minHeight: 18 }}>
          {seg ? `${STATE_META[seg.state].label} ${fmtTime(seg.from)}–${fmtTime(seg.to)} · ${fmtDuration((seg.to - seg.from) / 1000)}${seg.state !== 'running' ? ` · ${name(seg)}` : ''}` : 'Tap the bar to see each period'}
        </div>
        <div className="grid-3" style={{ marginTop: 10 }}>
          {['running', 'idle', 'stopped'].map((k) => (
            <div key={k}>
              <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: STATE_META[k].color, display: 'inline-block', border: '1px solid var(--hairline)' }} />{STATE_META[k].label}
              </div>
              <div className="num" style={{ fontWeight: 750, fontSize: 18 }}>{fmtDuration(totals[k])}</div>
            </div>
          ))}
        </div>
        <div className="muted num" style={{ fontSize: 12.5, marginTop: 10 }}>
          {dayTrips.length} trips · {km.toFixed(1)} km · {stops.filter((s) => s.kind === 'parked').length} stops · idling cost ≈ {fmtINR(idleCost)}
        </div>
      </div>

      {allPts.length > 1 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
          <MapView fitKey={`day${day}`} fit={boundsOf([...allPts, ...stops])} style={{ height: 240 }}>
            {(k) => (
              <>
                {dayTrips.map((t) => <Route key={t.id} points={t.samples} k={k} width={3.5} step={3} opacity={0.8} />)}
                {shown.map((s, i) => (
                  <g key={i}>
                    <circle cx={s.x} cy={s.y} r={11 * k} fill={s.kind === 'parked' ? 'var(--ink)' : 'var(--warning)'} stroke="var(--surface)" strokeWidth={2 * k} />
                    <text x={s.x} y={s.y + 4 * k} textAnchor="middle" fontSize={11 * k} fontWeight={750} fill={s.kind === 'parked' ? 'var(--page)' : '#1a1200'}>{i + 1}</text>
                  </g>
                ))}
              </>
            )}
          </MapView>
        </div>
      )}

      <SectionTitle>Stop report</SectionTitle>
      <Segmented options={[{ value: 'all', label: 'All' }, { value: 'parked', label: 'Parked' }, { value: 'idle', label: 'Idling' }]} value={filter} onChange={setFilter} />
      <div className="row" style={{ gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12.5 }}>Shortest stop:</span>
        {MIN_OPTIONS.map((m) => <button key={m} className={`chip ${minStop === m ? 'on' : ''}`} style={{ height: 28, fontSize: 12.5 }} onClick={() => setSettings({ ...settings, stopMinMin: m })}>{m} min</button>)}
      </div>
      <div className="list">
        {shown.map((s, i) => (
          <button key={i} className="list-item" onClick={() => push('trip', { id: s.kind === 'parked' ? s.nextTripId ?? s.tripId : s.tripId })}>
            <div className="glyph" style={{ background: s.kind === 'parked' ? 'var(--surface-2)' : 'var(--warning-soft)', color: s.kind === 'parked' ? 'var(--ink)' : 'var(--warning)', fontWeight: 750 }}>{i + 1}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="title ellipsis">{name(s)}</div>
              <div className="meta num">
                {s.kind === 'parked' ? 'Parked · engine off' : 'Idling · engine on'} · {fmtTime(s.arrive)} – {s.leave ? fmtTime(s.leave) : 'now'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontWeight: 700 }}>{fmtDuration(s.sec)}</div>
              {s.ongoing && <div className="badge good" style={{ marginTop: 2 }}>Now</div>}
            </div>
            <ChevronRight className="chev" size={16} />
          </button>
        ))}
        {!shown.length && <div className="list-item muted">No stops longer than {minStop} min.</div>}
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => doExport('xlsx')} disabled={!shown.length}><FileSpreadsheet size={18} /> Excel</button>
        <button className="btn" onClick={() => doExport('pdf')} disabled={!shown.length}><FileText size={18} /> PDF</button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Running = moving with the engine on. Idle = engine on but standing still for 20 s or more (idling over 3 min is listed as a stop). Stopped = ignition off. You get an alert after {settings.idleAlertMin} min of idling (change in Settings).
      </div>
    </div>
  );
}
