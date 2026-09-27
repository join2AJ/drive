import { useApp } from '../state.jsx';
import MapView, { Route, Vehicle, Pin } from '../components/MapView.jsx';
import { PlaceIcon } from '../components/ui.jsx';
import { describePoint } from '../data/cityModel.js';
import { formatLatLng } from '../lib/geo.js';
import { fmtDuration, fmtKm } from '../lib/format.js';

// What a family member (or the police, for pol- links) sees when they open a shared link.
// In production this page is served by your backend and streams the one vehicle's position;
// here it reads the demo's live stream.
export default function ShareViewer({ token }) {
  const { live, vehicle, share, stolen, placeAt, remainingM } = useApp();
  const police = token.startsWith('pol-');
  const valid = police ? stolen.active && stolen.token === token : share?.token === token ? share.active : true;
  const dest = live.ahead[live.ahead.length - 1];
  const home = placeAt(dest);
  const eta = (live.ahead[live.ahead.length - 1].t - live.ahead[0].t) / 1000;

  return (
    <div className="screen flush" style={{ padding: 0 }}>
      <MapView fitKey="shared" fit={{ minX: live.cur.x - 900, maxX: live.cur.x + 900, minY: live.cur.y - 900, maxY: live.cur.y + 900 }} follow={live.cur} style={{ position: 'absolute', inset: 0 }} controlsTop="calc(var(--safe-top) + 90px)">
        {(k) => (
          <>
            {!police && <Route points={live.ahead} k={k} color="var(--ink-3)" width={4} dashed casing={false} step={3} />}
            <Route points={live.trail.slice(-400)} k={k} color={police ? 'var(--critical)' : 'var(--accent)'} width={5} />
            {!police && <Pin x={dest.x} y={dest.y} k={k} color="var(--violet)" icon={<PlaceIcon name={home?.icon ?? 'home'} size={24} />} />}
            <Vehicle x={live.cur.x} y={live.cur.y} heading={live.heading} k={k} color={police ? 'var(--critical)' : 'var(--accent)'} />
          </>
        )}
      </MapView>
      <div className="live-top" style={{ background: 'linear-gradient(var(--page) 30%, transparent)' }}>
        <div className="vehicle-pill">
          <div className="name">{police ? `STOLEN · ${vehicle.plate}` : 'Arjun is on the way'}</div>
          <div className="status">{police ? `${vehicle.name} · IMEI ${vehicle.device.imei}` : `${vehicle.name} · shared live location`}</div>
        </div>
      </div>
      <div className="sheet" style={{ animation: 'none', position: 'absolute' }}>
        <div className="grabber" />
        {!valid ? (
          <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
            <h3>This link has ended</h3>
            <p className="muted" style={{ margin: 0 }}>{police ? 'The owner has turned off stolen-vehicle mode.' : 'The trip finished and sharing stopped automatically.'}</p>
          </div>
        ) : (
          <div className="grid-3" style={{ textAlign: 'center' }}>
            <div><div className="num" style={{ fontSize: 22, fontWeight: 750 }}>{Math.round(live.cur.v)}</div><div className="muted" style={{ fontSize: 12 }}>km/h</div></div>
            {police ? (
              <div style={{ gridColumn: 'span 2' }}><div style={{ fontWeight: 650 }}>{describePoint(live.cur)}</div><div className="muted num" style={{ fontSize: 12 }}>{formatLatLng(live.cur.x, live.cur.y)}</div></div>
            ) : (
              <>
                <div><div className="num" style={{ fontSize: 22, fontWeight: 750 }}>{fmtDuration(eta)}</div><div className="muted" style={{ fontSize: 12 }}>to {home?.name ?? 'destination'}</div></div>
                <div><div className="num" style={{ fontSize: 22, fontWeight: 750 }}>{fmtKm(remainingM)}</div><div className="muted" style={{ fontSize: 12 }}>left</div></div>
              </>
            )}
          </div>
        )}
        <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 12 }}>Updates every {police ? '5' : '10'} s · Drive</div>
      </div>
    </div>
  );
}
