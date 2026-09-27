import { useMemo, useState } from 'react';
import {
  Settings, Lock, Unlock, Mic, Video, Share2, Siren, Satellite, Signal, BatteryFull, KeyRound, ChevronRight, Clock, Route as RouteIcon,
} from 'lucide-react';
import MapView, { Route, Vehicle, Fence, Pin, boundsOf } from '../components/MapView.jsx';
import { SpeedGauge, ScoreRing } from '../components/Charts.jsx';
import { Sheet, PlaceIcon, SectionTitle, CountUp } from '../components/ui.jsx';
import { useApp } from '../state.jsx';
import { fmtKm, fmtDuration, fmtAgo } from '../lib/format.js';
import { summarizeTrip } from '../lib/analytics.js';
import { city } from '../data/cityModel.js';
import { formatLatLng } from '../lib/geo.js';

function roadAt(pt) {
  let best = null;
  let bd = Infinity;
  for (const e of city.edges) {
    const a = city.nodes[e.a];
    const b = city.nodes[e.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(a.x + dx * t - pt.x, a.y + dy * t - pt.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export default function Live({ push }) {
  const { live, vehicle, trips, fences, placeAt, immobilized, setImmobilized, setToast, alerts } = useApp();
  const [sheet, setSheet] = useState(null);
  const { cur, heading, trail, ahead } = live;
  const moving = cur.v > 2;
  const road = useMemo(() => roadAt(cur), [cur]);
  const home = placeAt(ahead[ahead.length - 1]);

  const remaining = useMemo(() => {
    let d = 0;
    for (let i = 1; i < ahead.length; i++) d += Math.hypot(ahead[i].x - ahead[i - 1].x, ahead[i].y - ahead[i - 1].y);
    return { d, sec: (ahead[ahead.length - 1].t - ahead[0].t) / 1000 };
  }, [ahead]);

  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const ts = trips.filter((t) => t.start >= start.getTime());
    const liveSum = summarizeTrip(trail);
    const dist = ts.reduce((a, t) => a + t.summary.distance, 0) + liveSum.distance;
    const dur = ts.reduce((a, t) => a + t.summary.duration, 0) + liveSum.duration;
    const scores = ts.map((t) => t.score);
    return { dist, dur, trips: ts.length + 1, score: scores.length ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 92 };
  }, [trips, trail]);

  const liveFit = useMemo(() => boundsOf([...trail.slice(-120), ...ahead.slice(0, 200)]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastCritical = alerts.find((a) => a.type === 'crash');

  return (
    <div className="screen flush" style={{ padding: 0 }}>
      <MapView className="live-map" fit={liveFit} fitKey="live" follow={cur} controlsTop="calc(var(--safe-top) + 64px)">
        {(k) => (
          <>
            {fences.filter((f) => f.enabled).map((f) => <Fence key={f.id} x={f.x} y={f.y} r={f.radius} k={k} label={f.name} />)}
            <Route points={ahead} k={k} color="var(--ink-3)" width={4} dashed casing={false} step={3} />
            <Route points={trail} k={k} width={5} step={2} />
            <Pin x={ahead[ahead.length - 1].x} y={ahead[ahead.length - 1].y} k={k} color="var(--violet)" icon={<PlaceIcon name={home?.icon ?? 'home'} size={24} />} />
            <Vehicle x={cur.x} y={cur.y} heading={heading} k={k} color={immobilized ? 'var(--critical)' : 'var(--accent)'} />
          </>
        )}
      </MapView>

      <div className="live-top">
        <div className="vehicle-pill">
          <div className="name">{vehicle.name}</div>
          <div className="status">
            <span className={`dot ${moving ? 'live' : ''}`} style={{ background: moving ? 'var(--good)' : 'var(--ink-3)' }} />
            {moving ? 'Driving' : 'Stopped'} · {vehicle.plate}
          </div>
        </div>
        <button className="icon-btn" style={{ background: 'var(--glass)', backdropFilter: 'blur(12px)' }} aria-label="Settings" onClick={() => push('settings')}>
          <Settings size={20} />
        </button>
      </div>

      <div className="live-panel">
        <div className="card gauge-card fade">
          <SpeedGauge speed={cur.v} limit={cur.limit} />
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <div className="limit-sign num">{cur.limit}</div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontWeight: 650 }}>{road?.name ?? '—'}</div>
                <div className="muted" style={{ fontSize: 12 }}>Speed limit</div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Heading to</div>
            <div style={{ fontWeight: 650 }} className="ellipsis">{home?.name ?? 'Destination'}</div>
            <div className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {fmtKm(remaining.d)} · ETA {fmtDuration(remaining.sec)}
            </div>
          </div>
        </div>

        {lastCritical && (
          <button className="banner" style={{ marginTop: 12 }} onClick={() => push('incident', { alertId: lastCritical.id })}>
            <div className="glyph crit"><Siren size={18} /></div>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>Possible collision {fmtAgo(lastCritical.t)}</div>
              <div className="muted" style={{ fontSize: 13 }}>{Math.round(lastCritical.fromKmh)} → {Math.round(lastCritical.toKmh)} km/h in {lastCritical.durationSec.toFixed(1)} s · evidence locked</div>
            </div>
            <ChevronRight className="chev" size={18} />
          </button>
        )}

        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="stat"><div className="label"><RouteIcon size={13} /> Today</div><div className="value"><CountUp value={today.dist / 1000} decimals={1} /><small>km</small></div></div>
          <div className="stat"><div className="label"><Clock size={13} /> Drive time</div><div className="value" style={{ fontSize: 20 }}>{fmtDuration(today.dur)}</div></div>
          <div className="stat">
            <div className="label">Safety</div>
            <div className="row" style={{ gap: 8, marginTop: 4 }}><ScoreRing value={today.score} size={30} stroke={3.5} label={false} /><span className="value" style={{ margin: 0 }}>{today.score}</span></div>
          </div>
        </div>

        <SectionTitle>Controls</SectionTitle>
        <div className="actions">
          <button className={`action ${immobilized ? 'on' : ''}`} onClick={() => setSheet('immobilize')}>
            <div className="glyph">{immobilized ? <Lock size={22} /> : <KeyRound size={22} />}</div>
            {immobilized ? 'Engine cut' : 'Immobilize'}
          </button>
          <button className="action" onClick={() => setSheet('cabin')}><div className="glyph"><Mic size={22} /></div>Listen in</button>
          <button className="action" onClick={() => push('vault', { live: true })}><div className="glyph"><Video size={22} /></div>Dashcam</button>
          <button className="action" onClick={() => setToast('Live location link copied · expires in 1 h')}><div className="glyph"><Share2 size={22} /></div>Share trip</button>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Tracker health · updated just now</div>
          <div className="health">
            <div><Satellite size={18} color="var(--good-ink)" /><b className="num">14</b>GPS sats</div>
            <div><Signal size={18} color="var(--good-ink)" /><b>4G</b>–71 dBm</div>
            <div><BatteryFull size={18} color="var(--good-ink)" /><b className="num">{moving ? '14.1' : '12.6'} V</b>Battery</div>
            <div><KeyRound size={18} color="var(--good-ink)" /><b>ON</b>Ignition</div>
          </div>
          <div className="muted num" style={{ fontSize: 12, marginTop: 12, textAlign: 'center' }}>{formatLatLng(cur.x, cur.y)}</div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="row">
            <div className="glyph crit"><Siren size={18} /></div>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>Test crash detection</div>
              <div className="muted" style={{ fontSize: 13 }}>Injects a ~80 → 4 km/h stop in 2 s into the live stream.</div>
            </div>
            <button className="btn small danger" onClick={live.simulateImpact} disabled={!!live.crash}>Simulate</button>
          </div>
        </div>
      </div>

      <Sheet open={sheet === 'immobilize'} onClose={() => setSheet(null)}>
        <div style={{ textAlign: 'center' }}>
          <div className="glyph crit" style={{ width: 64, height: 64, borderRadius: 20, margin: '6px auto 12px' }}>{immobilized ? <Unlock size={28} /> : <Lock size={28} />}</div>
          <h3>{immobilized ? 'Restore engine?' : 'Immobilize engine?'}</h3>
          <p className="muted" style={{ margin: '6px 0 18px' }}>
            {immobilized
              ? 'The relay will reconnect the fuel pump. The vehicle can be started normally.'
              : 'The relay cuts the fuel pump only once speed drops below 20 km/h, so the vehicle is never stopped at speed.'}
          </p>
          <div className="stack">
            <button className={`btn ${immobilized ? 'primary' : 'danger'}`} onClick={() => { setImmobilized(!immobilized); setSheet(null); setToast(immobilized ? 'Engine restored' : 'Immobilizer armed · engages below 20 km/h'); }}>
              {immobilized ? 'Restore engine' : 'Arm immobilizer'}
            </button>
            <button className="btn" onClick={() => setSheet(null)}>Cancel</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet === 'cabin'} onClose={() => setSheet(null)}>
        <h3>Live cabin audio</h3>
        <p className="muted" style={{ margin: '4px 0 16px' }}>Streaming from the tracker microphone. Everyone in the vehicle should be aware recording is on.</p>
        <LiveWave />
        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => { setSheet(null); setToast('Saved 30 s cabin recording to Vault'); }}><Mic size={18} /> Save last 30 s</button>
          <button className="btn" onClick={() => setSheet(null)}>Stop listening</button>
        </div>
      </Sheet>
    </div>
  );
}

function LiveWave() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 70 }}>
      {Array.from({ length: 40 }, (_, i) => (
        <div key={i} style={{ flex: 1, borderRadius: 3, background: 'var(--accent)', height: '30%', animation: `wave 1.${i % 9}s ease-in-out ${i * 0.05}s infinite alternate` }} />
      ))}
      <style>{'@keyframes wave { from { height: 12%; } to { height: 90%; } }'}</style>
    </div>
  );
}
