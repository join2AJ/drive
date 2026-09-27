import { useEffect, useState } from 'react';
import { Siren, Phone, MapPin, Lock } from 'lucide-react';
import { useApp } from '../state.jsx';
import { formatLatLng } from '../lib/geo.js';

// Full-screen SOS shown the moment the live stream matches the collision rule.
export default function CrashOverlay() {
  const { live, settings, setToast } = useApp();
  const crash = live.crash;
  const total = settings.sosCountdown;
  const [left, setLeft] = useState(total);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!crash) return undefined;
    setLeft(total);
    setSent(false);
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [crash, total]);

  useEffect(() => {
    if (crash && left === 0 && !sent) setSent(true);
  }, [left, crash, sent]);

  if (!crash) return null;
  const r = 86;
  const c = 2 * Math.PI * r;

  return (
    <div className={`sos ${sent ? '' : 'sos-alarm'}`} role="alertdialog" aria-label="Possible collision detected">
      <div className="glyph" style={{ width: 60, height: 60, borderRadius: 20, background: 'rgba(255,255,255,.12)', color: '#fff' }}><Siren size={30} /></div>
      <h2>{sent ? 'Help is on the way' : 'Possible collision'}</h2>
      <p>{sent ? `Location sent to ${settings.contacts.map((x) => x.name.split(' ')[0]).join(' & ')}` : 'Are you OK? We will alert your emergency contacts.'}</p>

      <div className="ring">
        <svg width="190" height="190">
          <circle cx="95" cy="95" r={r} stroke="rgba(255,255,255,.15)" strokeWidth="8" fill="none" />
          <circle cx="95" cy="95" r={r} stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${(c * left) / total} ${c}`} transform="rotate(-90 95 95)" style={{ transition: 'stroke-dasharray 1s linear' }} />
        </svg>
        {sent ? <Phone size={54} /> : <div className="count num">{left}</div>}
      </div>

      <div className="facts">
        <div><b className="num">{Math.round(crash.fromKmh)}→{Math.round(crash.toKmh)}</b>km/h</div>
        <div><b className="num">{crash.durationSec.toFixed(1)} s</b>to stop</div>
        <div><b className="num">{crash.gforce.toFixed(2)} g</b>impact</div>
      </div>
      <div style={{ fontSize: 12.5, color: '#ffcfcf', display: 'grid', gap: 4, marginBottom: 'auto' }}>
        <span><MapPin size={12} style={{ display: 'inline', verticalAlign: -1 }} /> {formatLatLng(crash.x, crash.y)}</span>
        <span><Lock size={12} style={{ display: 'inline', verticalAlign: -1 }} /> Dashcam & cabin audio locked as evidence</span>
      </div>

      <div className="stack" style={{ width: '100%', marginTop: 18 }}>
        <button className="btn danger" onClick={() => { setSent(true); setToast('Calling 112…'); }}><Phone size={20} /> Call 112 now</button>
        <button className="btn ok" onClick={() => { live.resume(); setToast(sent ? 'Contacts notified that you are safe' : 'Alert cancelled · incident saved'); }}>I'm OK — cancel</button>
      </div>
    </div>
  );
}
