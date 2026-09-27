import { useEffect, useRef } from 'react';
import { AlarmClock, Phone, Share2, Check } from 'lucide-react';
import { useApp } from '../state.jsx';
import { describePoint } from '../data/cityModel.js';
import { fmtDuration } from '../lib/format.js';

/** Two-tone siren with Web Audio; returns a stop function. */
function startSiren() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.connect(gain);
    osc.start();
    let hi = false;
    const id = setInterval(() => {
      hi = !hi;
      osc.frequency.setValueAtTime(hi ? 960 : 720, ctx.currentTime);
    }, 350);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      clearInterval(id);
      try { osc.stop(); } catch { /* already stopped */ }
      ctx.close().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

// Full-screen alarm when the vehicle leaves its planned route for longer than the grace time.
export default function RouteAlarm() {
  const { routeState, ackRouteAlarm, routeWatch, live, settings, vehicle, setToast } = useApp();
  const alarm = routeState.alarm;
  const stopRef = useRef(null);

  useEffect(() => {
    if (!alarm) return undefined;
    if (routeWatch.sound) stopRef.current = startSiren();
    if (navigator.vibrate) navigator.vibrate([600, 250, 600, 250, 600]);
    return () => { stopRef.current?.(); stopRef.current = null; };
  }, [alarm, routeWatch.sound]);

  if (!alarm) return null;
  const offSec = routeState.offSince ? (live.now - routeState.offSince) / 1000 : 0;
  const dist = routeState.current ? routeState.dist : alarm.dist;
  const back = !routeState.current;

  return (
    <div className="sos route-alarm" role="alertdialog" aria-label="Vehicle left its route">
      <div className="glyph" style={{ width: 60, height: 60, borderRadius: 20, background: 'rgba(0,0,0,.18)', color: '#1a1200' }}><AlarmClock size={30} /></div>
      <h2>{back ? 'Back on route' : 'Off route!'}</h2>
      <p>{vehicle.name} · {vehicle.plate}</p>
      <div className="facts" style={{ marginTop: 22 }}>
        <div><b className="num">{Math.round(dist)} m</b>{back ? 'now' : 'off route'}</div>
        <div><b className="num">{fmtDuration(offSec || routeWatch.graceSec)}</b>away</div>
        <div><b className="num">{Math.round(live.cur.v)}</b>km/h</div>
      </div>
      <p style={{ fontSize: 14 }}>Near {describePoint(live.cur)} · limit {routeWatch.corridorM} m from the planned route</p>
      {routeWatch.notifyContacts && <p style={{ fontSize: 12.5, marginTop: 6 }}>Alert also sent to {settings.contacts.filter((c) => c.phone !== '112').map((c) => c.name.split(' ')[0]).join(', ')}</p>}
      <div className="stack" style={{ width: '100%', marginTop: 'auto' }}>
        <button className="btn" style={{ background: '#1a1200', color: '#fff' }} onClick={() => setToast(`Driver: ${settings.claimProfile.phone}`)}><Phone size={20} /> Call driver</button>
        <button className="btn" style={{ background: 'rgba(0,0,0,.15)', color: '#1a1200' }} onClick={() => setToast('Live location link copied')}><Share2 size={20} /> Share live location</button>
        <button className="btn ok" onClick={() => { stopRef.current?.(); ackRouteAlarm(); }}><Check size={20} /> Acknowledge</button>
      </div>
    </div>
  );
}
