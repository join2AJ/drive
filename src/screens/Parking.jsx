import { useEffect, useRef, useState } from 'react';
import { Navigation, Timer, Camera, X, ParkingSquare } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle } from '../components/ui.jsx';
import MapView, { Pin } from '../components/MapView.jsx';
import { describePoint } from '../data/cityModel.js';
import { toLatLng, formatLatLng } from '../lib/geo.js';
import { compressImage } from '../lib/evidence.js';
import { fmtAgo, fmtTime, fmtDuration } from '../lib/format.js';
import { fmtINR } from '../lib/costs.js';

export default function Parking({ pop }) {
  const { live, controls, parking, setParking, placeAt, settings, setToast } = useApp();
  const [, tick] = useState(0);
  const fileRef = useRef();
  const alerted = useRef(false);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);

  // While the car is being driven, the last parking spot is where this trip started.
  const driving = !controls.parkedDemo && live.cur.v > 1;
  const spot = driving ? live.samples[0] : live.cur;
  const since = driving ? live.tripStart : live.now;
  const place = placeAt(spot);
  const fee = place ? settings.parkingFees?.[place.key] : null;
  const { lat, lng } = toLatLng(spot.x, spot.y);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=walking`;

  const now = Date.now();
  const left = parking.timerUntil ? Math.round((parking.timerUntil - now) / 1000) : null;
  useEffect(() => {
    if (left != null && left <= 600 && left > 0 && !alerted.current) {
      alerted.current = true;
      setToast('Parking ends in 10 minutes');
      try { if (Notification?.permission === 'granted') new Notification('Parking ends in 10 minutes'); } catch { /* unsupported */ }
    }
  }, [left, setToast]);

  const startTimer = (min) => {
    alerted.current = false;
    setParking({ ...parking, timerUntil: Date.now() + min * 60_000, timerMin: min });
    setToast(`Timer set · reminder 10 min before`);
    try { Notification?.requestPermission?.(); } catch { /* unsupported */ }
  };
  const mm = (s) => `${Math.floor(Math.abs(s) / 3600) ? `${Math.floor(Math.abs(s) / 3600)}:` : ''}${String(Math.floor((Math.abs(s) % 3600) / 60)).padStart(2, '0')}:${String(Math.abs(s) % 60).padStart(2, '0')}`;

  return (
    <div className="screen pushed">
      <NavBar title="Where I parked" onBack={pop} />
      <div className="card fade" style={{ padding: 0, overflow: 'hidden' }}>
        <MapView fitKey="parking" fit={{ minX: spot.x - 450, maxX: spot.x + 450, minY: spot.y - 350, maxY: spot.y + 350 }} style={{ height: 230 }}>
          {(k) => <Pin x={spot.x} y={spot.y} k={k} color="var(--good)" size={30} icon={<ParkingSquare size={24} />} label={place?.name ?? 'Your car'} />}
        </MapView>
        <div style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{place?.name ?? describePoint(spot)}</div>
          <div className="muted num" style={{ fontSize: 12.5 }}>{formatLatLng(spot.x, spot.y)}</div>
          <div className="ink2" style={{ fontSize: 13, marginTop: 4 }}>
            {driving ? `Parked here until ${fmtTime(since)} — the car is being driven now.` : `Parked ${fmtAgo(since)} (${fmtTime(since)})`}
            {fee ? ` · parking ${fmtINR(fee)}` : ''}
          </div>
          <a className="btn primary" style={{ marginTop: 12, textDecoration: 'none' }} href={mapsUrl} target="_blank" rel="noreferrer"><Navigation size={18} /> Walk to my car</a>
        </div>
      </div>

      <SectionTitle>Parking timer</SectionTitle>
      <div className="card">
        {left != null && left > -3600 ? (
          <div style={{ textAlign: 'center' }}>
            <div className="num" style={{ fontSize: 44, fontWeight: 800, color: left < 0 ? 'var(--critical-ink)' : left < 600 ? 'var(--warning)' : 'var(--ink)' }}>{left < 0 ? '−' : ''}{mm(left)}</div>
            <div className="muted" style={{ fontSize: 13 }}>{left < 0 ? 'Time is up' : `Ends at ${fmtTime(parking.timerUntil)} · ${fmtDuration(parking.timerMin * 60)} ticket`}</div>
            <div className="progress" style={{ marginTop: 12 }}><div style={{ width: `${Math.max(0, Math.min(100, (left / (parking.timerMin * 60)) * 100))}%` }} /></div>
            <button className="btn small" style={{ marginTop: 12 }} onClick={() => setParking({ ...parking, timerUntil: null })}><X size={15} /> Stop timer</button>
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 8, marginBottom: 10 }}><Timer size={16} className="muted" /><span className="ink2" style={{ fontSize: 13.5 }}>Get a reminder 10 minutes before your ticket runs out.</span></div>
            <div className="grid-4">{[30, 60, 120, 180].map((m) => <button key={m} className="btn small" style={{ width: '100%' }} onClick={() => startTimer(m)}>{m < 60 ? `${m}m` : `${m / 60}h`}</button>)}</div>
          </>
        )}
      </div>

      <SectionTitle>Spot details</SectionTitle>
      <div className="card stack">
        <div className="field">
          <label htmlFor="pnote">Level, pillar or landmark</label>
          <input id="pnote" value={parking.note} placeholder="e.g. Level B2, pillar 14, near lift" onChange={(e) => setParking({ ...parking, note: e.target.value })} />
        </div>
        {parking.photo ? (
          <div style={{ position: 'relative' }}>
            <img src={parking.photo} alt="Parking spot" style={{ width: '100%', borderRadius: 14 }} />
            <button className="icon-btn" style={{ position: 'absolute', top: 8, right: 8 }} aria-label="Remove photo" onClick={() => setParking({ ...parking, photo: null })}><X size={16} /></button>
          </div>
        ) : (
          <button className="btn" onClick={() => fileRef.current.click()}><Camera size={18} /> Photo of the spot</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files[0]; if (f) { try { setParking({ ...parking, photo: await compressImage(f, 700) }); } catch { setToast('Could not read that photo'); } } e.target.value = ''; }} />
      </div>
    </div>
  );
}
