import { useEffect } from 'react';
import { ShieldAlert, Copy, Share2, Radio, KeyRound, BellRing, EyeOff, CheckCircle2, Timer } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle } from '../components/ui.jsx';
import { HoldButton } from './Controls.jsx';
import MapView, { Route, Vehicle } from '../components/MapView.jsx';
import { formatLatLng } from '../lib/geo.js';
import { describePoint } from '../data/cityModel.js';
import { fmtClock, fmtDay, fmtTime } from '../lib/format.js';

export function shareUrl(token) {
  return `${location.origin}${location.pathname}#/share/${token}`;
}

async function copy(text, setToast, label) {
  try { await navigator.clipboard.writeText(text); setToast(`${label} copied`); } catch { setToast(text); }
}

export default function Stolen({ pop }) {
  const { stolen, setStolen, live, vehicle, controls, setToast, settings } = useApp();
  const s = stolen;
  const log = (list, text) => [...(list ?? []), { t: Date.now(), text }];

  // Safe engine cut: only once the thief has slowed below 20 km/h (never at speed).
  useEffect(() => {
    if (!s.active || s.engineCutAt || live.cur.v >= 20) return;
    setStolen((x) => ({ ...x, engineCutAt: Date.now(), log: log(x.log, `Engine cut at ${Math.round(live.cur.v)} km/h near ${describePoint(live.cur)}`) }));
    controls.setImmobilized(true);
    setToast('Engine cut — vehicle is slowing to a stop');
  }, [s.active, s.engineCutAt, live.cur, controls, setStolen, setToast]);

  const activate = () => {
    const token = `pol-${Math.random().toString(36).slice(2, 10)}`;
    setStolen({ active: true, since: Date.now(), token, fir: '', log: [{ t: Date.now(), text: 'Stolen-vehicle mode on · tracking every 5 s' }, { t: Date.now() + 1, text: `SMS sent to ${settings.contacts.map((c) => c.name).join(', ')}` }] });
    controls.setImmobilized(true);
    setToast('Stolen-vehicle mode on');
  };
  const deactivate = () => {
    setStolen((x) => ({ active: false, endedAt: Date.now(), log: log(x.log, 'Vehicle recovered · mode off') }));
    controls.setImmobilized(false);
    setToast('Stolen-vehicle mode off · engine restored');
  };

  if (!s.active) {
    return (
      <div className="screen pushed">
        <NavBar title="Stolen-vehicle mode" onBack={pop} />
        <div className="card fade" style={{ textAlign: 'center' }}>
          <div className="glyph crit" style={{ width: 64, height: 64, borderRadius: 20, margin: '4px auto 12px' }}><ShieldAlert size={30} /></div>
          <h3 style={{ margin: 0, fontSize: 21 }}>Car stolen?</h3>
          <p className="muted" style={{ margin: '6px 0 0' }}>Turn this on first, then call 112. It keeps working even if the thief removes the main battery (the tracker has a backup cell).</p>
        </div>
        <SectionTitle>What happens</SectionTitle>
        <div className="list">
          {[
            [Radio, 'Tracking every 5 seconds', 'Instead of every 30 s. Uses more data and backup battery.'],
            [Share2, 'A live link for the police', 'No app or login needed. Shows position, speed and vehicle details.'],
            [KeyRound, 'Engine cut when safe', 'The immobilizer cuts fuel only once the car slows below 20 km/h.'],
            [EyeOff, 'Silent', 'No horn or lights, so the thief isn’t warned.'],
            [BellRing, 'Your contacts are alerted', 'By SMS, even if they don’t have the app.'],
          ].map(([I, t, m]) => (
            <div key={t} className="list-item"><div className="glyph"><I size={18} /></div><div className="grow"><div className="title">{t}</div><div className="meta">{m}</div></div></div>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <HoldButton className="btn danger" onConfirm={activate}><ShieldAlert size={18} /> Hold to turn on</HoldButton>
        </div>
        {s.endedAt && <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>Last used {fmtDay(s.endedAt)}</div>}
      </div>
    );
  }

  const url = shareUrl(s.token);
  return (
    <div className="screen pushed">
      <NavBar title="Stolen-vehicle mode" onBack={pop} />
      <div className="banner fade">
        <div className="glyph crit"><Radio size={18} /></div>
        <div className="grow">
          <div style={{ fontWeight: 700 }}>Tracking every 5 s</div>
          <div className="ink2 num" style={{ fontSize: 13 }}>Since {fmtTime(s.since)} · {Math.round(live.cur.v)} km/h · {describePoint(live.cur)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <MapView fitKey="stolen" fit={{ minX: live.cur.x - 700, maxX: live.cur.x + 700, minY: live.cur.y - 500, maxY: live.cur.y + 500 }} follow={live.cur} style={{ height: 220 }}>
          {(k) => (
            <>
              <Route points={live.trail.slice(-300)} k={k} color="var(--critical)" width={4} />
              <Vehicle x={live.cur.x} y={live.cur.y} heading={live.heading} k={k} color="var(--critical)" />
            </>
          )}
        </MapView>
        <div className="muted num" style={{ fontSize: 12, padding: '8px 12px' }}>{formatLatLng(live.cur.x, live.cur.y)}</div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <div className={`glyph ${s.engineCutAt ? 'good' : 'warn'}`}>{s.engineCutAt ? <CheckCircle2 size={18} /> : <Timer size={18} />}</div>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>{s.engineCutAt ? `Engine cut at ${fmtClock(s.engineCutAt)}` : 'Engine cut armed'}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{s.engineCutAt ? 'The car can’t be restarted until you turn this off.' : 'Waiting for the car to slow below 20 km/h.'}</div>
          </div>
        </div>
      </div>

      <SectionTitle>Police link</SectionTitle>
      <div className="card stack">
        <div className="hash" style={{ fontSize: 12 }}>{url}</div>
        <div className="grid-2">
          <button className="btn small" style={{ width: '100%' }} onClick={() => copy(url, setToast, 'Police link')}><Copy size={15} /> Copy</button>
          <button className="btn small" style={{ width: '100%' }} onClick={async () => { try { await navigator.share?.({ title: `Stolen vehicle ${vehicle.plate}`, text: `Live location of stolen ${vehicle.name} ${vehicle.plate}`, url }); } catch { /* cancelled */ } }}><Share2 size={15} /> Share</button>
        </div>
        <div className="field"><label htmlFor="fir">FIR / complaint number</label><input id="fir" value={s.fir ?? ''} placeholder="Add once you have it" onChange={(e) => setStolen((x) => ({ ...x, fir: e.target.value }))} /></div>
        <div className="muted" style={{ fontSize: 12 }}>The link shows {vehicle.name}, {vehicle.plate}, IMEI {vehicle.device.imei}, live position and speed. It stops working when you turn this mode off.</div>
      </div>

      <SectionTitle>Timeline</SectionTitle>
      <div className="card">
        {[...(s.log ?? [])].reverse().map((l) => (
          <div key={l.t} className="row" style={{ gap: 10, padding: '4px 0', fontSize: 13.5 }}>
            <span className="muted num" style={{ width: 64 }}>{fmtClock(l.t).slice(0, 5)}</span><span className="grow">{l.text}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <HoldButton className="btn primary" onConfirm={deactivate}>Hold — vehicle recovered</HoldButton>
      </div>
    </div>
  );
}
