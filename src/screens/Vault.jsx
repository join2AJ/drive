import { useMemo, useState } from 'react';
import { Lock, Mic, HardDrive, Cloud, Video, ChevronRight, Trash2 } from 'lucide-react';
import { useApp } from '../state.jsx';
import { DashcamScene, Waveform, MediaPlayer, seedOf, fmtLen } from '../components/Media.jsx';
import { NavBar, SectionTitle, EVENT_META, Sheet } from '../components/ui.jsx';
import { fmtDay, fmtTime, fmtClock } from '../lib/format.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'events', label: 'Event clips' },
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
  { key: 'locked', label: 'Locked' },
];

function mediaTitle(m) {
  if (m.eventType === 'incident') return 'Logged incident';
  if (m.eventType === 'manual') return m.kind === 'audio' ? 'Voice note' : 'Saved clip';
  return EVENT_META[m.eventType]?.label ?? 'Recording';
}

export default function Vault({ push, pop, live }) {
  const { media, live: liveState } = useApp();
  const [filter, setFilter] = useState('all');
  const list = useMemo(
    () => media.filter((m) => (filter === 'all' ? true : filter === 'events' ? m.eventType !== 'manual' : filter === 'locked' ? m.locked : m.kind === filter)),
    [media, filter],
  );
  const usedGB = media.reduce((a, m) => a + m.sizeMB, 0) / 1024 + 17.4;

  return (
    <div className={`screen ${pop ? 'pushed' : ''}`}>
      {pop ? <NavBar title="Dashcam" onBack={pop} /> : <div className="topbar"><h1>Vault</h1></div>}

      <div className="player fade" style={{ aspectRatio: '16 / 9' }}>
        <DashcamScene ts={liveState.now} speed={liveState.cur.v} odo={liveState.idx * (liveState.cur.v / 3.6)} seed={3} />
        <div className="hud">
          <div className="tl"><span className="rec">LIVE</span> FRONT CAM</div>
          <div className="tr">{fmtClock(liveState.now)}</div>
          <div className="bl"><div className="speed">{Math.round(liveState.cur.v)}<span style={{ fontSize: 12 }}> km/h</span></div></div>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: '6px 4px 0' }}>{live ? 'Live view from the tracker camera · 4G' : 'Live front camera · tap a recording below to play'}</div>

      <div className="card tight" style={{ marginTop: 14 }}>
        <div className="row">
          <div className="glyph"><HardDrive size={18} /></div>
          <div className="grow">
            <div style={{ fontWeight: 650, fontSize: 14 }}>SD card · {usedGB.toFixed(1)} / 64 GB</div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${(usedGB / 64) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
            </div>
          </div>
          <span className="badge good"><Cloud size={12} />Backup on</span>
        </div>
      </div>

      <SectionTitle>Recordings</SectionTitle>
      <div className="chips" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      <div className="media-grid">
        {list.filter((m) => m.kind === 'video').map((m) => (
          <button key={m.id} className="media-tile" onClick={() => push('media', { id: m.id })}>
            <div className="frame">
              <DashcamScene ts={m.eventT ?? m.t} speed={40} odo={seedOf(m.id) * 3} camera={m.camera} seed={seedOf(m.id)} />
              <span className="media-badge">
                {m.eventType !== 'manual' || m.locked ? (
                  <span className={`badge ${m.eventType === 'crash' || m.incidentId ? 'crit' : 'warn'}`} style={{ backdropFilter: 'blur(8px)' }}>{m.locked && <Lock size={11} />}{m.eventType === 'incident' ? 'Incident' : m.eventType === 'manual' ? 'Sealed' : EVENT_META[m.eventType].short}</span>
                ) : (
                  <span className="badge" style={{ background: 'rgba(0,0,0,.55)', color: '#fff' }}>Saved</span>
                )}
              </span>
              <span className="media-dur num">{fmtLen(m.duration)}</span>
            </div>
            <div className="info">
              <div className="t ellipsis">{m.camera} · {mediaTitle(m)}</div>
              <div className="m">{fmtDay(m.t)}, {fmtTime(m.t)}</div>
            </div>
          </button>
        ))}
      </div>

      {list.some((m) => m.kind === 'audio') && (
        <>
          <SectionTitle>Audio</SectionTitle>
          <div className="list">
            {list.filter((m) => m.kind === 'audio').map((m) => (
              <button key={m.id} className="list-item" onClick={() => push('media', { id: m.id })}>
                <div className={`glyph ${m.eventType === 'crash' ? 'crit' : 'accent'}`}><Mic size={18} /></div>
                <div className="grow">
                  <div className="title row" style={{ gap: 6 }}>{m.camera === 'Voice note' ? 'Voice note' : `Cabin audio · ${mediaTitle(m)}`}{m.locked && <Lock size={13} className="muted" />}</div>
                  <div className="meta">{fmtDay(m.t)}, {fmtTime(m.t)} · {fmtLen(m.duration)}</div>
                  <div style={{ marginTop: 6 }}><Waveform seed={seedOf(m.id)} bars={40} height={18} spikeAt={m.eventT ? (m.eventT - m.t) / 1000 / m.duration : null} /></div>
                </div>
                <ChevronRight className="chev" size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      {!list.length && <div className="card muted" style={{ textAlign: 'center' }}><Video size={20} style={{ margin: '0 auto 6px' }} />Nothing here yet.</div>}
    </div>
  );
}

export function MediaScreen({ id, pop, push }) {
  const { media, tripById, incidents, placeNameAt, setToast, deleteMedia } = useApp();
  const [confirm, setConfirm] = useState(false);
  const m = media.find((x) => x.id === id);
  if (!m) return <div className="screen pushed"><NavBar title="Recording" onBack={pop} /><div className="card muted">This recording was deleted.</div></div>;
  const inc = incidents.find((i) => i.id === m.incidentId);
  const trip = tripById[m.tripId] ?? (inc ? { samples: inc.gps } : null);
  return (
    <div className="screen pushed">
      <NavBar title={mediaTitle(m)} onBack={pop} />
      <MediaPlayer media={m} trip={trip} onShare={() => setToast('Clip exported to Photos')} />
      {inc && (
        <>
          <SectionTitle>Sealed in case</SectionTitle>
          <button className="list list-item" onClick={() => push('case', { id: inc.id })}>
            <div className="glyph crit"><Lock size={18} /></div>
            <div className="grow">
              <div className="title">{inc.id}</div>
              <div className="meta">Part of an incident · can’t be deleted</div>
            </div>
            <ChevronRight className="chev" size={18} />
          </button>
        </>
      )}
      {tripById[m.tripId] && (
        <>
          <SectionTitle>From trip</SectionTitle>
          <button className="list list-item" onClick={() => push('trip', { id: m.tripId })}>
            <div className="grow">
              <div className="title">{placeNameAt(trip.samples[0]) ?? 'Unknown'} → {placeNameAt(trip.samples[trip.samples.length - 1]) ?? 'Roadside'}</div>
              <div className="meta">{fmtDay(tripById[m.tripId].start)}, {fmtTime(tripById[m.tripId].start)} – {fmtTime(tripById[m.tripId].end)}</div>
            </div>
            <ChevronRight className="chev" size={18} />
          </button>
        </>
      )}
      {!m.locked && (
        <button className="btn" style={{ marginTop: 20, color: 'var(--critical-ink)' }} onClick={() => setConfirm(true)}><Trash2 size={17} /> Delete recording</button>
      )}
      <Sheet open={confirm} onClose={() => setConfirm(false)}>
        <h3>Delete this recording?</h3>
        <p className="muted" style={{ margin: '6px 0 16px' }}>It will be removed from the phone and the tracker's SD card.</p>
        <div className="stack">
          <button className="btn danger" onClick={() => { if (deleteMedia(m.id)) { setToast('Recording deleted'); pop(); } }}>Delete</button>
          <button className="btn" onClick={() => setConfirm(false)}>Keep it</button>
        </div>
      </Sheet>
    </div>
  );
}
