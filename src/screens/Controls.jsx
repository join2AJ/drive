import { useRef, useState } from 'react';
import {
  Lock, LockOpen, Power, KeyRound, ShieldCheck, UserRound, Snowflake, FlipHorizontal2, PanelTop, Package, Lightbulb,
  TriangleAlert, Megaphone, MapPinned, Gauge, Minus, Plus, Info, Check, Signal,
} from 'lucide-react';
import { useApp } from '../state.jsx';
import CarTopView from '../components/CarTopView.jsx';
import { NavBar, SectionTitle, Segmented, Sheet } from '../components/ui.jsx';
import { fmtClock } from '../lib/format.js';

// What each command needs from the hardware. A plain GPS tracker can do "tracker" and
// (with its relay) "relay"; body controls need a CAN-bus interface module.
const HW = {
  tracker: { label: 'Tracker', tone: 'good' },
  relay: { label: 'Relay', tone: 'good' },
  can: { label: 'CAN module', tone: '' },
};

/** Press-and-hold to confirm; used for commands you shouldn't trigger by accident. */
export function HoldButton({ children, onConfirm, className = 'btn danger', ms = 900, disabled }) {
  const [p, setP] = useState(0);
  const raf = useRef();
  const start = () => {
    if (disabled) return;
    const t0 = performance.now();
    const tick = (now) => {
      const f = Math.min(1, (now - t0) / ms);
      setP(f);
      if (f >= 1) { setP(0); onConfirm(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const stop = () => { cancelAnimationFrame(raf.current); setP(0); };
  return (
    <button className={`${className} hold`} disabled={disabled} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}>
      <span className="hold-fill" style={{ transform: `scaleX(${p})` }} />
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{children}</span>
    </button>
  );
}

function Tile({ icon: I, label, value, on, pending, blocked, hw, onClick, tone }) {
  const { setToast } = useApp();
  return (
    <button
      className={`ctl ${on ? 'on' : ''} ${tone ?? ''} ${blocked ? 'blocked' : ''}`}
      aria-pressed={!!on}
      onClick={() => (blocked ? setToast(blocked) : pending ? null : onClick())}
    >
      <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
        <div className="ctl-icon">{pending ? <span className="spinner" /> : <I size={20} />}</div>
        {hw && <span className={`hw ${HW[hw].tone}`}>{HW[hw].label}</span>}
      </div>
      <div className="ctl-label">{label}</div>
      <div className="ctl-value">{pending ? 'Sending…' : blocked ? 'Not while driving' : value}</div>
    </button>
  );
}

export default function Controls({ pop }) {
  const { controls: c, vehicle, setToast, live } = useApp();
  const { state: s, send, pending, moving, engine, parkedDemo, setParkedDemo, log, setImmobilized } = c;
  const [sheet, setSheet] = useState(null);
  const [honking, setHonking] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const parkedOnly = moving ? 'Available only when the vehicle is parked' : null;

  const honk = (withLights) => {
    send(withLights ? 'find' : 'horn', withLights ? 'Find my car' : 'Horn', (x) => x, { latency: 900 });
    setTimeout(() => {
      setHonking(true);
      if (withLights) setFlashing(true);
      setTimeout(() => { setHonking(false); setFlashing(false); }, withLights ? 6000 : 2000);
    }, 1200);
  };

  const status = [
    s.locked ? 'Locked' : 'Unlocked',
    engine === 'on' ? (moving ? 'Driving' : 'Engine running') : 'Engine off',
    s.mirrors === 'folded' ? 'Mirrors folded' : null,
    s.windows === 'open' ? 'Windows vented' : null,
    s.trunk === 'open' ? 'Boot open' : null,
    s.immobilized ? 'Immobilizer armed' : null,
  ].filter(Boolean);

  return (
    <div className="screen pushed">
      <NavBar title="Vehicle controls" onBack={pop} />

      <Segmented options={[{ value: false, label: 'Driving (live)' }, { value: true, label: 'Parked (demo)' }]} value={parkedDemo} onChange={setParkedDemo} />

      <div className="card fade" style={{ marginTop: 12, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
        <div className="stack" style={{ gap: 8 }}>
          <div>
            <div style={{ fontWeight: 750, fontSize: 18 }}>{vehicle.name}</div>
            <div className="muted row" style={{ gap: 5, fontSize: 12.5 }}><Signal size={13} /> Online · 4G · replies in ~1.5 s</div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {status.map((x) => <span key={x} className={`badge ${x === 'Unlocked' || x === 'Boot open' ? 'warn' : x === 'Immobilizer armed' ? 'crit' : ''}`}>{x}</span>)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Battery 12.6 V · Fuel 38 L est.<br />Cabin 31 °C · Outside 29 °C</div>
        </div>
        <CarTopView s={s} engine={engine} honking={honking} flashing={flashing} height={230} />
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <button className={`btn ${s.locked ? '' : 'primary'}`} style={{ height: 56 }} onClick={() => send('lock', s.locked ? 'Doors unlocked' : 'Doors locked', (x) => ({ ...x, locked: !x.locked }))} disabled={pending.lock}>
          {pending.lock ? <span className="spinner" /> : s.locked ? <LockOpen size={20} /> : <Lock size={20} />} {s.locked ? 'Unlock' : 'Lock'}
        </button>
        {engine === 'on' ? (
          <HoldButton className={`btn ${moving ? '' : 'danger'}`} disabled={moving || pending.engine} onConfirm={() => send('engine', 'Engine stopped', (x) => ({ ...x, engine: 'off', climate: false }))}>
            {pending.engine ? <span className="spinner" /> : <Power size={20} />} {moving ? 'Engine running' : 'Hold to stop'}
          </HoldButton>
        ) : (
          <HoldButton className="btn primary" disabled={pending.engine || s.immobilized} onConfirm={() => send('engine', 'Engine started remotely', (x) => ({ ...x, engine: 'on' }), { latency: 2600 })}>
            {pending.engine ? <span className="spinner" /> : <Power size={20} />} Hold to start
          </HoldButton>
        )}
      </div>
      {moving && <div className="muted" style={{ fontSize: 12, margin: '6px 4px 0' }}>The engine can't be switched off at speed. Use the immobilizer, which cuts fuel below 20 km/h.</div>}

      <SectionTitle>Security</SectionTitle>
      <div className="grid-2">
        <Tile icon={KeyRound} label="Immobilizer" hw="relay" on={s.immobilized} tone="danger" value={s.immobilized ? 'Armed · cuts fuel < 20 km/h' : 'Off'} pending={pending.immob} onClick={() => setSheet('immob')} />
        <Tile icon={ShieldCheck} label="Parking guard" hw="tracker" on={s.guard} value={s.guard ? 'Alerts on move / tow' : 'Off'} pending={pending.guard} onClick={() => send('guard', s.guard ? 'Parking guard off' : 'Parking guard on', (x) => ({ ...x, guard: !x.guard }), { latency: 600 })} />
        <Tile icon={UserRound} label="Valet mode" hw="tracker" on={s.valet} value={s.valet ? 'Max 40 km/h · 3 km radius' : 'Off'} pending={pending.valet} onClick={() => send('valet', s.valet ? 'Valet mode off' : 'Valet mode on', (x) => ({ ...x, valet: !x.valet }))} />
        <Tile icon={MapPinned} label="Find my car" hw="relay" value="Horn + lights 6 s" pending={pending.find} blocked={parkedOnly} onClick={() => honk(true)} />
      </div>

      <SectionTitle>Comfort & body</SectionTitle>
      <div className="grid-2">
        <Tile icon={Snowflake} label="Pre-cool AC" hw="can" on={s.climate && engine === 'on'} value={engine !== 'on' ? 'Needs engine running' : s.climate ? `On · ${s.climateTemp} °C` : 'Off'} pending={pending.climate} onClick={() => (engine !== 'on' ? setToast('Start the engine first to run the AC') : setSheet('climate'))} />
        <Tile icon={FlipHorizontal2} label="Mirrors" hw="can" on={s.mirrors === 'folded'} value={s.mirrors === 'folded' ? 'Folded' : 'Open'} pending={pending.mirrors} blocked={parkedOnly} onClick={() => send('mirrors', s.mirrors === 'folded' ? 'Mirrors unfolded' : 'Mirrors folded', (x) => ({ ...x, mirrors: x.mirrors === 'folded' ? 'open' : 'folded' }))} />
        <Tile icon={PanelTop} label="Windows" hw="can" on={s.windows === 'open'} value={s.windows === 'open' ? 'Vented 2 cm' : 'All closed'} pending={pending.windows} blocked={s.windows === 'closed' ? parkedOnly : null} onClick={() => send('windows', s.windows === 'open' ? 'Windows closed' : 'Windows vented', (x) => ({ ...x, windows: x.windows === 'open' ? 'closed' : 'open' }))} />
        <Tile icon={Package} label="Boot" hw="can" on={s.trunk === 'open'} value={s.trunk === 'open' ? 'Open' : 'Closed'} pending={pending.trunk} blocked={parkedOnly} onClick={() => send('trunk', s.trunk === 'open' ? 'Boot closed' : 'Boot opened', (x) => ({ ...x, trunk: x.trunk === 'open' ? 'closed' : 'open' }))} />
        <Tile icon={Lightbulb} label="Headlights" hw="can" on={s.lights} value={s.lights ? 'On' : 'Off'} pending={pending.lights} onClick={() => send('lights', s.lights ? 'Headlights off' : 'Headlights on', (x) => ({ ...x, lights: !x.lights }), { latency: 800 })} />
        <Tile icon={TriangleAlert} label="Hazard lights" hw="can" on={s.hazard} tone="warn" value={s.hazard ? 'Flashing' : 'Off'} pending={pending.hazard} onClick={() => send('hazard', s.hazard ? 'Hazards off' : 'Hazards on', (x) => ({ ...x, hazard: !x.hazard }), { latency: 800 })} />
        <Tile icon={Megaphone} label="Horn" hw="relay" value="Honk 2 s" pending={pending.horn} blocked={parkedOnly} onClick={() => honk(false)} />
      </div>

      <SectionTitle>Driving limits</SectionTitle>
      <div className="card">
        <div className="row">
          <div className="glyph accent"><Gauge size={18} /></div>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>Speed limiter</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{s.speedLimiter ? `Throttle held at ${s.speedLimitKmh} km/h` : 'Alerts only (Settings → Overspeed)'}</div>
          </div>
          <button className={`toggle ${s.speedLimiter ? 'on' : ''}`} role="switch" aria-checked={s.speedLimiter} aria-label="Speed limiter" onClick={() => send('limiter', s.speedLimiter ? 'Speed limiter off' : `Speed limiter ${s.speedLimitKmh} km/h`, (x) => ({ ...x, speedLimiter: !x.speedLimiter }))} />
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'center', gap: 18 }}>
          <button className="icon-btn" aria-label="Lower limit" onClick={() => c.setState((x) => ({ ...x, speedLimitKmh: Math.max(30, x.speedLimitKmh - 10) }))}><Minus size={18} /></button>
          <div className="num" style={{ fontSize: 30, fontWeight: 750, minWidth: 110, textAlign: 'center' }}>{s.speedLimitKmh}<span className="muted" style={{ fontSize: 13 }}> km/h</span></div>
          <button className="icon-btn" aria-label="Raise limit" onClick={() => c.setState((x) => ({ ...x, speedLimitKmh: Math.min(140, x.speedLimitKmh + 10) }))}><Plus size={18} /></button>
        </div>
        <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 4 }}>Current speed {Math.round(c.parkedDemo ? 0 : live.cur.v)} km/h</div>
      </div>

      <SectionTitle>Command history</SectionTitle>
      {log.length ? (
        <div className="list">
          {log.map((l, i) => (
            <div key={i} className="list-item plain">
              <Check size={16} color="var(--good-ink)" />
              <div className="grow"><div className="title" style={{ fontSize: 14 }}>{l.label}</div></div>
              <span className="muted num" style={{ fontSize: 12 }}>{fmtClock(l.t)} · {(l.ms / 1000).toFixed(1)} s</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card muted" style={{ fontSize: 13.5 }}>Commands you send appear here with the time the vehicle confirmed them.</div>
      )}

      <div className="banner info" style={{ marginTop: 16 }}>
        <div className="glyph accent"><Info size={18} /></div>
        <div className="ink2" style={{ fontSize: 12.5 }}>
          <b style={{ color: 'var(--ink)' }}>Hardware needed.</b> A wired GPS tracker handles alerts, guard, valet and the immobilizer relay. Locks, windows, mirrors, boot, lights, AC and remote start need a CAN-bus interface module wired to the car.
        </div>
      </div>

      <Sheet open={sheet === 'immob'} onClose={() => setSheet(null)}>
        <h3>{s.immobilized ? 'Restore engine?' : 'Arm immobilizer?'}</h3>
        <p className="muted" style={{ margin: '6px 0 18px' }}>
          {s.immobilized ? 'The relay reconnects the fuel pump so the car can start normally.' : 'The relay cuts the fuel pump once speed drops below 20 km/h, so the car is never stopped at speed.'}
        </p>
        <HoldButton
          className={`btn ${s.immobilized ? 'primary' : 'danger'}`}
          onConfirm={() => {
            setSheet(null);
            send('immob', s.immobilized ? 'Engine restored' : 'Immobilizer armed', (x) => x);
            setTimeout(() => setImmobilized(!s.immobilized), 1500);
          }}
        >
          {s.immobilized ? 'Hold to restore' : 'Hold to arm'}
        </HoldButton>
      </Sheet>

      <Sheet open={sheet === 'climate'} onClose={() => setSheet(null)}>
        <h3>Pre-cool cabin</h3>
        <p className="muted" style={{ margin: '4px 0 14px' }}>Runs the AC until you arrive, up to 15 minutes.</p>
        <div className="row" style={{ justifyContent: 'center', gap: 22, margin: '8px 0 18px' }}>
          <button className="icon-btn" aria-label="Cooler" onClick={() => c.setState((x) => ({ ...x, climateTemp: Math.max(16, x.climateTemp - 1) }))}><Minus size={18} /></button>
          <div className="num" style={{ fontSize: 44, fontWeight: 750 }}>{s.climateTemp}°</div>
          <button className="icon-btn" aria-label="Warmer" onClick={() => c.setState((x) => ({ ...x, climateTemp: Math.min(28, x.climateTemp + 1) }))}><Plus size={18} /></button>
        </div>
        <button className="btn primary" onClick={() => { setSheet(null); send('climate', s.climate ? 'AC off' : `AC on · ${s.climateTemp} °C`, (x) => ({ ...x, climate: !x.climate })); }}>
          {s.climate ? 'Turn AC off' : 'Start AC'}
        </button>
      </Sheet>
    </div>
  );
}
