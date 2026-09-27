import { useMemo, useState } from 'react';
import { Flame, Lightbulb } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';
import { hotspots } from '../lib/engagement.js';
import { fmtAgo, fmtHour } from '../lib/format.js';

const TYPES = {
  harsh: { label: 'Braking', types: ['harsh_brake'] },
  launch: { label: 'Launches', types: ['harsh_accel'] },
  speed: { label: 'Speeding', types: ['overspeed'] },
  all: { label: 'All', types: ['harsh_brake', 'harsh_accel', 'overspeed'] },
};
const NOUN = { harsh_brake: 'harsh brake', harsh_accel: 'hard launch', overspeed: 'overspeed' };

function tip(h) {
  const top = Object.entries(h.byType).sort((a, b) => b[1] - a[1])[0][0];
  const when = `${fmtHour(h.peakHour)}–${fmtHour(h.peakHour + 1)}`;
  if (top === 'harsh_brake') return `Traffic bunches up at ${h.name} around ${when}. Leave a 3-second gap here.`;
  if (top === 'overspeed') return `You tend to speed up near ${h.name}. Watch for the speed camera.`;
  return `Quick starts at ${h.name} cost fuel. Ease off for the first few seconds.`;
}

export default function Hotspots({ pop }) {
  const { trips } = useApp();
  const [type, setType] = useState('harsh');
  const [sel, setSel] = useState(null);
  const list = useMemo(() => hotspots(trips, { types: TYPES[type].types }), [trips, type]);
  const max = Math.max(1, ...list.map((h) => h.count));

  return (
    <div className="screen pushed">
      <NavBar title="Hotspots" onBack={pop} />
      <Segmented options={Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label }))} value={type} onChange={(v) => { setType(v); setSel(null); }} />

      <div className="card fade" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <MapView fitKey={`hs${type}`} fit={{ minX: -200, minY: -200, maxX: 8900, maxY: 12100 }} style={{ height: 300 }} controls>
          {(k) => list.map((h, i) => (
            <g key={i} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <circle cx={h.x} cy={h.y} r={(10 + 20 * Math.sqrt(h.count / max)) * k} fill="var(--critical)" fillOpacity={sel === i ? 0.45 : 0.22} stroke="var(--critical)" strokeWidth={1.5 * k} />
              <text x={h.x} y={h.y + 4 * k} textAnchor="middle" fontSize={12 * k} fontWeight={750} fill="var(--ink)" stroke="var(--page)" strokeWidth={3 * k} paintOrder="stroke">{h.count}</text>
            </g>
          ))}
        </MapView>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: '6px 4px 0' }}>Places where the same event happened 2+ times in 6 weeks. Tap a circle.</div>

      {list[sel ?? 0] && (
        <div className="banner info" style={{ marginTop: 12 }}>
          <div className="glyph accent"><Lightbulb size={18} /></div>
          <div className="ink2" style={{ fontSize: 13.5 }}>{tip(list[sel ?? 0])}</div>
        </div>
      )}

      <SectionTitle>{list.length} hotspot{list.length === 1 ? '' : 's'}</SectionTitle>
      <div className="list">
        {list.map((h, i) => (
          <button key={i} className="list-item" onClick={() => setSel(i)} style={{ background: sel === i ? 'var(--surface-2)' : undefined }}>
            <div className="glyph crit"><Flame size={17} /></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="title ellipsis">{h.name}</div>
              <div className="meta">{Object.entries(h.byType).map(([t, n]) => `${n} ${NOUN[t]}${n > 1 ? 's' : ''}`).join(' · ')} · mostly {fmtHour(h.peakHour)} · last {fmtAgo(h.last)}</div>
            </div>
            <b className="num">{h.count}</b>
          </button>
        ))}
        {!list.length && <div className="list-item muted">No repeated trouble spots. Nice.</div>}
      </div>
    </div>
  );
}
