import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Share2, Video, Mic, ChevronRight, FilePlus2 } from 'lucide-react';
import { useApp } from '../state.jsx';
import MapView, { Route, Vehicle, Pin, boundsOf } from '../components/MapView.jsx';
import { SpeedChart, ScoreRing } from '../components/Charts.jsx';
import { NavBar, EVENT_META, EventGlyph, SectionTitle, PlaceIcon } from '../components/ui.jsx';
import { fmtDay, fmtDuration, fmtTime, fmtClock } from '../lib/format.js';
import { fmtINR, tripCost } from '../lib/costs.js';

export function eventLine(e) {
  switch (e.type) {
    case 'crash':
      return `${Math.round(e.fromKmh)} → ${Math.round(e.toKmh)} km/h in ${e.durationSec.toFixed(1)} s · ${e.gforce.toFixed(2)} g`;
    case 'harsh_brake':
    case 'harsh_accel':
      return `${Math.round(e.fromKmh)} → ${Math.round(e.toKmh)} km/h · peak ${e.gforce.toFixed(2)} g`;
    case 'overspeed':
      return `Up to ${Math.round(e.maxKmh)} km/h for ${fmtDuration(e.durationSec)}`;
    default:
      return e.detail ?? e.fence ?? '';
  }
}

export default function TripDetail({ id, pop, push }) {
  const { tripById, thresholds, placeNameAt, placeAt, media, setToast, settings } = useApp();
  const trip = tripById[id];
  const [hover, setHover] = useState(null);
  const [replay, setReplay] = useState(null); // index while replaying
  const [speedX, setSpeedX] = useState(16);
  const raf = useRef();

  const fit = useMemo(() => boundsOf(trip.samples), [trip]);
  const overs = useMemo(() => trip.events.filter((e) => e.type === 'overspeed'), [trip]);
  const tripMedia = media.filter((m) => m.tripId === trip.id);

  useEffect(() => {
    if (replay == null) return undefined;
    let last = performance.now();
    let pos = replay;
    const tick = (now) => {
      pos += ((now - last) / 1000) * speedX;
      last = now;
      if (pos >= trip.samples.length - 1) { setReplay(null); return; }
      setReplay(pos);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay == null, speedX, trip]);

  const cursorI = replay != null ? Math.floor(replay) : hover;
  const cursor = cursorI != null ? trip.samples[cursorI] : null;
  const heading = cursorI != null ? Math.atan2(trip.samples[Math.min(cursorI + 2, trip.samples.length - 1)].y - cursor.y, trip.samples[Math.min(cursorI + 2, trip.samples.length - 1)].x - cursor.x) : 0;

  const from = placeAt(trip.samples[0]);
  const toPt = trip.samples[trip.samples.length - 1];
  const to = placeAt(toPt);
  const s = trip.summary;

  return (
    <div className="screen pushed">
      <NavBar title={`${placeNameAt(trip.samples[0]) ?? 'Trip'} → ${placeNameAt(toPt) ?? 'Roadside'}`} onBack={pop} right={<button className="icon-btn ghost" aria-label="Share" onClick={() => setToast('Trip report link copied')}><Share2 size={20} /></button>} />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapView fit={fit} fitKey={trip.id} style={{ height: 300 }}>
          {(k) => (
            <>
              <Route points={trip.samples} k={k} width={5} step={2} />
              {overs.map((o, n) => (
                <Route key={n} points={trip.samples.slice(o.startI, o.endI + 1)} k={k} width={5} color="var(--critical)" casing={false} />
              ))}
              <Pin x={trip.samples[0].x} y={trip.samples[0].y} k={k} color="var(--good)" size={22} icon={<PlaceIcon name={from?.icon ?? 'pin'} size={24} />} />
              <Pin x={toPt.x} y={toPt.y} k={k} color={trip.events.some((e) => e.type === 'crash') ? 'var(--critical)' : 'var(--accent)'} size={22} icon={<PlaceIcon name={to?.icon ?? 'pin'} size={24} />} />
              {trip.events.filter((e) => e.type !== 'overspeed' && e.type !== 'crash').map((e, n) => (
                <circle key={n} cx={e.x} cy={e.y} r={6 * k} fill="var(--warning)" stroke="var(--surface)" strokeWidth={2 * k} />
              ))}
              {cursor && <Vehicle x={cursor.x} y={cursor.y} heading={heading} k={k} pulse={false} />}
            </>
          )}
        </MapView>
        <div className="row" style={{ padding: '10px 12px', gap: 10 }}>
          <button className="icon-btn" style={{ background: 'var(--accent)', color: '#fff' }} aria-label={replay != null ? 'Pause replay' : 'Replay trip'} onClick={() => setReplay(replay != null ? null : 0)}>
            {replay != null ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" />}
          </button>
          <div className="grow">
            <div style={{ fontWeight: 650, fontSize: 14 }}>{replay != null ? `Replaying · ${fmtClock(cursor.t)}` : 'Replay trip'}</div>
            <div className="muted num" style={{ fontSize: 12 }}>{cursor ? `${Math.round(cursor.v)} km/h` : `${fmtDay(trip.start)}, ${fmtTime(trip.start)} – ${fmtTime(trip.end)}`}</div>
          </div>
          <button className="chip" onClick={() => setSpeedX(speedX === 16 ? 64 : speedX === 64 ? 4 : 16)}>{speedX}×</button>
        </div>
      </div>

      <div className="grid-4" style={{ marginTop: 12 }}>
        {[
          ['Distance', (s.distance / 1000).toFixed(1), 'km'],
          ['Duration', Math.round(s.duration / 60), 'min'],
          ['Avg', Math.round(s.avgV), 'km/h'],
          ['Fuel', fmtINR(tripCost(s, settings.fuel).cost), `${tripCost(s, settings.fuel).litres.toFixed(2)} L`],
        ].map(([l, v, u]) => (
          <div key={l} className="stat" style={{ padding: 10 }}>
            <div className="label" style={{ fontSize: 11 }}>{l}</div>
            <div className="value num" style={{ fontSize: 19 }}>{v}</div>
            <div className="muted" style={{ fontSize: 11 }}>{u}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <div className="grow">
            <div className="card-title" style={{ margin: 0 }}>Speed</div>
            <div className="muted" style={{ fontSize: 12 }}>Top {Math.round(s.maxV)} km/h · idle {fmtDuration(s.idle)} · drag to scrub</div>
          </div>
          <ScoreRing value={trip.score} size={44} stroke={4} />
        </div>
        <SpeedChart samples={trip.samples} events={trip.events} threshold={thresholds.overspeedKmh} onHover={setHover} highlight={replay != null ? Math.floor(replay) : null} formatX={(t) => fmtTime(t)} />
        <div className="legend">
          <span><i style={{ background: 'var(--accent)' }} />Speed</span>
          <span><i style={{ background: 'var(--critical)' }} />Over {thresholds.overspeedKmh} km/h</span>
          <span><i className="box" style={{ background: 'var(--warning)', borderRadius: 5 }} />Event</span>
        </div>
      </div>

      <SectionTitle>{trip.events.length ? `Events (${trip.events.length})` : 'Events'}</SectionTitle>
      {trip.events.length ? (
        <div className="list">
          {trip.events.map((e, n) => (
            <button key={n} className="list-item" onClick={() => (e.type === 'crash' ? push('incident', { alertId: `${trip.id}-crash-${e.i}` }) : setHover(e.i))}>
              <EventGlyph type={e.type} />
              <div className="grow">
                <div className="title">{EVENT_META[e.type].label}</div>
                <div className="meta num">{fmtClock(e.t)} · {eventLine(e)}</div>
              </div>
              {e.type === 'crash' && <ChevronRight className="chev" size={18} />}
            </button>
          ))}
        </div>
      ) : (
        <div className="card muted" style={{ textAlign: 'center' }}>No harsh events. Smooth, steady drive.</div>
      )}

      {tripMedia.length > 0 && (
        <>
          <SectionTitle>Recordings</SectionTitle>
          <div className="list">
            {tripMedia.map((m) => (
              <button key={m.id} className="list-item" onClick={() => push('media', { id: m.id })}>
                <div className="glyph accent">{m.kind === 'video' ? <Video size={18} /> : <Mic size={18} />}</div>
                <div className="grow">
                  <div className="title">{m.camera} {m.kind === 'video' ? 'camera' : ''}</div>
                  <div className="meta">{fmtClock(m.t)} · {m.duration}s{m.locked ? ' · locked' : ''}</div>
                </div>
                <ChevronRight className="chev" size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      <button className="btn" style={{ marginTop: 20, color: 'var(--critical-ink)' }} onClick={() => push('newIncident', { tripId: trip.id })}>
        <FilePlus2 size={18} /> Log an incident on this trip
      </button>
    </div>
  );
}
