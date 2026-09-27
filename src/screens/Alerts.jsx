import { useMemo, useState } from 'react';
import { ChevronRight, Siren, Phone, Share2, Lock, Video, Mic, Check, FilePlus2, FolderOpen } from 'lucide-react';
import { IncidentList } from './Incidents.jsx';
import { roadAt, describePoint } from '../data/cityModel.js';
import { useApp } from '../state.jsx';
import { EVENT_META, EventGlyph, NavBar, SectionTitle } from '../components/ui.jsx';
import MapView, { Route, Pin } from '../components/MapView.jsx';
import { SpeedChart } from '../components/Charts.jsx';
import { eventLine } from './TripDetail.jsx';
import { fmtAgo, fmtClock, fmtDay, fmtTime, fmtDuration } from '../lib/format.js';
import { formatLatLng } from '../lib/geo.js';

const GROUPS = {
  all: () => true,
  safety: (a) => ['crash', 'harsh_brake', 'harsh_accel', 'overspeed'].includes(a.type),
  geofence: (a) => a.type.startsWith('geofence'),
  security: (a) => ['power_cut', 'tamper', 'tow', 'gps_jam', 'unusual_night'].includes(a.type),
  drivers: (a) => ['curfew', 'driver_speed'].includes(a.type),
  vehicle: (a) => ['ignition_on', 'ignition_off', 'low_battery', 'long_idle'].includes(a.type),
};

export default function Alerts({ push }) {
  const { alerts, placeNameAt, incidents } = useApp();
  const [group, setGroup] = useState('all');
  const [limit, setLimit] = useState(60);
  const list = useMemo(() => alerts.filter(GROUPS[group]), [alerts, group]);
  const crash = alerts.find((a) => a.type === 'crash');

  const days = [];
  for (const a of list.slice(0, limit)) {
    const d = fmtDay(a.t);
    if (!days.length || days[days.length - 1].d !== d) days.push({ d, items: [] });
    days[days.length - 1].items.push(a);
  }

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Alerts</h1>
        <button className="btn small danger" onClick={() => push('newIncident')}><FilePlus2 size={16} /> Log incident</button>
      </div>

      {incidents.length > 0 && (
        <>
          <div className="day-head" style={{ marginTop: 4 }}><span>Incidents & claims</span><span>{incidents.length}</span></div>
          <IncidentList push={push} />
          <div style={{ height: 14 }} />
        </>
      )}

      {crash && group !== 'geofence' && group !== 'vehicle' && (
        <button className="banner fade" onClick={() => push('incident', { alertId: crash.id })}>
          <div className="glyph crit"><Siren size={20} /></div>
          <div className="grow">
            <div style={{ fontWeight: 700 }}>Incident report ready</div>
            <div className="ink2" style={{ fontSize: 13 }}>Possible collision {fmtAgo(crash.t)} near {placeNameAt(crash) ?? roadAt(crash)?.name} · video & audio locked</div>
          </div>
          <ChevronRight className="chev" size={18} />
        </button>
      )}

      <div className="chips" style={{ marginTop: 14 }}>
        {[['all', 'All'], ['safety', 'Safety'], ['security', 'Theft & tamper'], ['drivers', 'Drivers'], ['geofence', 'Geofence'], ['vehicle', 'Vehicle']].map(([k, l]) => (
          <button key={k} className={`chip ${group === k ? 'on' : ''}`} onClick={() => setGroup(k)}>{l}</button>
        ))}
      </div>

      {days.map((d) => (
        <div key={d.d}>
          <div className="day-head"><span>{d.d}</span><span>{d.items.length}</span></div>
          <div className="list">
            {d.items.map((a) => (
              <button key={a.id} className="list-item" onClick={() => (a.type === 'crash' ? push('incident', { alertId: a.id }) : a.tripId ? push('trip', { id: a.tripId }) : null)}>
                <EventGlyph type={a.type} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="title grow ellipsis">{a.type.startsWith('geofence') ? `${a.type === 'geofence_enter' ? 'Arrived at' : 'Left'} ${a.fence}` : EVENT_META[a.type].label}</div>
                    <span className="muted num" style={{ fontSize: 12 }}>{fmtTime(a.t)}</span>
                  </div>
                  <div className="meta ellipsis num">{a.type.startsWith('geofence') ? `${a.fenceType === 'drive' ? 'Drive-time zone' : a.fenceType === 'polygon' ? 'Drawn zone' : 'Circle zone'} · ${describePoint(a)}` : eventLine(a) || (placeNameAt(a) ?? formatLatLng(a.x, a.y))}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {list.length > limit && <button className="btn" style={{ marginTop: 16 }} onClick={() => setLimit(limit + 60)}>Load more</button>}
    </div>
  );
}

export function Incident({ alertId, pop, push }) {
  const { alerts, tripById, media, settings, setToast, placeNameAt, incidents } = useApp();
  const caseFile = incidents.find((i) => i.autoKey === 'auto-crash');
  const a = alerts.find((x) => x.id === alertId) ?? alerts.find((x) => x.type === 'crash');
  const trip = tripById[a.tripId];
  const i0 = Math.max(0, a.i - 45);
  const i1 = Math.min(trip.samples.length - 1, a.i + 30);
  const window = trip.samples.slice(i0, i1 + 1);
  const approach = trip.samples.slice(Math.max(0, a.i - 90), a.i + 1);
  const evidence = media.filter((m) => m.tripId === trip.id && m.eventType === 'crash');
  const [acked, setAcked] = useState(false);

  const timeline = [
    { t: a.t - a.durationSec * 1000, text: `Travelling at ${Math.round(a.fromKmh)} km/h on ${roadAt(a)?.name ?? 'the road'}` },
    { t: a.t, text: `Speed collapsed to ${Math.round(a.toKmh)} km/h in ${a.durationSec.toFixed(1)} s (${a.gforce.toFixed(2)} g)` },
    { t: a.t + 1000, text: 'Dashcam & cabin audio locked (−15 s / +15 s)' },
    { t: a.t + 4000, text: 'Push alert + SMS sent to emergency contacts' },
    { t: a.t + a.stationarySec * 1000, text: `Vehicle stationary for ${fmtDuration(a.stationarySec)} afterwards, ignition still on` },
  ];

  return (
    <div className="screen pushed">
      <NavBar title="Incident report" onBack={pop} right={<button className="icon-btn ghost" aria-label="Share" onClick={() => setToast('PDF report shared')}><Share2 size={20} /></button>} />

      <div className="card fade" style={{ background: 'var(--critical-soft)', borderColor: 'color-mix(in srgb, var(--critical) 40%, transparent)' }}>
        <div className="row">
          <div className="glyph crit" style={{ width: 48, height: 48, borderRadius: 15, background: 'var(--critical)', color: '#fff' }}><Siren size={24} /></div>
          <div className="grow">
            <div style={{ fontSize: 19, fontWeight: 750 }}>Possible collision</div>
            <div className="ink2" style={{ fontSize: 13 }}>{fmtDay(a.t)}, {fmtClock(a.t)} · confidence {Math.round(a.confidence * 100)}%</div>
          </div>
        </div>
        <div className="grid-3" style={{ marginTop: 14 }}>
          {[
            [`${Math.round(a.fromKmh)}→${Math.round(a.toKmh)}`, 'km/h'],
            [`${a.durationSec.toFixed(1)} s`, 'to stop'],
            [`${a.gforce.toFixed(2)} g`, 'peak decel'],
          ].map(([v, l]) => (
            <div key={l} style={{ background: 'var(--surface)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div className="num" style={{ fontWeight: 750, fontSize: 18 }}>{v}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <MapView fit={{ minX: a.x - 500, maxX: a.x + 500, minY: a.y - 400, maxY: a.y + 400 }} fitKey={a.id} style={{ height: 200 }}>
          {(k) => (
            <>
              <Route points={approach} k={k} width={5} />
              <Pin x={a.x} y={a.y} k={k} color="var(--critical)" icon={<Siren size={24} />} size={28} />
            </>
          )}
        </MapView>
        <div className="row" style={{ padding: 12 }}>
          <div className="grow">
            <div style={{ fontWeight: 650, fontSize: 14 }}>{placeNameAt(a) ?? roadAt(a)?.name}</div>
            <div className="muted num" style={{ fontSize: 12 }}>{formatLatLng(a.x, a.y)}</div>
          </div>
          <button className="btn small" onClick={() => setToast('Opening navigation…')}>Navigate</button>
        </div>
      </div>

      <SectionTitle>Speed around impact</SectionTitle>
      <div className="card">
        <SpeedChart samples={window} events={[{ ...a, i: a.i - i0 }]} formatX={(t) => `${Math.round((t - a.t) / 1000)}s`} height={160} />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Detection rule: ≥ 60 km/h → ≤ 10 km/h within 2 s. Tune it in Settings.</div>
      </div>

      <SectionTitle>Evidence</SectionTitle>
      <div className="list">
        {evidence.map((m) => (
          <button key={m.id} className="list-item" onClick={() => push('media', { id: m.id })}>
            <div className="glyph crit">{m.kind === 'video' ? <Video size={18} /> : <Mic size={18} />}</div>
            <div className="grow">
              <div className="title">{m.camera}{m.kind === 'video' ? ' camera' : ''}</div>
              <div className="meta">{m.duration}s · {m.sizeMB} MB · <Lock size={11} style={{ display: 'inline', verticalAlign: -1 }} /> tamper-proof</div>
            </div>
            <ChevronRight className="chev" size={18} />
          </button>
        ))}
      </div>

      <SectionTitle>Timeline</SectionTitle>
      <div className="card">
        {timeline.map((s, n) => (
          <div key={n} className="row" style={{ alignItems: 'flex-start', gap: 12, paddingBottom: n < timeline.length - 1 ? 14 : 0, position: 'relative' }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, background: n === 1 ? 'var(--critical)' : 'var(--ink-3)', flex: 'none', boxShadow: '0 0 0 3px var(--surface)', zIndex: 1 }} />
            {n < timeline.length - 1 && <div style={{ position: 'absolute', left: 4.5, top: 12, bottom: -2, width: 1, background: 'var(--hairline)' }} />}
            <div className="grow">
              <div className="muted num" style={{ fontSize: 12 }}>{fmtClock(s.t)}</div>
              <div style={{ fontSize: 14 }}>{s.text}</div>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Actions</SectionTitle>
      <div className="stack">
        {caseFile && <button className="btn primary" onClick={() => push('case', { id: caseFile.id })}><FolderOpen size={18} /> Open claim case {caseFile.id}</button>}
        <button className="btn danger" onClick={() => setToast(`Calling ${settings.contacts[1]?.phone ?? '112'}…`)}><Phone size={18} /> Call emergency (112)</button>
                <button className="btn" onClick={() => { setAcked(true); setToast('Marked as resolved'); }} disabled={acked}><Check size={18} /> {acked ? 'Resolved' : 'Mark as false alarm / resolved'}</button>
      </div>
    </div>
  );
}
