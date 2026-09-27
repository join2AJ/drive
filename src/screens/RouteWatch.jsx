import { useMemo } from 'react';
import { AlarmClock, Route as RouteIcon, CheckCircle2, AlertTriangle, Shuffle } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Toggle } from '../components/ui.jsx';
import MapView, { Route, Vehicle, Pin, boundsOf, pathD } from '../components/MapView.jsx';
import { PlaceIcon } from '../components/ui.jsx';
import { describePoint } from '../data/cityModel.js';
import { fmtClock, fmtDuration } from '../lib/format.js';

function Slider({ label, value, min, max, step, unit, onChange, hint }) {
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>{label}</span><b className="num" style={{ color: 'var(--accent)' }}>{value}{unit}</b></div>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

export default function RouteWatch({ pop }) {
  const { live, plannedRoute, routeWatch, setRouteWatch, routeState, placeAt, setToast } = useApp();
  const set = (patch) => setRouteWatch({ ...routeWatch, ...patch });
  const off0 = !!routeState.current;
  // Re-frame to include the detour when the car leaves the route.
  const fit = useMemo(() => boundsOf(off0 ? [...live.planned, ...live.trail.slice(-300)] : live.planned), [live.planned, off0]); // eslint-disable-line react-hooks/exhaustive-deps
  const plannedD = useMemo(() => pathD(plannedRoute), [plannedRoute]);
  const dest = live.planned[live.planned.length - 1];
  const origin = live.planned[0];
  const off = routeState.current;
  const status = !routeWatch.enabled ? 'off' : off ? (off.alarmed ? 'alarm' : 'drifting') : 'ok';

  return (
    <div className="screen pushed">
      <NavBar title="Route watch" onBack={pop} />

      <div className={`banner ${status === 'ok' ? 'info' : ''} fade`} style={status === 'drifting' ? { background: 'var(--warning-soft)', borderColor: 'color-mix(in srgb, var(--warning) 45%, transparent)' } : status === 'off' ? { background: 'var(--surface)', borderColor: 'var(--hairline)' } : undefined}>
        <div className={`glyph ${status === 'ok' ? 'good' : status === 'off' ? '' : status === 'drifting' ? 'warn' : 'crit'}`}>
          {status === 'ok' ? <CheckCircle2 size={18} /> : status === 'off' ? <RouteIcon size={18} /> : <AlertTriangle size={18} />}
        </div>
        <div className="grow">
          <div style={{ fontWeight: 700 }}>
            {status === 'ok' && 'On route'}
            {status === 'off' && 'Route watch is off'}
            {status === 'drifting' && `Leaving the route · ${Math.round(routeState.dist)} m off`}
            {status === 'alarm' && `Off route · ${Math.round(routeState.dist)} m away`}
          </div>
          <div className="ink2 num" style={{ fontSize: 13 }}>
            {placeAt(origin)?.name ?? 'Start'} → {placeAt(dest)?.name ?? 'Destination'} · {status === 'ok' ? `${Math.round(routeState.dist)} m from the planned line` : status === 'drifting' ? `alarm in ${Math.max(0, Math.ceil(routeWatch.graceSec - (live.now - routeState.offSince) / 1000))} s unless it returns` : status === 'alarm' ? `since ${fmtClock(off.from)}` : 'Turn it on below'}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <MapView fitKey={off0 ? 'rw-off' : 'rw'} fit={fit} style={{ height: 320 }}>
          {(k) => (
            <>
              <path d={plannedD} stroke="var(--violet)" strokeOpacity={0.16} strokeWidth={routeWatch.corridorM * 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d={plannedD} stroke="var(--violet)" strokeWidth={2.5 * k} strokeDasharray={`${6 * k} ${5 * k}`} fill="none" />
              <Route points={live.trail} k={k} width={4.5} color={off ? 'var(--warning)' : 'var(--accent)'} step={2} />
              <Pin x={dest.x} y={dest.y} k={k} color="var(--violet)" icon={<PlaceIcon name={placeAt(dest)?.icon ?? 'home'} size={24} />} />
              <Vehicle x={live.cur.x} y={live.cur.y} heading={live.heading} k={k} color={off ? 'var(--warning)' : 'var(--accent)'} />
            </>
          )}
        </MapView>
        <div className="legend" style={{ padding: '0 12px 12px' }}>
          <span><i style={{ background: 'var(--violet)' }} />Planned route</span>
          <span><i className="box" style={{ background: 'var(--violet)', opacity: 0.3 }} />Allowed corridor</span>
          <span><i style={{ background: 'var(--accent)' }} />Actual</span>
        </div>
      </div>

      <SectionTitle>Alarm rules</SectionTitle>
      <div className="card stack">
        <div className="row">
          <div className="glyph warn"><AlarmClock size={18} /></div>
          <div className="grow"><div style={{ fontWeight: 650 }}>Watch this route</div><div className="muted" style={{ fontSize: 12.5 }}>For drivers, deliveries, school runs and taxis</div></div>
          <Toggle on={routeWatch.enabled} label="Route watch" onChange={(v) => set({ enabled: v })} />
        </div>
        <Slider label="Allowed distance from route" value={routeWatch.corridorM} min={50} max={1000} step={50} unit=" m" onChange={(v) => set({ corridorM: v })} hint="Wider for highways and GPS drift in dense areas" />
        <Slider label="Grace time before alarm" value={routeWatch.graceSec} min={5} max={180} step={5} unit=" s" onChange={(v) => set({ graceSec: v })} hint="Ignores quick detours around a blocked lane" />
        <div className="row"><span className="grow" style={{ fontWeight: 600 }}>Loud alarm sound</span><Toggle on={routeWatch.sound} label="Alarm sound" onChange={(v) => set({ sound: v })} /></div>
        <div className="row"><span className="grow" style={{ fontWeight: 600 }}>Also alert emergency contacts</span><Toggle on={routeWatch.notifyContacts} label="Alert contacts" onChange={(v) => set({ notifyContacts: v })} /></div>
      </div>

      <button className="btn" style={{ marginTop: 14 }} onClick={() => { live.simulateDetour(); setToast('Demo: driver takes a detour'); }}><Shuffle size={18} /> Simulate a detour</button>

      <SectionTitle>Deviations</SectionTitle>
      <div className="list">
        {off && (
          <div className="list-item"><div className="glyph warn"><AlertTriangle size={17} /></div><div className="grow"><div className="title">Off route now</div><div className="meta num">Since {fmtClock(off.from)} · up to {Math.round(off.maxOff)} m · {describePoint(live.cur)}</div></div></div>
        )}
        {routeState.log.map((d, i) => (
          <div key={i} className="list-item"><div className="glyph warn"><AlertTriangle size={17} /></div><div className="grow"><div className="title">Left route for {fmtDuration((d.to - d.from) / 1000)}</div><div className="meta num">{fmtClock(d.from)}–{fmtClock(d.to)} · up to {Math.round(d.maxOff)} m · near {describePoint(d)}</div></div></div>
        ))}
        {!off && !routeState.log.length && <div className="list-item muted">No deviations on this trip.</div>}
      </div>
    </div>
  );
}
