import { useMemo } from 'react';
import { ChevronRight, ShieldCheck, Gauge, Clock3, Send, KeyRound } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Toggle } from '../components/ui.jsx';
import { ScoreRing } from '../components/Charts.jsx';
import { driverViolations } from '../lib/security.js';
import { weeklyReport } from '../lib/engagement.js';
import { fmtDay, fmtTime, fmtKm } from '../lib/format.js';
import { fmtINR } from '../lib/costs.js';

const DAY = 86_400_000;

function useDriverStats(driverId) {
  const { trips } = useApp();
  return useMemo(() => {
    const ts = trips.filter((t) => t.driver === driverId && t.start > Date.now() - 30 * DAY);
    const km = ts.reduce((a, t) => a + t.summary.distance, 0);
    const score = km ? Math.round(ts.reduce((a, t) => a + t.score * t.summary.distance, 0) / km) : null;
    return { trips: ts, km, score, last: ts[ts.length - 1] };
  }, [trips, driverId]);
}

function DriverRow({ d, push }) {
  const st = useDriverStats(d.id);
  return (
    <button className="list-item" onClick={() => push('driver', { id: d.id })}>
      <div className="glyph" style={{ background: `color-mix(in srgb, ${d.color} 20%, transparent)`, color: d.color, fontWeight: 750 }}>{d.name[0]}</div>
      <div className="grow">
        <div className="title row" style={{ gap: 6 }}>{d.name}{d.rules?.enabled && <span className="badge warn">New-driver rules</span>}</div>
        <div className="meta num">{d.role} · {st.trips.length} trips · {fmtKm(st.km, 0)} in 30 days</div>
      </div>
      {st.score != null && <ScoreRing value={st.score} size={36} stroke={3.5} />}
      <ChevronRight className="chev" size={18} />
    </button>
  );
}

export default function Drivers({ pop, push }) {
  const { drivers } = useApp();
  return (
    <div className="screen pushed">
      <NavBar title="Drivers" onBack={pop} />
      <div className="muted" style={{ fontSize: 13, margin: '0 4px 12px' }}>The tracker knows who is driving from their phone's Bluetooth, a key fob or an RFID tag tapped on the reader.</div>
      <div className="list">{drivers.map((d) => <DriverRow key={d.id} d={d} push={push} />)}</div>
    </div>
  );
}

export function DriverDetail({ id, pop, push }) {
  const { drivers, setDrivers, settings, setToast, placeNameAt } = useApp();
  const d = drivers.find((x) => x.id === id);
  const st = useDriverStats(id);
  const { trips } = useApp();
  const rules = d.rules ?? {};
  const setRules = (patch) => setDrivers((list) => list.map((x) => (x.id === id ? { ...x, rules: { ...x.rules, ...patch } } : x)));
  const violations = useMemo(() => (rules.enabled ? st.trips.flatMap((t) => driverViolations(t, rules).map((v) => ({ ...v, trip: t }))) : []), [st.trips, rules]);
  const report = useMemo(() => weeklyReport(trips, { fuel: settings.fuel, parkingFees: settings.parkingFees, driver: id }), [trips, settings.fuel, settings.parkingFees, id]);
  const owner = drivers.find((x) => x.role === 'Owner');

  const reportText = `${d.name}'s week (${fmtDay(report.start)}–${fmtDay(report.end)}): ${report.trips} trips, ${Math.round(report.km)} km, ${fmtINR(report.cost)}${report.score != null ? `, safety score ${report.score}` : ''}. ${violations.filter((v) => v.t > report.start).length} rule breaks.`;

  return (
    <div className="screen pushed">
      <NavBar title={d.name} onBack={pop} />
      <div className="card fade">
        <div className="row">
          <div className="glyph" style={{ width: 52, height: 52, borderRadius: 18, fontSize: 22, fontWeight: 750, background: `color-mix(in srgb, ${d.color} 20%, transparent)`, color: d.color }}>{d.name[0]}</div>
          <div className="grow">
            <div style={{ fontWeight: 750, fontSize: 19 }}>{d.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>{d.role}</div>
            <div className="muted row" style={{ gap: 5, fontSize: 12.5 }}><KeyRound size={12} /> Identified by {d.key}</div>
          </div>
          {st.score != null && <ScoreRing value={st.score} size={54} stroke={5} />}
        </div>
        <div className="grid-3" style={{ marginTop: 14 }}>
          <div><div className="muted" style={{ fontSize: 11.5 }}>Trips (30 d)</div><div className="num" style={{ fontWeight: 700 }}>{st.trips.length}</div></div>
          <div><div className="muted" style={{ fontSize: 11.5 }}>Distance</div><div className="num" style={{ fontWeight: 700 }}>{fmtKm(st.km, 0)}</div></div>
          <div><div className="muted" style={{ fontSize: 11.5 }}>Last drove</div><div className="num" style={{ fontWeight: 700 }}>{st.last ? fmtDay(st.last.start) : '—'}</div></div>
        </div>
      </div>

      <SectionTitle>New-driver mode</SectionTitle>
      <div className="card stack">
        <div className="row">
          <div className="glyph warn"><ShieldCheck size={18} /></div>
          <div className="grow"><div style={{ fontWeight: 650 }}>Rules for {d.name}</div><div className="muted" style={{ fontSize: 12.5 }}>Alerts you when a rule is broken</div></div>
          <Toggle on={!!rules.enabled} label="New-driver mode" onChange={(v) => setRules({ enabled: v })} />
        </div>
        {rules.enabled && (
          <>
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 6, fontWeight: 600 }}><Gauge size={15} /> Speed limit</span><b className="num" style={{ color: 'var(--accent)' }}>{rules.maxKmh} km/h</b></div>
              <input className="slider" type="range" min={40} max={100} step={5} value={rules.maxKmh} onChange={(e) => setRules({ maxKmh: Number(e.target.value) })} aria-label="Speed limit" />
            </div>
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 6, fontWeight: 600 }}><Clock3 size={15} /> Curfew</span><b className="num" style={{ color: 'var(--accent)' }}>{rules.curfewFrom}:00 – {rules.curfewTo}:00</b></div>
              <div className="grid-2">
                <input className="slider" type="range" min={18} max={24} value={rules.curfewFrom} onChange={(e) => setRules({ curfewFrom: Number(e.target.value) % 24 })} aria-label="Curfew starts" />
                <input className="slider" type="range" min={4} max={8} value={rules.curfewTo} onChange={(e) => setRules({ curfewTo: Number(e.target.value) })} aria-label="Curfew ends" />
              </div>
            </div>
            <div className="row">
              <div className="grow"><div style={{ fontWeight: 600 }}>Weekly report to {owner?.name ?? 'owner'}</div><div className="muted" style={{ fontSize: 12.5 }}>Every Sunday at 8 PM</div></div>
              <Toggle on={!!rules.weeklyReport} label="Weekly report" onChange={(v) => setRules({ weeklyReport: v })} />
            </div>
          </>
        )}
      </div>

      {rules.enabled && (
        <>
          <SectionTitle>{violations.length ? `Rule breaks (${violations.length})` : 'Rule breaks'}</SectionTitle>
          <div className="list">
            {[...violations].reverse().slice(0, 12).map((v, i) => (
              <button key={i} className="list-item" onClick={() => push('trip', { id: v.trip.id })}>
                <div className="glyph warn">{v.type === 'curfew' ? <Clock3 size={17} /> : <Gauge size={17} />}</div>
                <div className="grow"><div className="title" style={{ fontSize: 14 }}>{v.detail}</div><div className="meta">{fmtDay(v.t)} · {placeNameAt(v.trip.samples[0]) ?? 'Unknown'} → {placeNameAt(v.trip.samples[v.trip.samples.length - 1]) ?? 'Roadside'}</div></div>
              </button>
            ))}
            {!violations.length && <div className="list-item muted">No rule breaks in 30 days.</div>}
          </div>
        </>
      )}

      <SectionTitle action="Full report" onAction={() => push('weekly', { driver: id })}>This week</SectionTitle>
      <div className="card">
        <div style={{ fontSize: 14 }}>{reportText}</div>
        <button className="btn small" style={{ marginTop: 12 }} onClick={async () => { try { if (navigator.share) await navigator.share({ title: `${d.name}'s week`, text: reportText }); else { await navigator.clipboard.writeText(reportText); setToast('Report copied'); } } catch { /* cancelled */ } }}>
          <Send size={15} /> Send now
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Most recent trip {st.last ? `${fmtDay(st.last.start)}, ${fmtTime(st.last.start)}` : '—'}</div>
    </div>
  );
}
