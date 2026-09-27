import { useMemo, useState } from 'react';
import { Car, Cpu, Phone, Plus, RotateCcw, Server, Hexagon } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented, Toggle, Sheet, EVENT_META } from '../components/ui.jsx';
import { DEFAULT_THRESHOLDS } from '../lib/analytics.js';

function SliderRow({ label, value, min, max, step = 1, unit, onChange, hint }) {
  return (
    <div style={{ padding: '12px 14px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        <span className="num" style={{ fontWeight: 700, color: 'var(--accent)' }}>{value}{unit}</span>
      </div>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

export default function Settings({ pop }) {
  const { vehicle, thresholds, setThresholds, trips, settings, setSettings, fences, setFences, setToast } = useApp();
  const [sheet, setSheet] = useState(null);
  const [api, setApi] = useState({ url: '', device: '', token: '' });
  const set = (k) => (v) => setThresholds({ ...thresholds, [k]: v });
  const d = vehicle.device;

  const found = useMemo(() => {
    const c = { crash: 0, harsh_brake: 0, harsh_accel: 0, overspeed: 0 };
    trips.forEach((t) => t.events.forEach((e) => { c[e.type] += 1; }));
    return c;
  }, [trips]);

  const g = (thresholds.crashFromKmh - thresholds.crashToKmh) / 3.6 / thresholds.crashWindowSec / 9.81;

  return (
    <div className="screen pushed">
      <NavBar title="Settings" onBack={pop} />

      <div className="card fade">
        <div className="row">
          <div className="glyph accent" style={{ width: 52, height: 52, borderRadius: 16 }}><Car size={26} /></div>
          <div className="grow">
            <div style={{ fontWeight: 750, fontSize: 18 }}>{vehicle.name}</div>
            <div className="muted num" style={{ fontSize: 13 }}>{vehicle.plate} · {vehicle.odometerKm.toLocaleString('en-IN')} km</div>
          </div>
        </div>
      </div>

      <SectionTitle>Tracker hardware</SectionTitle>
      <div className="list">
        {[
          ['Model', d.model], ['IMEI', d.imei], ['Firmware', d.firmware], ['SIM', d.sim], ['Cameras', d.cameras.join(' · ')], ['Audio', d.mic], ['Install', d.installed],
        ].map(([k, v]) => (
          <div key={k} className="list-item plain"><span className="grow muted">{k}</span><span style={{ fontWeight: 550, textAlign: 'right', maxWidth: '62%' }} className="num">{v}</span></div>
        ))}
      </div>

      <SectionTitle action="Reset" onAction={() => { setThresholds(DEFAULT_THRESHOLDS); setToast('Detection thresholds reset'); }}>Detection rules</SectionTitle>
      <div className="list">
        <div style={{ padding: '12px 14px 0' }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge crit">{EVENT_META.crash.label}</span>
            <span className="muted" style={{ fontSize: 12 }}>≈ {g.toFixed(2)} g minimum</span>
          </div>
          <div className="ink2" style={{ fontSize: 13, marginTop: 6 }}>
            Trigger when speed falls from <b>≥ {thresholds.crashFromKmh}</b> to <b>≤ {thresholds.crashToKmh} km/h</b> within <b>{thresholds.crashWindowSec} s</b>.
          </div>
        </div>
        <SliderRow label="From at least" value={thresholds.crashFromKmh} min={30} max={100} step={5} unit=" km/h" onChange={set('crashFromKmh')} />
        <SliderRow label="Down to at most" value={thresholds.crashToKmh} min={0} max={30} unit=" km/h" onChange={set('crashToKmh')} />
        <SliderRow label="Within" value={thresholds.crashWindowSec} min={1} max={5} unit=" s" onChange={set('crashWindowSec')} />
        <div style={{ height: 1, background: 'var(--hairline)', margin: '0 14px' }} />
        <SliderRow label="Harsh braking" value={thresholds.harshBrakeMs2} min={2} max={6} step={0.1} unit=" m/s²" onChange={set('harshBrakeMs2')} hint={`≈ ${(thresholds.harshBrakeMs2 * 3.6).toFixed(0)} km/h lost per second`} />
        <SliderRow label="Harsh acceleration" value={thresholds.harshAccelMs2} min={2} max={6} step={0.1} unit=" m/s²" onChange={set('harshAccelMs2')} />
        <SliderRow label="Overspeed alert above" value={thresholds.overspeedKmh} min={40} max={120} step={5} unit=" km/h" onChange={set('overspeedKmh')} />
        <div style={{ padding: '4px 14px 14px' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>With these rules, the last 6 weeks contain:</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(found).map(([k, n]) => <span key={k} className={`badge ${k === 'crash' ? 'crit' : 'warn'}`}>{n} {EVENT_META[k].short}</span>)}
          </div>
        </div>
      </div>

      <SectionTitle action="Add" onAction={() => setToast('Long-press anywhere on the map to drop a geofence')}>Geofences</SectionTitle>
      <div className="list">
        {fences.map((f) => (
          <div key={f.id} className="list-item">
            <div className="glyph violet"><Hexagon size={18} /></div>
            <div className="grow">
              <div className="title">{f.name}</div>
              <input className="slider" type="range" min={100} max={1500} step={50} value={f.radius} aria-label={`${f.name} radius`} onChange={(e) => setFences(fences.map((x) => (x.id === f.id ? { ...x, radius: Number(e.target.value) } : x)))} />
              <div className="meta num">Radius {f.radius} m · alert on enter & exit</div>
            </div>
            <Toggle on={f.enabled} label={`${f.name} geofence`} onChange={(on) => setFences(fences.map((x) => (x.id === f.id ? { ...x, enabled: on } : x)))} />
          </div>
        ))}
      </div>

      <SectionTitle>Notifications</SectionTitle>
      <div className="list">
        {[
          ['crash', 'Collision detection', 'Full-screen alarm + SMS to contacts'],
          ['harsh', 'Harsh braking & acceleration', ''],
          ['overspeed', 'Overspeeding', ''],
          ['geofence', 'Geofence enter / exit', ''],
          ['ignition', 'Every ignition on / off', ''],
          ['tamper', 'Power cut, tamper & towing', 'Recommended for theft protection'],
        ].map(([k, l, sub]) => (
          <div key={k} className="list-item plain">
            <div className="grow"><div className="title" style={{ fontSize: 14.5 }}>{l}</div>{sub && <div className="meta">{sub}</div>}</div>
            <Toggle on={settings.notify[k]} label={l} onChange={(on) => setSettings({ ...settings, notify: { ...settings.notify, [k]: on } })} />
          </div>
        ))}
      </div>

      <SectionTitle>Emergency contacts</SectionTitle>
      <div className="list">
        {settings.contacts.map((c) => (
          <div key={c.phone} className="list-item">
            <div className="glyph crit"><Phone size={18} /></div>
            <div className="grow"><div className="title">{c.name}</div><div className="meta num">{c.phone}</div></div>
          </div>
        ))}
        <SliderRow label="SOS countdown before auto-alert" value={settings.sosCountdown} min={10} max={60} step={5} unit=" s" onChange={(v) => setSettings({ ...settings, sosCountdown: v })} />
        <button className="list-item" onClick={() => setToast('Pick a contact from your address book')}><div className="glyph"><Plus size={18} /></div><div className="title" style={{ color: 'var(--accent)' }}>Add contact</div></button>
      </div>

      <SectionTitle>Appearance</SectionTitle>
      <Segmented options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} value={settings.theme} onChange={(v) => setSettings({ ...settings, theme: v })} />

      <SectionTitle>Data source</SectionTitle>
      <div className="list">
        <div className="list-item">
          <div className="glyph good"><Cpu size={18} /></div>
          <div className="grow"><div className="title">Demo tracker</div><div className="meta">Simulated 1 Hz GPS · 6 weeks of history</div></div>
          <span className="badge good">Active</span>
        </div>
        <button className="list-item" onClick={() => setSheet('api')}>
          <div className="glyph"><Server size={18} /></div>
          <div className="grow"><div className="title">Connect real tracker</div><div className="meta">Vendor cloud API, Traccar or MQTT</div></div>
        </button>
        <button className="list-item" onClick={() => { try { localStorage.clear(); } catch { /* storage unavailable */ } location.reload(); }}>
          <div className="glyph"><RotateCcw size={18} /></div>
          <div className="grow"><div className="title">Reset demo</div></div>
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, textAlign: 'center', margin: '24px 0 8px' }}>Drive · v0.1.0</div>

      <Sheet open={sheet === 'api'} onClose={() => setSheet(null)}>
        <h3>Connect your tracker</h3>
        <p className="muted" style={{ margin: '4px 0 14px', fontSize: 14 }}>Point the app at the server your GPS unit reports to. Positions, ignition and media events are pulled into the same insights.</p>
        <div className="stack">
          <div className="field"><label htmlFor="u">Server URL</label><input id="u" placeholder="https://tracker.example.com" value={api.url} onChange={(e) => setApi({ ...api, url: e.target.value })} /></div>
          <div className="field"><label htmlFor="dv">Device ID / IMEI</label><input id="dv" placeholder="864712045539182" value={api.device} onChange={(e) => setApi({ ...api, device: e.target.value })} /></div>
          <div className="field"><label htmlFor="tk">API token</label><input id="tk" type="password" value={api.token} onChange={(e) => setApi({ ...api, token: e.target.value })} /></div>
          <button className="btn primary" disabled={!api.url || !api.device} onClick={() => { setSheet(null); setToast('Saved — the backend adapter is not wired up in this build'); }}>Connect</button>
        </div>
      </Sheet>
    </div>
  );
}
