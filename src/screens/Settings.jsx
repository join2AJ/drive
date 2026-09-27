import { useMemo, useState } from 'react';
import { Car, Cpu, Phone, Plus, RotateCcw, Server, Hexagon, ChevronRight, Map as MapIcon, Download, Check, WifiOff, SatelliteDish, BadgeIndianRupee } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented, Toggle, Sheet, EVENT_META } from '../components/ui.jsx';
import { DEFAULT_THRESHOLDS } from '../lib/analytics.js';
import { PLANS } from '../lib/plans.js';

const OFFLINE_PACKS = [
  { key: 'bengaluru', name: 'Bengaluru city', size: 38, detail: 'Streets, speed limits, landmarks' },
  { key: 'karnataka', name: 'Karnataka highways', size: 124, detail: 'NH & state highways, toll plazas' },
  { key: 'mysuru', name: 'Mysuru', size: 12, detail: 'Streets and landmarks' },
  { key: 'chennai', name: 'Chennai', size: 51, detail: 'Streets, speed limits, landmarks' },
];

const FUEL_PRESETS = {
  Petrol: { pricePerL: 103.5, kmPerL: 14, idleLph: 0.8 },
  Diesel: { pricePerL: 90, kmPerL: 18, idleLph: 0.7 },
  CNG: { pricePerL: 76, kmPerL: 22, idleLph: 0.6 },
  EV: { pricePerL: 9, kmPerL: 7, idleLph: 0.3 },
};

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

export default function Settings({ pop, push }) {
  const { account, vehicle, thresholds, setThresholds, trips, settings, setSettings, fences, setFences, setToast, network, live } = useApp();
  const [downloading, setDownloading] = useState({});
  const packs = settings.offlineMaps ?? {};
  const downloadPack = (p) => {
    setDownloading((d) => ({ ...d, [p.key]: 0 }));
    let pct = 0;
    const id = setInterval(() => {
      pct += 8 + Math.random() * 14;
      if (pct >= 100) {
        clearInterval(id);
        setDownloading((d) => { const n = { ...d }; delete n[p.key]; return n; });
        setSettings((st) => ({ ...st, offlineMaps: { ...(st.offlineMaps ?? {}), [p.key]: 'ready' } }));
        setToast(`${p.name} map ready offline`);
      } else setDownloading((d) => ({ ...d, [p.key]: pct }));
    }, 350);
  };
  const [sheet, setSheet] = useState(null);
  const [api, setApi] = useState({ url: '', device: '', token: '' });
  const set = (k) => (v) => setThresholds({ ...thresholds, [k]: v });
  const setFuel = (patch) => setSettings({ ...settings, fuel: { ...settings.fuel, ...patch } });
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

      <button className="list list-item" style={{ marginTop: 10 }} onClick={() => push('plans')}>
        <div className="glyph accent"><BadgeIndianRupee size={18} /></div>
        <div className="grow"><div className="title">{PLANS[account.plan]?.name ?? 'Free'} plan</div><div className="meta">{account.type === 'business' ? `Business · ${account.company || 'your company'} · ${account.vehicles} vehicles` : 'Personal'} · change plan or billing</div></div>
        <ChevronRight className="chev" size={18} />
      </button>

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

      <SectionTitle>Geofences & idling</SectionTitle>
      <div className="list">
        <button className="list-item" onClick={() => push('geofences')}>
          <div className="glyph violet"><Hexagon size={18} /></div>
          <div className="grow"><div className="title">Geofences</div><div className="meta">{fences.filter((f) => f.enabled).length} active · circle, drive-time or drawn zones</div></div>
          <ChevronRight className="chev" size={18} />
        </button>
        <SliderRow label="Alert after idling for" value={settings.idleAlertMin ?? 5} min={1} max={30} unit=" min" onChange={(v) => setSettings({ ...settings, idleAlertMin: v })} hint="Engine on while standing still" />
      </div>

      <SectionTitle>Fuel & mileage</SectionTitle>
      <div className="list">
        <div style={{ padding: '12px 14px 0' }}>
          <Segmented options={['Petrol', 'Diesel', 'CNG', 'EV'].map((v) => ({ value: v, label: v }))} value={settings.fuel.type} onChange={(v) => setFuel({ type: v, ...(FUEL_PRESETS[v]) })} />
        </div>
        <SliderRow label={settings.fuel.type === 'EV' ? 'Price per kWh' : settings.fuel.type === 'CNG' ? 'Price per kg' : 'Price per litre'} value={settings.fuel.pricePerL} min={5} max={140} step={0.5} unit=" ₹" onChange={(v) => setFuel({ pricePerL: v })} />
        <SliderRow label={settings.fuel.type === 'EV' ? 'Efficiency (km/kWh)' : 'Real-world mileage'} value={settings.fuel.kmPerL} min={4} max={30} step={0.5} unit={settings.fuel.type === 'EV' ? ' km/kWh' : ' km/L'} onChange={(v) => setFuel({ kmPerL: v })} />
        <SliderRow label="Burn while idling" value={settings.fuel.idleLph} min={0} max={2} step={0.1} unit=" /h" onChange={(v) => setFuel({ idleLph: v })} hint="Used for trip costs and the Fuel & costs insight" />
      </div>

      <SectionTitle>Claim details</SectionTitle>
      <div className="card stack">
        <div className="muted" style={{ fontSize: 12.5 }}>Filled into every incident claim so you don't have to remember them at the roadside.</div>
        {[['driverName', 'Driver name'], ['phone', 'Phone'], ['licenceNo', 'Driving licence no.'], ['insurer', 'Insurer'], ['policyNo', 'Policy no.']].map(([k, l]) => (
          <div key={k} className="field">
            <label htmlFor={`cp-${k}`}>{l}</label>
            <input id={`cp-${k}`} value={settings.claimProfile[k] ?? ''} onChange={(e) => setSettings({ ...settings, claimProfile: { ...settings.claimProfile, [k]: e.target.value } })} />
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

      <SectionTitle>Offline maps</SectionTitle>
      <div className="list">
        <div className="list-item plain" style={{ alignItems: 'flex-start' }}>
          <MapIcon size={18} className="muted" style={{ marginTop: 2, flex: 'none' }} />
          <div className="muted" style={{ fontSize: 12.5 }}>Downloaded regions work with no internet. GPS needs no internet at all, so your position, trips and alerts keep working; the car's tracker stores points and uploads them when it's back in coverage.</div>
        </div>
        {OFFLINE_PACKS.map((p) => {
          const ready = packs[p.key] === 'ready';
          const pct = downloading[p.key];
          return (
            <div key={p.key} className="list-item">
              <div className={`glyph ${ready ? 'good' : ''}`}>{ready ? <Check size={18} /> : <MapIcon size={18} />}</div>
              <div className="grow">
                <div className="title">{p.name}</div>
                <div className="meta num">{p.size} MB · {p.detail}</div>
                {pct != null && <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${pct}%` }} /></div>}
              </div>
              {ready ? (
                <button className="btn small" onClick={() => setSettings({ ...settings, offlineMaps: { ...packs, [p.key]: undefined } })}>Remove</button>
              ) : (
                <button className="btn small" disabled={pct != null} onClick={() => downloadPack(p)}><Download size={15} /> {pct != null ? `${Math.round(pct)}%` : 'Get'}</button>
              )}
            </div>
          );
        })}
        <div className="list-item plain">
          <div className="grow"><div className="title" style={{ fontSize: 14.5 }}>Update maps on Wi-Fi only</div><div className="meta">Monthly road and speed-limit updates</div></div>
          <Toggle on={settings.autoUpdateMaps !== false} label="Update maps on Wi-Fi" onChange={(v) => setSettings({ ...settings, autoUpdateMaps: v })} />
        </div>
      </div>

      <SectionTitle>Test offline behaviour</SectionTitle>
      <div className="list">
        <div className="list-item plain">
          <WifiOff size={18} className="muted" />
          <div className="grow"><div className="title" style={{ fontSize: 14.5 }}>Phone offline</div><div className="meta">Pretend this phone has no internet</div></div>
          <Toggle on={network.demoPhoneOffline} label="Phone offline" onChange={network.setDemoPhoneOffline} />
        </div>
        <div className="list-item plain">
          <SatelliteDish size={18} className="muted" />
          <div className="grow"><div className="title" style={{ fontSize: 14.5 }}>Car has no mobile signal</div><div className="meta">{network.trackerOnline ? 'e.g. a basement or tunnel' : `${live.buffered} GPS points stored in the tracker`}</div></div>
          <Toggle on={!network.trackerOnline} label="Car has no signal" onChange={(v) => network.setTrackerOnline(!v)} />
        </div>
      </div>

      <SectionTitle>Parking fees</SectionTitle>
      <div className="list">
        {[['mall', 'Phoenix Mall'], ['airport', 'Airport']].map(([k, l]) => (
          <SliderRow key={k} label={l} value={settings.parkingFees?.[k] ?? 0} min={0} max={500} step={10} unit=" ₹" onChange={(v) => setSettings({ ...settings, parkingFees: { ...settings.parkingFees, [k]: v } })} hint="Added to the cost of every trip that ends here" />
        ))}
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
