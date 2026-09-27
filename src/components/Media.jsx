import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Lock, Share2, Download, RotateCcw } from 'lucide-react';
import { mulberry32 } from '../lib/rng.js';
import { fmtClock } from '../lib/format.js';
import { formatLatLng } from '../lib/geo.js';

// Stylised dashcam / cabin-cam renderer. In the demo there's no real footage, so we render a
// scene driven by the recorded telemetry (speed, time of day) — the HUD overlay is exactly
// what a real player would draw on top of the tracker's MP4.

function skyFor(hour) {
  if (hour < 5 || hour >= 20) return ['#050914', '#0f1a33', '#161c28'];
  if (hour < 7) return ['#23305a', '#e39a6b', '#3b3a40'];
  if (hour < 17) return ['#6fa6dc', '#cfe3f3', '#8a8f8f'];
  if (hour < 19) return ['#3a4f86', '#f0a36b', '#5a5552'];
  return ['#141d3a', '#6f5a7d', '#2d2c33'];
}

export function DashcamScene({ ts, speed = 40, odo = 0, camera = 'Front', seed = 1, shake = 0, width = 320, height = 200 }) {
  const hour = new Date(ts).getHours();
  const [s0, s1, ground] = skyFor(hour);
  const night = hour < 6 || hour >= 19;
  const rand = mulberry32(seed);
  const buildings = useMemo(() => {
    const out = [];
    for (let side = -1; side <= 1; side += 2) {
      let x = side < 0 ? 0 : width;
      for (let k = 0; k < 7; k++) {
        const w = 20 + rand() * 40;
        const h = 18 + rand() * 50;
        out.push({ x: side < 0 ? x : x - w, w, h, lit: rand() });
        x += side * (w + 2);
        if (side < 0 ? x > width * 0.38 : x < width * 0.62) break;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, width]);
  const hy = height * 0.48;
  const vx = width / 2;

  if (camera === 'Cabin') {
    // IR cabin camera: monochrome interior.
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ transform: shake ? `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px)` : undefined }}>
        <defs>
          <radialGradient id={`ir${seed}`} cx="50%" cy="40%" r="70%">
            <stop offset="0" stopColor="#5d6b62" />
            <stop offset="1" stopColor="#141816" />
          </radialGradient>
        </defs>
        <rect width={width} height={height} fill={`url(#ir${seed})`} />
        <path d={`M0 ${height * 0.35} Q${vx} ${height * 0.15} ${width} ${height * 0.35} L${width} ${height * 0.5} Q${vx} ${height * 0.33} 0 ${height * 0.5}Z`} fill="#8a9a90" opacity="0.35" />
        {/* seats */}
        <rect x={width * 0.12} y={height * 0.42} width={width * 0.24} height={height * 0.6} rx={18} fill="#232a26" />
        <rect x={width * 0.64} y={height * 0.42} width={width * 0.24} height={height * 0.6} rx={18} fill="#232a26" />
        {/* driver */}
        <circle cx={width * 0.25} cy={height * 0.42} r={height * 0.1} fill="#a9b7ad" opacity="0.75" />
        <path d={`M${width * 0.14} ${height} Q${width * 0.25} ${height * 0.5} ${width * 0.36} ${height}Z`} fill="#8f9c93" opacity="0.6" />
        <rect x={0} y={height * 0.86} width={width} height={height * 0.14} fill="#0e110f" />
      </svg>
    );
  }

  const dashes = [];
  for (let k = 0; k < 10; k++) {
    const z0 = ((k * 9 - (odo % 9)) + 90) % 90 + 2;
    const z1 = z0 + 3.5;
    const y0 = hy + (height * 1.6) / z0 * 3;
    const y1 = hy + (height * 1.6) / z1 * 3;
    if (y0 > height + 40) continue;
    const w0 = 30 / z0 * 3;
    const w1 = 30 / z1 * 3;
    dashes.push(<path key={k} d={`M${vx - w0} ${y0}L${vx + w0} ${y0}L${vx + w1} ${y1}L${vx - w1} ${y1}Z`} fill={night ? '#c9c9b5' : '#f4f2e6'} opacity={0.9} />);
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ transform: shake ? `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px) rotate(${(Math.random() - 0.5) * shake * 0.2}deg)` : undefined }}>
      <defs>
        <linearGradient id={`sky${seed}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={s0} />
          <stop offset="1" stopColor={s1} />
        </linearGradient>
      </defs>
      <rect width={width} height={hy} fill={`url(#sky${seed})`} />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={hy - b.h} width={b.w} height={b.h} fill={night ? '#0b0f18' : '#6b7178'} opacity={night ? 1 : 0.7} />
          {night && b.lit > 0.4 && <rect x={b.x + 4} y={hy - b.h + 5} width={3} height={3} fill="#f6d36b" />}
        </g>
      ))}
      <rect y={hy} width={width} height={height - hy} fill={ground} />
      <path d={`M${vx - 6} ${hy}L${vx + 6} ${hy}L${width * 1.05} ${height}L${-width * 0.05} ${height}Z`} fill={night ? '#1d1f24' : '#4a4d52'} />
      {dashes}
      {night && <path d={`M${vx - 130} ${height}L${vx - 18} ${hy + 10}L${vx + 18} ${hy + 10}L${vx + 130} ${height}Z`} fill="#fff7d6" opacity="0.08" />}
      {/* bonnet */}
      <path d={`M0 ${height} Q${vx} ${height * 0.84} ${width} ${height}Z`} fill="#0b0b0c" />
      {speed < 1 && <rect width={width} height={height} fill="#000" opacity="0.12" />}
    </svg>
  );
}

export function Waveform({ seed = 1, bars = 56, progress = 0, spikeAt = null, height = 44 }) {
  const heights = useMemo(() => {
    const r = mulberry32(seed);
    return Array.from({ length: bars }, (_, i) => {
      const base = 0.18 + r() * 0.35 + Math.sin(i / 3) * 0.08;
      if (spikeAt != null && Math.abs(i / bars - spikeAt) < 0.035) return 1;
      return Math.min(0.9, base);
    });
  }, [seed, bars, spikeAt]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height }}>
      {heights.map((h, i) => (
        <div key={i} style={{ flex: 1, height: `${h * 100}%`, borderRadius: 2, background: i / bars <= progress ? 'var(--accent)' : 'var(--surface-3)', transition: 'background .15s' }} />
      ))}
    </div>
  );
}

function sampleAt(samples, t) {
  if (!samples?.length) return null;
  let lo = 0;
  let hi = samples.length - 1;
  if (t <= samples[0].t) return samples[0];
  if (t >= samples[hi].t) return samples[hi];
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (samples[m].t <= t) lo = m;
    else hi = m;
  }
  const f = (t - samples[lo].t) / (samples[hi].t - samples[lo].t);
  return { ...samples[lo], v: samples[lo].v + (samples[hi].v - samples[lo].v) * f, x: samples[lo].x + (samples[hi].x - samples[lo].x) * f, y: samples[lo].y + (samples[hi].y - samples[lo].y) * f };
}

/** Full player: dashcam video (telemetry-driven) or audio with waveform. */
export function MediaPlayer({ media, trip, onShare }) {
  const [pos, setPosState] = useState(0);
  const [playing, setPlaying] = useState(true);
  const posRef = useRef(0);
  const odo = useRef(0);
  const setPos = (p) => { posRef.current = p; setPosState(p); };

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = null;
    const tick = (now) => {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      const np = Math.min(media.duration, posRef.current + dt);
      const s = sampleAt(trip?.samples, media.t + np * 1000);
      odo.current += ((s?.v ?? 0) / 3.6) * dt;
      posRef.current = np;
      setPosState(np);
      if (np >= media.duration) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, media, trip]);

  const now = media.t + pos * 1000;
  const s = sampleAt(trip?.samples, now);
  const nearEvent = media.eventT && Math.abs(now - media.eventT) < 900;
  const shake = nearEvent ? (media.eventType === 'crash' ? 14 : 5) : 0;
  const pct = pos / media.duration;
  const spikeAt = media.eventT ? (media.eventT - media.t) / 1000 / media.duration : null;

  return (
    <div className="stack">
      {media.kind === 'video' ? (
        <div className="player" style={{ aspectRatio: '16 / 10' }}>
          <DashcamScene ts={now} speed={s?.v ?? 0} odo={odo.current} camera={media.camera} seed={Number(media.id.slice(1))} shake={shake} />
          {nearEvent && media.eventType === 'crash' && <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.35 }} />}
          <div className="hud">
            <div className="tl"><span className="rec">REC</span> {media.camera.toUpperCase()} CAM</div>
            <div className="tr">{new Date(now).toLocaleDateString()}<br />{fmtClock(now)}</div>
            <div className="bl">
              <div className="speed">{Math.round(s?.v ?? 0)}<span style={{ fontSize: 12 }}> km/h</span></div>
              {s && <div>{formatLatLng(s.x, s.y)}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 18 }}>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="glyph accent"><span className="rec" style={{ fontSize: 0 }} /></div>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>{media.camera}</div>
              <div className="muted" style={{ fontSize: 13 }}>{fmtClock(now)} · {Math.round(s?.v ?? 0)} km/h</div>
            </div>
          </div>
          <Waveform seed={Number(media.id.slice(1))} progress={pct} spikeAt={spikeAt} height={64} bars={64} />
        </div>
      )}

      <div>
        <input
          className="scrub"
          type="range"
          min={0}
          max={media.duration}
          step={0.1}
          value={pos}
          aria-label="Seek"
          onChange={(e) => { setPos(Number(e.target.value)); }}
        />
        <div className="row muted num" style={{ justifyContent: 'space-between', fontSize: 12 }}>
          <span>{pos.toFixed(0)}s</span>
          {spikeAt != null && <span style={{ color: 'var(--critical-ink)' }}>Event at {(spikeAt * media.duration).toFixed(0)}s</span>}
          <span>{media.duration}s</span>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
        <button className="icon-btn" aria-label="Restart" onClick={() => { setPos(0); setPlaying(true); }}><RotateCcw size={18} /></button>
        <button className="icon-btn" style={{ width: 60, height: 60, background: 'var(--accent)', color: '#fff' }} aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (pos >= media.duration) setPos(0); setPlaying(!playing); }}>
          {playing ? <Pause size={26} fill="#fff" /> : <Play size={26} fill="#fff" />}
        </button>
        <button className="icon-btn" aria-label="Share" onClick={onShare}><Share2 size={18} /></button>
      </div>

      <div className="grid-2">
        <button className="btn small" style={{ width: '100%' }} onClick={onShare}><Download size={16} /> Save to phone</button>
        <div className="btn small" style={{ width: '100%', background: media.locked ? 'var(--critical-soft)' : undefined, color: media.locked ? 'var(--critical-ink)' : undefined }}>
          <Lock size={16} /> {media.locked ? 'Locked evidence' : 'Kept 30 days'}
        </div>
      </div>
    </div>
  );
}
