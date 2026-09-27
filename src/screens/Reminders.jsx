import { useState } from 'react';
import { Check, FileClock, Pencil, Plus } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, Sheet, Segmented } from '../components/ui.jsx';
import { markDone, reminderStatus } from '../lib/paperwork.js';
import { fmtDay } from '../lib/format.js';

const toInput = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');

export default function Reminders({ pop }) {
  const { reminders, setReminders, odometerKm, setToast } = useApp();
  const [edit, setEdit] = useState(null);
  const now = Date.now();
  const rows = reminders
    .map((r) => ({ r, s: reminderStatus(r, now, odometerKm) }))
    .sort((a, b) => ({ overdue: 0, soon: 1, ok: 2 }[a.s.state] - { overdue: 0, soon: 1, ok: 2 }[b.s.state]) || a.s.daysLeft - b.s.daysLeft);

  const save = (r) => {
    setReminders((list) => (list.some((x) => x.key === r.key) ? list.map((x) => (x.key === r.key ? r : x)) : [...list, r]));
    setEdit(null);
    setToast('Reminder saved');
  };

  return (
    <div className="screen pushed">
      <NavBar title="Reminders" onBack={pop} right={<button className="icon-btn ghost" aria-label="Add reminder" onClick={() => setEdit({ key: `c${Date.now()}`, label: '', kind: 'date', due: now + 30 * 86_400_000, everyDays: 365, isNew: true })}><Plus size={22} /></button>} />
      <div className="muted" style={{ fontSize: 13, margin: '0 4px 12px' }}>
        Odometer <b className="num" style={{ color: 'var(--ink)' }}>{odometerKm.toLocaleString('en-IN')} km</b> from the tracker. You’ll get a notification 30 days and 7 days before anything is due.
      </div>

      <div className="stack">
        {rows.map(({ r, s }) => (
          <div key={r.key} className="card fade">
            <div className="row">
              <div className={`glyph ${s.state === 'overdue' ? 'crit' : s.state === 'soon' ? 'warn' : 'good'}`}><FileClock size={18} /></div>
              <div className="grow">
                <div style={{ fontWeight: 650 }}>{r.label}</div>
                <div className="num" style={{ fontSize: 13, color: s.state === 'overdue' ? 'var(--critical-ink)' : s.state === 'soon' ? 'var(--warning)' : 'var(--ink-3)', fontWeight: 600 }}>
                  {s.state === 'overdue' ? 'Overdue · ' : 'Due '}{s.text}
                </div>
              </div>
              <button className="icon-btn ghost" aria-label={`Edit ${r.label}`} onClick={() => setEdit(r)}><Pencil size={17} /></button>
            </div>
            <div className={`progress ${s.state === 'overdue' ? 'crit' : s.state === 'soon' ? 'warn' : 'good'}`} style={{ marginTop: 12 }}>
              <div style={{ width: `${Math.max(4, s.progress * 100)}%` }} />
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {r.due ? `Date ${fmtDay(r.due)}` : ''}{r.due && r.dueKm ? ' · ' : ''}{r.dueKm ? `at ${r.dueKm.toLocaleString('en-IN')} km` : ''}
                {r.note ? <><br />{r.note}</> : null}
              </span>
              <button className="btn small" onClick={() => { setReminders((list) => list.map((x) => (x.key === r.key ? markDone(x, now, odometerKm) : x))); setToast(`${r.label} marked done · next one scheduled`); }}>
                <Check size={15} /> Done
              </button>
            </div>
          </div>
        ))}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)}>
        {edit && (
          <div className="stack">
            <h3>{edit.isNew ? 'New reminder' : edit.label}</h3>
            {edit.isNew && (
              <div className="field"><label htmlFor="rl">What</label><input id="rl" value={edit.label} placeholder="e.g. Wheel alignment" onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></div>
            )}
            <Segmented options={[{ value: 'date', label: 'By date' }, { value: 'km', label: 'By km' }]} value={edit.kind} onChange={(v) => setEdit({ ...edit, kind: v, dueKm: v === 'km' ? edit.dueKm ?? odometerKm + 5000 : edit.dueKm, everyKm: v === 'km' ? edit.everyKm ?? 10_000 : edit.everyKm })} />
            <div className="field"><label htmlFor="rd">Due date {edit.kind === 'km' ? '(whichever comes first)' : ''}</label><input id="rd" type="date" value={toInput(edit.due)} onChange={(e) => setEdit({ ...edit, due: e.target.value ? new Date(e.target.value).getTime() : null })} /></div>
            {edit.kind === 'km' && (
              <div className="grid-2">
                <div className="field"><label htmlFor="rk">Due at (km)</label><input id="rk" inputMode="numeric" value={edit.dueKm ?? ''} onChange={(e) => setEdit({ ...edit, dueKm: Number(e.target.value.replace(/\D/g, '')) || null })} /></div>
                <div className="field"><label htmlFor="re">Repeat every (km)</label><input id="re" inputMode="numeric" value={edit.everyKm ?? ''} onChange={(e) => setEdit({ ...edit, everyKm: Number(e.target.value.replace(/\D/g, '')) || null })} /></div>
              </div>
            )}
            <div className="field"><label htmlFor="ry">Repeat every (days)</label><input id="ry" inputMode="numeric" value={edit.everyDays ?? ''} onChange={(e) => setEdit({ ...edit, everyDays: Number(e.target.value.replace(/\D/g, '')) || null })} /></div>
            <button className="btn primary" disabled={!edit.label?.trim()} onClick={() => { const { isNew, ...r } = edit; save(r); }}>Save</button>
            {!edit.isNew && !['insurance', 'puc', 'rc', 'service', 'tyres'].includes(edit.key) && (
              <button className="btn" style={{ color: 'var(--critical-ink)' }} onClick={() => { setReminders((l) => l.filter((x) => x.key !== edit.key)); setEdit(null); }}>Delete reminder</button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
