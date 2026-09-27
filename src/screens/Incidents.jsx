import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Siren, ShieldCheck, Video, Mic, Camera, ChevronRight, Copy, Share2, Download, Send, Lock, Plus, Minus, Square, FileText, History, MapPin,
} from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented, Sheet } from '../components/ui.jsx';
import MapView, { Route, Pin, boundsOf } from '../components/MapView.jsx';
import { INCIDENT_TYPES, DAMAGE_ZONES, STATEMENT_PROMPTS, compressImage } from '../lib/evidence.js';
import { roadAt } from '../data/cityModel.js';
import { formatLatLng } from '../lib/geo.js';
import { fmtClock, fmtDay, fmtDuration, fmtTime } from '../lib/format.js';

export const typeLabel = (k) => INCIDENT_TYPES.find((t) => t.key === k)?.label ?? 'Incident';
const STATUS = { open: ['Open', 'warn'], ready: ['Claim ready', 'accent'], submitted: ['Submitted', 'good'] };

export function StatusBadge({ status }) {
  const [l, tone] = STATUS[status] ?? STATUS.open;
  return <span className={`badge ${tone}`}>{l}</span>;
}

// ---------------------------------------------------------------------------
// Step-by-step logging: what happened → when → seal evidence.

export function IncidentNew({ pop, replace, tripId: initialTrip }) {
  const { live, trips, createIncident, setToast, placeNameAt } = useApp();
  const [type, setType] = useState(null);
  const [when, setWhen] = useState(initialTrip ? 'earlier' : 'now');
  const [tripId, setTripId] = useState(initialTrip ?? null);
  const [pos, setPos] = useState(0.5);
  const [busy, setBusy] = useState(false);

  const recent = useMemo(() => trips.filter((t) => t.start > Date.now() - 7 * 86_400_000).slice().reverse(), [trips]);
  const trip = recent.find((t) => t.id === tripId);
  const idx = trip ? Math.round(pos * (trip.samples.length - 1)) : 0;
  const at = trip?.samples[idx];

  const seal = async () => {
    setBusy(true);
    let inc;
    if (when === 'now') {
      const shift = live.now - live.cur.t;
      const samples = live.samples.slice(0, live.idx + 1).map((s) => ({ ...s, t: s.t + shift }));
      inc = await createIncident({ type, t: live.now, samples });
    } else {
      inc = await createIncident({ type, t: at.t, samples: trip.samples, tripId: trip.id });
    }
    setToast('Evidence sealed · it can’t be deleted');
    replace('case', { id: inc.id });
  };

  return (
    <div className="screen pushed">
      <NavBar title="Log incident" onBack={pop} />

      <div className="muted" style={{ fontSize: 13, margin: '0 4px 12px' }}>
        We'll lock the GPS track from 15 min before to 5 min after, plus dashcam and cabin audio. Nothing sealed can be deleted.
      </div>

      <SectionTitle>1 · What happened?</SectionTitle>
      <div className="type-grid">
        {INCIDENT_TYPES.map((t) => (
          <button key={t.key} className={`type-opt ${type === t.key ? 'on' : ''}`} onClick={() => setType(t.key)} aria-pressed={type === t.key}>
            <b>{t.label}</b>
            <span>{t.hint}</span>
          </button>
        ))}
      </div>

      <SectionTitle>2 · When?</SectionTitle>
      <Segmented options={[{ value: 'now', label: 'Just now' }, { value: 'earlier', label: 'Earlier' }]} value={when} onChange={setWhen} />
      {when === 'now' ? (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row">
            <div className="glyph accent"><MapPin size={18} /></div>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>{fmtClock(live.now)} · {Math.round(live.cur.v)} km/h</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{roadAt(live.cur)?.name} · {formatLatLng(live.cur.x, live.cur.y)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="list" style={{ maxHeight: 250, overflowY: 'auto' }}>
            {recent.map((t) => (
              <button key={t.id} className="list-item plain" onClick={() => { setTripId(t.id); setPos(0.5); }} style={{ background: t.id === tripId ? 'var(--accent-soft)' : undefined }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{placeNameAt(t.samples[0]) ?? 'Unknown'} → {placeNameAt(t.samples[t.samples.length - 1]) ?? 'Roadside'}</div>
                  <div className="muted num" style={{ fontSize: 12 }}>{fmtDay(t.start)}, {fmtTime(t.start)} – {fmtTime(t.end)}</div>
                </div>
              </button>
            ))}
          </div>
          {trip && (
            <div className="card">
              <div className="card-title">Drag to the moment it happened</div>
              <input className="slider" type="range" min={0} max={1} step={0.001} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Incident time" />
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <b className="num">{fmtClock(at.t)}</b>
                <span className="num">{Math.round(at.v)} km/h</span>
                <span className="muted ellipsis" style={{ maxWidth: 150 }}>{roadAt(at)?.name}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <button className="btn danger" disabled={!type || busy || (when === 'earlier' && !trip)} onClick={seal}>
          {busy ? <span className="spinner" /> : <Lock size={18} />} Seal evidence & continue
        </button>
        <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>{!type ? 'Choose what happened first' : when === 'earlier' && !trip ? 'Pick the trip it happened on' : 'You can add photos, a statement and claim details next'}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The case file: sealed evidence + everything the insurer will ask for.

function Field({ id, label, value, onChange, readOnly, placeholder, type = 'text', inputMode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} inputMode={inputMode} value={value ?? ''} placeholder={placeholder} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DamageMap({ value = [], onToggle, readOnly }) {
  const zones = {
    front: [58, 22, 84, 14], bonnet: [56, 38, 88, 56], windshield: [62, 96, 76, 36], roof: [66, 134, 68, 100],
    fl: [44, 96, 14, 90], fr: [142, 96, 14, 90], rl: [44, 190, 14, 90], rr: [142, 190, 14, 90],
    rearglass: [62, 236, 76, 30], boot: [56, 268, 88, 40], rear: [58, 310, 84, 14],
  };
  const name = Object.fromEntries(DAMAGE_ZONES);
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
      <svg viewBox="30 10 140 326" width="120" aria-label="Damage map">
        <rect x="44" y="18" width="112" height="310" rx="40" fill="none" stroke="var(--car-edge)" strokeWidth="2" />
        {Object.entries(zones).map(([k, [x, y, w, h]]) => (
          <rect key={k} x={x} y={y} width={w} height={h} rx="6" className={`zone ${value.includes(k) ? 'on' : ''}`} onClick={() => !readOnly && onToggle(k)}>
            <title>{name[k]}</title>
          </rect>
        ))}
      </svg>
      <div className="grow">
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Tap the damaged areas</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {DAMAGE_ZONES.map(([k, l]) => (
            <button key={k} className={`chip ${value.includes(k) ? 'on' : ''}`} style={{ height: 30, fontSize: 12.5 }} onClick={() => !readOnly && onToggle(k)}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function useVoiceRecorder(onDone) {
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const chunks = useRef([]);
  const durRef = useRef(0);
  const start = async () => {
    setSecs(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType });
        const r = new FileReader();
        r.onload = () => onDone({ dataUrl: r.result, simulated: false, duration: durRef.current });
        r.readAsDataURL(blob);
      };
      mr.start();
      setRec({ mr, t0: Date.now() });
    } catch {
      // No microphone permission (or unsupported): keep a placeholder so the flow still works.
      setRec({ mr: null, t0: Date.now() });
    }
  };
  const stop = () => {
    const dur = Math.max(1, Math.round((Date.now() - rec.t0) / 1000));
    durRef.current = dur;
    if (rec.mr) rec.mr.stop();
    else onDone({ dataUrl: null, simulated: true, duration: dur });
    setRec(null);
    return dur;
  };
  useEffect(() => {
    if (!rec) return undefined;
    const id = setInterval(() => setSecs(Math.round((Date.now() - rec.t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [rec]);
  return { recording: !!rec, secs, start, stop };
}

export function buildClaimText(inc, { vehicle, profile }) {
  const d = inc.details ?? {};
  const p = { ...profile, ...(d.profile ?? {}) };
  const road = roadAt(inc.location)?.name ?? '';
  const hour = new Date(inc.t).getHours();
  const zones = Object.fromEntries(DAMAGE_ZONES);
  const lines = [
    `INCIDENT REPORT ${inc.id} — ${typeLabel(inc.type)}`,
    '',
    `Date & time: ${new Date(inc.t).toLocaleString()}`,
    `Location: ${road}, ${formatLatLng(inc.location.x, inc.location.y)}`,
    `Light: ${hour >= 6 && hour < 18 ? 'Daylight' : 'Dark / street lighting'}`,
    `Vehicle: ${vehicle.name}, ${vehicle.plate}`,
    `Driver: ${p.driverName || '—'} · ${p.phone || '—'} · Licence ${p.licenceNo || '—'}`,
    `Insurer: ${p.insurer || '—'} · Policy ${p.policyNo || '—'}`,
    '',
    'TELEMATICS (sealed, tamper-evident)',
    `• Speed at the time: ${Math.round(inc.speedAt ?? 0)} km/h`,
    ...(inc.impact ? [`• Speed fell from ${Math.round(inc.impact.fromKmh)} to ${Math.round(inc.impact.toKmh)} km/h in ${inc.impact.durationSec.toFixed(1)} s (${inc.impact.gforce.toFixed(2)} g)`] : []),
    `• GPS track: ${inc.gps.length} points, ${fmtClock(inc.window[0])}–${fmtClock(inc.window[1])}`,
    `• SHA-256 fingerprint: ${inc.gpsHash}`,
    `• Recordings: ${(inc.mediaCount ?? inc.media.length) || 'see attached'} · Photos: ${inc.photos.length} · Voice statements: ${(d.voice ?? []).length}`,
    `• Evidence sealed: ${new Date(inc.createdAt).toLocaleString()}`,
    '',
    "DRIVER'S STATEMENT",
    d.statement?.trim() || '(not yet written)',
    '',
    'OTHER PARTY',
    `Vehicle: ${d.otherPlate || '—'} · Name: ${d.otherName || '—'} · Phone: ${d.otherPhone || '—'} · Insurer: ${d.otherInsurer || '—'}`,
    '',
    `Damage: ${(d.damage ?? []).map((k) => zones[k]).join(', ') || '—'}`,
    `Injuries: ${d.injuries ?? 'None reported'} · People in vehicle: ${d.occupants ?? 1}`,
    `Police: ${d.fir ? `FIR/complaint ${d.fir}` : 'Not reported'}${d.station ? `, ${d.station}` : ''}`,
    `Witnesses: ${d.witness || '—'}`,
    `Estimated repair: ${d.estimate ? `₹${Number(d.estimate).toLocaleString('en-IN')}` : '—'}`,
    ...((inc.addenda ?? []).length ? ['', 'ADDENDA', ...inc.addenda.map((a) => `[${new Date(a.t).toLocaleString()}] ${a.text}`)] : []),
  ];
  return lines.join('\n');
}

export function IncidentCase({ id, pop, push }) {
  const { incidents, updateIncident, media, vehicle, settings, setSettings, setToast, alerts } = useApp();
  const inc = incidents.find((i) => i.id === id);
  const [sheet, setSheet] = useState(null);
  const [addendum, setAddendum] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const fileRef = useRef();
  const voice = useVoiceRecorder((res) => {
    updateIncident(id, (i) => ({ ...i, details: { ...i.details, voice: [...(i.details.voice ?? []), { t: Date.now(), ...res }] } }), 'Voice statement recorded and sealed');
  });

  if (!inc) return <div className="screen pushed"><NavBar title="Incident" onBack={pop} /><div className="muted">Not found.</div></div>;
  const d = inc.details ?? {};
  const profile = { ...settings.claimProfile, ...(d.profile ?? {}) };
  const locked = inc.status === 'submitted';
  const evidence = media.filter((m) => m.incidentId === inc.id);
  const crash = inc.autoKey === 'auto-crash' ? alerts.find((a) => a.type === 'crash') : null;
  const withImpact = crash ? { ...inc, impact: crash } : inc;

  const setD = (k, v) => {
    updateIncident(id, (i) => ({ ...i, details: { ...i.details, [k]: v } }));
    setSavedAt(Date.now());
  };
  const setProfile = (k, v) => setD('profile', { ...profile, [k]: v });

  const addPhotos = async (files) => {
    const urls = [];
    for (const f of files) {
      try { urls.push(await compressImage(f)); } catch { setToast('Could not read that image'); }
    }
    if (urls.length) {
      updateIncident(id, (i) => ({ ...i, photos: [...i.photos, ...urls.map((u) => ({ t: Date.now(), src: u }))] }), `${urls.length} photo${urls.length > 1 ? 's' : ''} added and sealed`);
      setToast('Photos added · they can’t be removed');
    }
  };

  const claimText = buildClaimText({ ...withImpact, mediaCount: evidence.length }, { vehicle, profile });
  const exportJson = () => {
    const pack = { ...inc, claimText, vehicle: { name: vehicle.name, plate: vehicle.plate, imei: vehicle.device.imei }, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${inc.id}-claim-pack.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    updateIncident(id, {}, 'Claim pack exported');
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `${inc.id} ${typeLabel(inc.type)}`, text: claimText });
      else { await navigator.clipboard.writeText(claimText); setToast('Claim text copied'); }
      updateIncident(id, {}, 'Claim summary shared');
    } catch { /* user cancelled */ }
  };

  return (
    <div className="screen pushed">
      <NavBar title={inc.id} onBack={pop} right={<button className="icon-btn ghost" aria-label="Claim summary" onClick={() => setSheet('claim')}><FileText size={20} /></button>} />

      <div className="card fade">
        <div className="row">
          <div className="glyph crit" style={{ width: 46, height: 46, borderRadius: 15 }}><Siren size={22} /></div>
          <div className="grow">
            <div style={{ fontWeight: 750, fontSize: 18 }}>{typeLabel(inc.type)}</div>
            <div className="muted" style={{ fontSize: 13 }}>{fmtDay(inc.t)}, {fmtClock(inc.t)} · {inc.source === 'auto' ? 'Detected automatically' : 'Logged by you'}</div>
          </div>
          <StatusBadge status={inc.status} />
        </div>
        {crash && <div className="ink2 num" style={{ fontSize: 13, marginTop: 10 }}>Speed fell {Math.round(crash.fromKmh)} → {Math.round(crash.toKmh)} km/h in {crash.durationSec.toFixed(1)} s ({crash.gforce.toFixed(2)} g)</div>}
      </div>

      <SectionTitle>Sealed evidence</SectionTitle>
      <div className="seal">
        <ShieldCheck size={18} color="var(--good-ink)" style={{ flex: 'none' }} />
        <div>Sealed {new Date(inc.createdAt).toLocaleString()}. GPS, recordings and photos in this case are read-only and can’t be deleted from the app or the SD card.</div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 10 }}>
        {inc.gps.length > 1 && (
          <MapView fit={boundsOf(inc.gps)} fitKey={inc.id} style={{ height: 180 }} controls={false}>
            {(k) => (
              <>
                <Route points={inc.gps} k={k} width={4} />
                <Pin x={inc.location.x} y={inc.location.y} k={k} color="var(--critical)" size={24} icon={<Siren size={24} />} />
              </>
            )}
          </MapView>
        )}
        <div style={{ padding: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
            <b>GPS track · {inc.gps.length} points</b>
            <span className="muted num">{fmtClock(inc.window[0])}–{fmtClock(inc.window[1])}</span>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>{roadAt(inc.location)?.name} · {formatLatLng(inc.location.x, inc.location.y)} · {Math.round(inc.speedAt ?? 0)} km/h</div>
          <div className="hash" style={{ marginTop: 6 }}>SHA-256 {inc.gpsHash}</div>
        </div>
      </div>

      <div className="list" style={{ marginTop: 10 }}>
        {evidence.map((m) => (
          <button key={m.id} className="list-item" onClick={() => push('media', { id: m.id })}>
            <div className="glyph crit">{m.kind === 'video' ? <Video size={18} /> : <Mic size={18} />}</div>
            <div className="grow">
              <div className="title">{m.camera}{m.kind === 'video' ? ' camera' : ''}</div>
              <div className="meta">{fmtClock(m.t)} · {m.duration}s · <Lock size={11} style={{ display: 'inline', verticalAlign: -1 }} /> sealed</div>
            </div>
            <ChevronRight className="chev" size={18} />
          </button>
        ))}
        {!evidence.length && <div className="list-item muted" style={{ fontSize: 13 }}>No recordings in this window.</div>}
      </div>

      <SectionTitle>Photos</SectionTitle>
      <div className="photo-grid">
        {inc.photos.map((p, i) => <img key={i} src={p.src} alt={`Incident photo ${i + 1}`} />)}
        {!locked && (
          <button className="photo-add" onClick={() => fileRef.current.click()} aria-label="Add photos">
            <div style={{ textAlign: 'center', fontSize: 12 }}><Camera size={22} style={{ margin: '0 auto 4px' }} />Add photos</div>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { addPhotos([...e.target.files]); e.target.value = ''; }} />
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Damage, the other vehicle's number plate, the scene and any documents.</div>

      <SectionTitle>What happened, in your words</SectionTitle>
      <div className="card">
        <div className="chips" style={{ margin: '0 -16px 10px', padding: '2px 16px' }}>
          {STATEMENT_PROMPTS.map((p) => (
            <button key={p} className="chip" style={{ height: 30, fontSize: 12.5 }} disabled={locked} onClick={() => setD('statement', `${d.statement ? `${d.statement.trimEnd()}\n` : ''}${p} `)}>{p.replace(/…|:$/, '')}</button>
          ))}
        </div>
        <textarea id="statement" className="note" readOnly={locked} value={d.statement ?? ''} placeholder="Describe it while it's fresh: where you were going, what the other vehicle did, what was said, who was there." onChange={(e) => setD('statement', e.target.value)} onBlur={() => d.statement && updateIncident(id, {}, 'Statement saved')} />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          {savedAt ? <span className="saved">✓ Saved on this phone</span> : <span className="muted" style={{ fontSize: 12 }}>Saves as you type</span>}
          {!locked && (
            <button className={`btn small ${voice.recording ? 'danger' : ''}`} onClick={() => (voice.recording ? voice.stop() : voice.start())}>
              {voice.recording ? <><Square size={14} fill="#fff" /> Stop {voice.secs}s</> : <><Mic size={16} /> Record</>}
            </button>
          )}
        </div>
        {(d.voice ?? []).map((v, i) => (
          <div key={i} className="row" style={{ marginTop: 10, gap: 8 }}>
            <Lock size={13} className="muted" />
            {v.dataUrl ? <audio controls src={v.dataUrl} style={{ width: '100%', height: 36 }} /> : <span className="muted" style={{ fontSize: 13 }}>Voice statement · {v.duration}s (demo: microphone unavailable)</span>}
          </div>
        ))}
      </div>

      <SectionTitle>Other party</SectionTitle>
      <div className="card stack">
        <Field id="op-plate" label="Vehicle number" value={d.otherPlate} placeholder="KA 01 AB 1234" onChange={(v) => setD('otherPlate', v.toUpperCase())} readOnly={locked} />
        <div className="grid-2">
          <Field id="op-name" label="Driver name" value={d.otherName} onChange={(v) => setD('otherName', v)} readOnly={locked} />
          <Field id="op-phone" label="Phone" type="tel" value={d.otherPhone} onChange={(v) => setD('otherPhone', v)} readOnly={locked} />
        </div>
        <Field id="op-ins" label="Their insurer" value={d.otherInsurer} onChange={(v) => setD('otherInsurer', v)} readOnly={locked} />
      </div>

      <SectionTitle>Damage & injuries</SectionTitle>
      <div className="card stack">
        <DamageMap value={d.damage} readOnly={locked} onToggle={(k) => setD('damage', (d.damage ?? []).includes(k) ? d.damage.filter((x) => x !== k) : [...(d.damage ?? []), k])} />
        <div>
          <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Injuries</div>
          <Segmented options={['None', 'Minor', 'Serious'].map((v) => ({ value: v, label: v }))} value={d.injuries ?? 'None'} onChange={(v) => !locked && setD('injuries', v)} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>People in the vehicle</span>
          <div className="row" style={{ gap: 10 }}>
            <button className="icon-btn" aria-label="Fewer" disabled={locked} onClick={() => setD('occupants', Math.max(1, (d.occupants ?? 1) - 1))}><Minus size={16} /></button>
            <b className="num" style={{ minWidth: 18, textAlign: 'center' }}>{d.occupants ?? 1}</b>
            <button className="icon-btn" aria-label="More" disabled={locked} onClick={() => setD('occupants', Math.min(9, (d.occupants ?? 1) + 1))}><Plus size={16} /></button>
          </div>
        </div>
        <Field id="estimate" label="Repair estimate (₹, optional)" inputMode="numeric" value={d.estimate} onChange={(v) => setD('estimate', v.replace(/[^0-9]/g, ''))} readOnly={locked} />
      </div>

      <SectionTitle>Police & witnesses</SectionTitle>
      <div className="card stack">
        <div className="grid-2">
          <Field id="fir" label="FIR / complaint no." value={d.fir} onChange={(v) => setD('fir', v)} readOnly={locked} />
          <Field id="station" label="Police station" value={d.station} onChange={(v) => setD('station', v)} readOnly={locked} />
        </div>
        <Field id="witness" label="Witness name & phone" value={d.witness} onChange={(v) => setD('witness', v)} readOnly={locked} />
      </div>

      <SectionTitle>Your details & policy</SectionTitle>
      <div className="card stack">
        <div className="grid-2">
          <Field id="dn" label="Driver" value={profile.driverName} onChange={(v) => setProfile('driverName', v)} readOnly={locked} />
          <Field id="dp" label="Phone" type="tel" value={profile.phone} onChange={(v) => setProfile('phone', v)} readOnly={locked} />
        </div>
        <Field id="lic" label="Driving licence no." value={profile.licenceNo} onChange={(v) => setProfile('licenceNo', v.toUpperCase())} readOnly={locked} />
        <div className="grid-2">
          <Field id="ins" label="Insurer" value={profile.insurer} placeholder="e.g. ICICI Lombard" onChange={(v) => setProfile('insurer', v)} readOnly={locked} />
          <Field id="pol" label="Policy no." value={profile.policyNo} onChange={(v) => setProfile('policyNo', v)} readOnly={locked} />
        </div>
        <button className="btn small" style={{ justifySelf: 'start' }} onClick={() => { setSettings({ ...settings, claimProfile: profile }); setToast('Saved · future claims will be pre-filled'); }}>Remember for next time</button>
      </div>

      <SectionTitle>Claim</SectionTitle>
      <div className="stack">
        <button className="btn primary" onClick={() => { setSheet('claim'); if (inc.status === 'open') updateIncident(id, { status: 'ready' }, 'Claim summary prepared'); }}><FileText size={18} /> Prepare claim summary</button>
        {inc.status !== 'submitted' ? (
          <button className="btn" onClick={() => setSheet('submit')}><Send size={18} /> Mark as sent to insurer</button>
        ) : (
          <div className="card tight muted" style={{ fontSize: 13 }}>Sent to insurer. Details are now read-only; add anything new as a dated note below.</div>
        )}
      </div>

      {locked && (
        <>
          <SectionTitle>Add a note</SectionTitle>
          <div className="card stack">
            {(inc.addenda ?? []).map((a) => <div key={a.t} style={{ fontSize: 13.5 }}><span className="muted num">{fmtDay(a.t)} {fmtTime(a.t)} · </span>{a.text}</div>)}
            <textarea className="note" style={{ minHeight: 80 }} value={addendum} onChange={(e) => setAddendum(e.target.value)} placeholder="e.g. Surveyor visited, claim number received…" />
            <button className="btn small" style={{ justifySelf: 'start' }} disabled={!addendum.trim()} onClick={() => { updateIncident(id, (i) => ({ ...i, addenda: [...(i.addenda ?? []), { t: Date.now(), text: addendum.trim() }] }), 'Note added'); setAddendum(''); }}>Add note</button>
          </div>
        </>
      )}

      <SectionTitle>Record of changes</SectionTitle>
      <div className="card">
        {[...inc.log].reverse().map((l, i) => (
          <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '5px 0' }}>
            <History size={14} className="muted" style={{ marginTop: 3, flex: 'none' }} />
            <div className="grow" style={{ fontSize: 13 }}>{l.action}</div>
            <span className="muted num" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmtDay(l.t)} {fmtTime(l.t)}</span>
          </div>
        ))}
      </div>

      <Sheet open={sheet === 'claim'} onClose={() => setSheet(null)}>
        <h3>Claim summary</h3>
        <p className="muted" style={{ margin: '4px 0 12px', fontSize: 13.5 }}>Built from the sealed data and your answers. Send it with the claim pack file.</p>
        <pre className="claim-text">{claimText}</pre>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <button className="btn small" style={{ width: '100%' }} onClick={async () => { try { await navigator.clipboard.writeText(claimText); setToast('Copied'); } catch { setToast('Copy blocked — select the text instead'); } }}><Copy size={15} /> Copy</button>
          <button className="btn small" style={{ width: '100%' }} onClick={share}><Share2 size={15} /> Share</button>
          <button className="btn small" style={{ width: '100%' }} onClick={exportJson}><Download size={15} /> File</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'submit'} onClose={() => setSheet(null)}>
        <h3>Sent to your insurer?</h3>
        <p className="muted" style={{ margin: '6px 0 16px' }}>After this the case details can’t be edited, so what the insurer received stays on record. You can still add dated notes.</p>
        <div className="stack">
          <button className="btn primary" onClick={() => { updateIncident(id, { status: 'submitted', submittedAt: Date.now() }, `Marked as sent to ${profile.insurer || 'insurer'}`); setSheet(null); setToast('Case locked as submitted'); }}>Yes, lock the case</button>
          <button className="btn" onClick={() => setSheet(null)}>Not yet</button>
        </div>
      </Sheet>
    </div>
  );
}

/** Compact list used on the Alerts tab. */
export function IncidentList({ push }) {
  const { incidents } = useApp();
  if (!incidents.length) return null;
  return (
    <div className="list">
      {incidents.map((i) => (
        <button key={i.id} className="list-item" onClick={() => push('case', { id: i.id })}>
          <div className="glyph crit"><Siren size={18} /></div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <div className="title grow ellipsis">{typeLabel(i.type)}</div>
              <StatusBadge status={i.status} />
            </div>
            <div className="meta num">{i.id} · {fmtDay(i.t)}, {fmtTime(i.t)} · {fmtDuration((i.window[1] - i.window[0]) / 1000)} sealed</div>
          </div>
        </button>
      ))}
    </div>
  );
}
