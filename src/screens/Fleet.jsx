import { useMemo, useState } from 'react';
import { Car as CarIcon, CarTaxiFront, Bike, Bus, Truck, Plus, QrCode, Phone, Navigation, WifiOff, CircleDot } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Sheet } from '../components/ui.jsx';
import MapView, { Vehicle, Pin, boundsOf } from '../components/MapView.jsx';
import { STATE_META } from '../lib/stops.js';
import { fleetPosition } from '../data/fleet.js';
import { VEHICLE_TYPES, PLANS } from '../lib/plans.js';
import { describePoint } from '../data/cityModel.js';

export const TYPE_ICON = { car: CarIcon, taxi: CarTaxiFront, auto: CarTaxiFront, bike: Bike, bus: Bus, truck: Truck };
const STATES = { ...STATE_META, offline: { label: 'Offline', color: 'var(--ink-3)' } };

function AddVehicle({ open, onClose, onAdd }) {
  const [f, setF] = useState({ imei: '', type: 'taxi', plate: '', driver: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const valid = /^\d{15}$/.test(f.imei) && f.plate.trim().length >= 4;
  return (
    <Sheet open={open} onClose={onClose}>
      <h3>Add a vehicle</h3>
      <p className="muted" style={{ margin: '4px 0 14px', fontSize: 13.5 }}>Scan the QR on the tracker box or type the 15-digit IMEI printed on the label.</p>
      <div className="stack">
        <div className="row" style={{ gap: 8 }}>
          <div className="field grow"><label htmlFor="imei">Device IMEI</label><input id="imei" inputMode="numeric" maxLength={15} value={f.imei} placeholder="86xxxxxxxxxxxxx" onChange={(e) => set({ imei: e.target.value.replace(/\D/g, '') })} /></div>
          <button className="icon-btn" style={{ marginTop: 18 }} aria-label="Scan QR" onClick={() => set({ imei: `86${String(Math.floor(Math.random() * 1e13)).padStart(13, '0')}` })}><QrCode size={20} /></button>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Vehicle type</div>
          <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
            {Object.entries(VEHICLE_TYPES).map(([k, t]) => <button key={k} className={`chip ${f.type === k ? 'on' : ''}`} onClick={() => set({ type: k })}>{t.label}</button>)}
          </div>
        </div>
        <div className="field"><label htmlFor="plate">Number plate</label><input id="plate" value={f.plate} placeholder="KA 01 AB 1234" onChange={(e) => set({ plate: e.target.value.toUpperCase() })} /></div>
        <div className="field"><label htmlFor="drv">Driver (optional)</label><input id="drv" value={f.driver} placeholder="Name" onChange={(e) => set({ driver: e.target.value })} /></div>
        <button className="btn primary" disabled={!valid} onClick={() => { onAdd({ ...f, id: `A${Date.now()}`, added: Date.now() }); setF({ imei: '', type: f.type, plate: '', driver: '' }); }}>
          <Plus size={18} /> Add vehicle
        </button>
        <div className="muted" style={{ fontSize: 12 }}>The device appears on the map after its first GPS fix (usually under 2 minutes outdoors).</div>
      </div>
    </Sheet>
  );
}

export default function Fleet({ pop, push }) {
  const { fleet, live, account, addedVehicles, setAddedVehicles, setToast } = useApp();
  const [type, setType] = useState('all');
  const [state, setState] = useState('all');
  const [picked, setPicked] = useState(null);
  const [adding, setAdding] = useState(false);

  const nowSec = live.now / 1000;
  const rows = fleet.map((v) => ({ v, p: fleetPosition(v, nowSec) }));
  const fit = useMemo(() => boundsOf(fleet.map((v) => fleetPosition(v, 0))), [fleet]);
  const counts = rows.reduce((c, r) => ({ ...c, [r.p.state]: (c[r.p.state] ?? 0) + 1 }), {});
  const shown = rows.filter((r) => (type === 'all' || r.v.type === type) && (state === 'all' || r.p.state === state));
  const types = [...new Set(fleet.map((v) => v.type))];
  const kmToday = fleet.reduce((a, v) => a + v.kmToday, 0);
  const alertsToday = fleet.reduce((a, v) => a + v.alertsToday, 0);
  const sel = picked && rows.find((r) => r.v.id === picked);
  const plan = PLANS[account.plan];

  return (
    <div className="screen pushed">
      <NavBar title={account.company || 'Fleet'} onBack={pop} right={<button className="icon-btn" aria-label="Add vehicle" onClick={() => setAdding(true)}><Plus size={20} /></button>} />

      <div className="grid-4 fade">
        {['running', 'idle', 'stopped', 'offline'].map((s) => (
          <button key={s} className="stat" style={{ textAlign: 'left', borderColor: state === s ? STATES[s].color : undefined }} onClick={() => setState(state === s ? 'all' : s)}>
            <div className="label"><i style={{ width: 8, height: 8, borderRadius: 4, background: STATES[s].color, flex: 'none' }} />{STATES[s].label}</div>
            <div className="value num">{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <MapView fitKey="fleet" fit={fit} style={{ height: 300 }}>
          {(k) => (
            <>
              {shown.map(({ v, p }) => (p.state === 'running'
                ? <Vehicle key={v.id} x={p.x} y={p.y} heading={p.heading} k={k} color={STATES.running.color} pulse={v.id === picked} />
                : <Pin key={v.id} x={p.x} y={p.y} k={k} size={22} color={STATES[p.state].color} icon={(() => { const I = TYPE_ICON[v.type]; return <I size={13} />; })()} />))}
            </>
          )}
        </MapView>
      </div>

      <div className="row muted num" style={{ fontSize: 12.5, margin: '10px 4px 0', justifyContent: 'space-between' }}>
        <span>{fleet.length + addedVehicles.length} vehicles · {kmToday.toLocaleString('en-IN')} km today · {alertsToday} alerts</span>
        <button className="linkish" style={{ color: 'var(--accent)', fontWeight: 600 }} onClick={() => push('plans')}>{plan?.name ?? 'Plan'}</button>
      </div>

      <div className="chips" style={{ marginTop: 12 }}>
        <button className={`chip ${type === 'all' ? 'on' : ''}`} onClick={() => setType('all')}>All types</button>
        {types.map((t) => <button key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>{VEHICLE_TYPES[t].label}</button>)}
      </div>

      <SectionTitle>{state === 'all' ? 'Vehicles' : `${STATES[state].label} vehicles`}</SectionTitle>
      <div className="list">
        {shown.map(({ v, p }) => {
          const I = TYPE_ICON[v.type];
          return (
            <button key={v.id} className="list-item" onClick={() => setPicked(v.id)}>
              <div className="glyph" style={{ color: STATES[p.state].color, background: `color-mix(in srgb, ${STATES[p.state].color} 14%, transparent)` }}><I size={18} /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title num">{v.plate}</div>
                <div className="meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.driver} · {p.state === 'offline' ? `last seen ${Math.round(v.lastSeenMin / 60)} h ago` : describePoint(p)}</div>
              </div>
              <div className="num" style={{ textAlign: 'right', fontSize: 13 }}>
                <b>{p.state === 'running' ? `${Math.round(p.v)} km/h` : STATES[p.state].label}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>{v.kmToday} km today</div>
              </div>
            </button>
          );
        })}
        {!shown.length && <div className="list-item muted">No vehicles match these filters.</div>}
      </div>

      {addedVehicles.length > 0 && (
        <>
          <SectionTitle>Waiting for first GPS fix</SectionTitle>
          <div className="list">
            {addedVehicles.map((a) => {
              const I = TYPE_ICON[a.type] ?? CarIcon;
              return (
                <div key={a.id} className="list-item">
                  <div className="glyph"><I size={18} /></div>
                  <div className="grow"><div className="title num">{a.plate}</div><div className="meta num">IMEI {a.imei}{a.driver ? ` · ${a.driver}` : ''}</div></div>
                  <button className="linkish" style={{ color: 'var(--critical-ink)', fontSize: 13 }} onClick={() => setAddedVehicles(addedVehicles.filter((x) => x.id !== a.id))}>Remove</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <button className="btn" style={{ marginTop: 14 }} onClick={() => setAdding(true)}><Plus size={18} /> Add vehicle or device</button>

      <AddVehicle open={adding} onClose={() => setAdding(false)} onAdd={(v) => { setAddedVehicles([...addedVehicles, v]); setAdding(false); setToast(`${v.plate} added · waiting for first GPS fix`); }} />

      <Sheet open={!!sel} onClose={() => setPicked(null)}>
        {sel && (() => {
          const I = TYPE_ICON[sel.v.type];
          return (
            <>
              <div className="row">
                <div className="glyph" style={{ color: STATES[sel.p.state].color }}><I size={20} /></div>
                <div className="grow"><h3 className="num">{sel.v.plate}</h3><div className="muted" style={{ fontSize: 13 }}>{sel.v.name} · {VEHICLE_TYPES[sel.v.type].label}</div></div>
                <span className="badge" style={{ color: STATES[sel.p.state].color }}><CircleDot size={12} /> {STATES[sel.p.state].label}</span>
              </div>
              <div className="grid-3" style={{ margin: '14px 0' }}>
                <div className="stat"><div className="label">Speed</div><div className="value num">{Math.round(sel.p.v)}<small>km/h</small></div></div>
                <div className="stat"><div className="label">Today</div><div className="value num">{sel.v.kmToday}<small>km</small></div></div>
                <div className="stat"><div className="label">Alerts</div><div className="value num">{sel.v.alertsToday}</div></div>
              </div>
              <div className="list" style={{ marginBottom: 14 }}>
                <div className="list-item plain"><div className="grow"><div className="meta">Driver</div><div className="title">{sel.v.driver}</div></div></div>
                <div className="list-item plain"><div className="grow"><div className="meta">{sel.p.state === 'offline' ? 'Last known location' : 'Location'}</div><div className="title">{describePoint(sel.p)}</div></div>{sel.p.state === 'offline' && <WifiOff size={16} className="muted" />}</div>
                <div className="list-item plain"><div className="grow"><div className="meta">Odometer</div><div className="title num">{sel.v.odometer.toLocaleString('en-IN')} km</div></div></div>
              </div>
              <div className="grid-2">
                <button className="btn" onClick={() => setToast(`Calling ${sel.v.driver}…`)}><Phone size={18} /> Call</button>
                <button className="btn primary" onClick={() => { setPicked(null); push('routewatch'); }}><Navigation size={18} /> Route watch</button>
              </div>
            </>
          );
        })()}
      </Sheet>
    </div>
  );
}
