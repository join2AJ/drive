import { useMemo, useState } from 'react';
import { Circle, Route as RouteIcon, PenTool, Plus, Undo2, Trash2, MapPin, Car, LogIn, LogOut } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented, Toggle } from '../components/ui.jsx';
import MapView, { Fence, Pin, Vehicle } from '../components/MapView.jsx';
import { TRAFFIC, driveZone, fenceBounds, fenceSummary, geofenceTransitions } from '../lib/geofence.js';
import { describePoint } from '../data/cityModel.js';
import { fmtDay, fmtTime } from '../lib/format.js';

export const FENCE_TYPES = {
  circle: { label: 'Circle', icon: Circle, hint: 'A fixed radius around a point (air distance).' },
  drive: { label: 'Drive time', icon: RouteIcon, hint: 'Everywhere the car can reach by road in N minutes.' },
  polygon: { label: 'Draw', icon: PenTool, hint: 'Your own shape — tap the map to add corners.' },
};

const CITY = { minX: -200, minY: -200, maxX: 8900, maxY: 12100 };

export default function Geofences({ pop, push }) {
  const { fences, setFences } = useApp();
  return (
    <div className="screen pushed">
      <NavBar title="Geofences" onBack={pop} right={<button className="icon-btn ghost" aria-label="New geofence" onClick={() => push('fence', { id: null })}><Plus size={22} /></button>} />
      <div className="card fade" style={{ padding: 0, overflow: 'hidden' }}>
        <MapView fitKey="fences" fit={CITY} style={{ height: 260 }} detail={false} controls={false}>
          {(k) => fences.map((f) => <Fence key={f.id} f={f} k={k} active={f.enabled} />)}
        </MapView>
      </div>

      <div className="grid-3" style={{ marginTop: 12 }}>
        {Object.entries(FENCE_TYPES).map(([key, t]) => (
          <button key={key} className="hub-tile" style={{ minHeight: 0, padding: 12 }} onClick={() => push('fence', { id: null, type: key })}>
            <t.icon size={18} color="var(--violet)" />
            <div className="t" style={{ fontSize: 13 }}>{t.label}</div>
            <div className="m" style={{ fontSize: 11 }}>{t.hint}</div>
          </button>
        ))}
      </div>

      <SectionTitle>Your zones</SectionTitle>
      <div className="list">
        {fences.map((f) => {
          const T = FENCE_TYPES[f.type ?? 'circle'];
          return (
            <div key={f.id} className="list-item">
              <div className="glyph violet"><T.icon size={18} /></div>
              <button className="grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => push('fence', { id: f.id })}>
                <div className="title ellipsis">{f.name}</div>
                <div className="meta">{fenceSummary(f)}</div>
                <div className="meta">Alerts on {[f.alertEnter !== false && 'enter', f.alertExit !== false && 'exit'].filter(Boolean).join(' & ') || 'nothing'}</div>
              </button>
              <Toggle on={f.enabled} label={`${f.name} enabled`} onChange={(on) => setFences(fences.map((x) => (x.id === f.id ? { ...x, enabled: on } : x)))} />
            </div>
          );
        })}
        {!fences.length && <div className="list-item muted">No geofences yet. Tap + to add one.</div>}
      </div>
    </div>
  );
}

export function FenceEditor({ id, type: initialType, pop }) {
  const { fences, setFences, savedPlaces, live, trips, setToast, placeNameAt } = useApp();
  const existing = fences.find((f) => f.id === id);
  const start = savedPlaces.find((p) => p.key === 'home');
  const [f, setF] = useState(() => existing ?? {
    id: `g${Date.now()}`, name: '', type: initialType ?? 'circle', enabled: true, alertEnter: true, alertExit: true,
    x: start.x, y: start.y, radius: 600, minutes: 15, traffic: 'normal', points: [],
  });
  const [fitKey, setFitKey] = useState(0);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const zone = useMemo(() => (f.type === 'drive' ? driveZone(f, f.minutes, f.traffic) : null), [f]);
  const fit = useMemo(() => {
    if (f.type === 'polygon' && (f.points?.length ?? 0) < 3) return { minX: f.x - 1500, maxX: f.x + 1500, minY: f.y - 1500, maxY: f.y + 1500 };
    return fenceBounds(f);
    // Only refit when asked (type change / new centre), not on every slider move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, f.type]);

  const onMapClick = (p) => {
    if (f.type === 'polygon') set({ points: [...(f.points ?? []), p] });
    else set({ x: p.x, y: p.y });
  };
  const centreOn = (p) => { set({ x: p.x, y: p.y }); setFitKey((n) => n + 1); };

  const history = useMemo(() => {
    if (!existing) return [];
    const week = trips.filter((t) => t.start > Date.now() - 7 * 86_400_000);
    return geofenceTransitions(week, [{ ...f, enabled: true, alertEnter: true, alertExit: true }]).slice(-6).reverse();
  }, [existing, f, trips]);

  const valid = f.name.trim() && (f.type !== 'polygon' || (f.points?.length ?? 0) >= 3);
  const save = () => {
    const clean = { ...f, name: f.name.trim() };
    if (clean.type === 'polygon') {
      clean.x = clean.points.reduce((a, p) => a + p.x, 0) / clean.points.length;
      clean.y = clean.points.reduce((a, p) => a + p.y, 0) / clean.points.length;
    }
    setFences(existing ? fences.map((x) => (x.id === f.id ? clean : x)) : [...fences, clean]);
    setToast(`${clean.name} saved`);
    pop();
  };


  return (
    <div className="screen pushed">
      <NavBar title={existing ? existing.name : 'New geofence'} onBack={pop} />
      <Segmented options={Object.entries(FENCE_TYPES).map(([value, t]) => ({ value, label: t.label }))} value={f.type} onChange={(v) => { set({ type: v }); setFitKey((n) => n + 1); }} />
      <div className="muted" style={{ fontSize: 12.5, margin: '8px 4px 10px' }}>{FENCE_TYPES[f.type].hint} {f.type !== 'polygon' ? 'Tap the map to move the centre.' : ''}</div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapView fitKey={`edit${fitKey}${f.type}`} fit={fit} style={{ height: 330 }} onMapClick={onMapClick}>
          {(k) => (
            <>
              <Fence f={f} k={k} label={f.name || undefined} editing color="var(--violet)" />
              {f.type !== 'polygon' && <Pin x={f.x} y={f.y} k={k} size={22} color="var(--violet)" icon={<MapPin size={24} />} />}
              <Vehicle x={live.cur.x} y={live.cur.y} heading={live.heading} k={k} pulse={false} />
            </>
          )}
        </MapView>
      </div>

      {f.type !== 'polygon' && (
        <div className="chips" style={{ marginTop: 10 }}>
          <button className="chip" onClick={() => centreOn(live.cur)}><Car size={14} /> Car now</button>
          {savedPlaces.filter((p) => p.name).map((p) => <button key={p.key} className="chip" onClick={() => centreOn(p)}>{p.name}</button>)}
        </div>
      )}

      <div className="card stack" style={{ marginTop: 12 }}>
        <div className="field"><label htmlFor="fname">Name</label><input id="fname" value={f.name} placeholder={f.type === 'drive' ? 'e.g. 30 min from Home' : 'e.g. School'} onChange={(e) => set({ name: e.target.value })} /></div>

        {f.type === 'circle' && (
          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>Radius</span><b className="num" style={{ color: 'var(--accent)' }}>{f.radius >= 1000 ? `${(f.radius / 1000).toFixed(1)} km` : `${f.radius} m`}</b></div>
            <input className="slider" type="range" min={100} max={5000} step={50} value={f.radius} onChange={(e) => set({ radius: Number(e.target.value) })} aria-label="Radius" />
            <div className="muted" style={{ fontSize: 12 }}>Centre: {placeNameAt(f) ?? describePoint(f)}</div>
          </div>
        )}

        {f.type === 'drive' && zone && (
          <>
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>Drive time</span><b className="num" style={{ color: 'var(--accent)' }}>{f.minutes} min</b></div>
              <input className="slider" type="range" min={5} max={60} step={5} value={f.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} aria-label="Drive time" />
            </div>
            <div>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Traffic</div>
              <Segmented options={Object.entries(TRAFFIC).map(([value, t]) => ({ value, label: t.label }))} value={f.traffic} onChange={(v) => set({ traffic: v })} />
            </div>
            <div className="banner info" style={{ padding: 12 }}>
              <div className="ink2" style={{ fontSize: 13 }}>
                In {f.minutes} min from {placeNameAt(f) ?? describePoint(f)} the car can get at most <b className="num" style={{ color: 'var(--ink)' }}>{zone.reachKm.toFixed(1)} km away</b> in a straight line, over {Math.round(zone.roadKm)} km of roads. The zone follows the roads, so a place only 2 km away by air stays outside if the drive there takes longer.
              </div>
            </div>
          </>
        )}

        {f.type === 'polygon' && (
          <div className="row" style={{ gap: 8 }}>
            <span className="grow muted" style={{ fontSize: 13 }}>{(f.points?.length ?? 0) < 3 ? `Tap at least ${3 - (f.points?.length ?? 0)} more point${3 - (f.points?.length ?? 0) === 1 ? '' : 's'} on the map` : `${f.points.length} corners`}</span>
            <button className="btn small" disabled={!f.points?.length} onClick={() => set({ points: f.points.slice(0, -1) })}><Undo2 size={15} /> Undo</button>
            <button className="btn small" disabled={!f.points?.length} onClick={() => set({ points: [] })}>Clear</button>
          </div>
        )}

        <div className="row"><LogIn size={16} className="muted" /><span className="grow" style={{ fontWeight: 600 }}>Alert when the car enters</span><Toggle on={f.alertEnter !== false} label="Alert on enter" onChange={(v) => set({ alertEnter: v })} /></div>
        <div className="row"><LogOut size={16} className="muted" /><span className="grow" style={{ fontWeight: 600 }}>Alert when the car leaves</span><Toggle on={f.alertExit !== false} label="Alert on exit" onChange={(v) => set({ alertExit: v })} /></div>
      </div>

      <button className="btn primary" style={{ marginTop: 14 }} disabled={!valid} onClick={save}>{existing ? 'Save changes' : 'Create geofence'}</button>
      {!valid && <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>{!f.name.trim() ? 'Give it a name' : 'Draw at least 3 corners'}</div>}

      {existing && (
        <>
          <SectionTitle>Last 7 days</SectionTitle>
          <div className="list">
            {history.map((h, i) => (
              <div key={i} className="list-item plain">
                {h.type === 'geofence_enter' ? <LogIn size={16} color="var(--violet)" /> : <LogOut size={16} color="var(--violet)" />}
                <div className="grow"><div className="title" style={{ fontSize: 14 }}>{h.type === 'geofence_enter' ? 'Entered' : 'Left'}</div><div className="meta">{describePoint(h)}</div></div>
                <span className="muted num" style={{ fontSize: 12 }}>{fmtDay(h.t)}, {fmtTime(h.t)}</span>
              </div>
            ))}
            {!history.length && <div className="list-item muted">No crossings this week.</div>}
          </div>
          <button className="btn" style={{ marginTop: 14, color: 'var(--critical-ink)' }} onClick={() => { setFences(fences.filter((x) => x.id !== f.id)); setToast('Geofence deleted'); pop(); }}><Trash2 size={16} /> Delete geofence</button>
        </>
      )}
    </div>
  );
}
