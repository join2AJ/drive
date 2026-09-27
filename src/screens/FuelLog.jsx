import { useMemo, useState } from 'react';
import { Fuel, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Sheet, Toggle } from '../components/ui.jsx';
import { BarChart } from '../components/Charts.jsx';
import { mileageFromLog } from '../lib/paperwork.js';
import { fmtINR } from '../lib/costs.js';
import { fmtDay } from '../lib/format.js';

export default function FuelLog({ pop }) {
  const { fuelLog, setFuelLog, settings, setSettings, odometerKm, setToast } = useApp();
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const m = useMemo(() => mileageFromLog(fuelLog), [fuelLog]);
  const assumed = settings.fuel.kmPerL;
  const sorted = [...fuelLog].sort((a, b) => b.t - a.t);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthSpend = fuelLog.filter((f) => f.t >= monthStart.getTime()).reduce((a, f) => a + f.total, 0);
  const unit = settings.fuel.type === 'EV' ? 'kWh' : settings.fuel.type === 'CNG' ? 'kg' : 'L';

  const openAdd = () => setForm({ litres: '', pricePerL: sorted[0]?.pricePerL ?? settings.fuel.pricePerL, total: '', odometer: odometerKm, full: true, station: '' });
  const litres = Number(form?.litres) || 0;
  const total = form ? (Number(form.total) || Math.round(litres * Number(form.pricePerL))) : 0;

  return (
    <div className="screen pushed">
      <NavBar title="Fuel log" onBack={pop} right={<button className="icon-btn ghost" aria-label="Add fill-up" onClick={openAdd}><Plus size={22} /></button>} />

      <div className="card fade">
        <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Real-world mileage (full tank to full tank)</div>
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <div className="num" style={{ fontSize: 36, fontWeight: 750, letterSpacing: '-0.02em' }}>{m.average ? m.average.toFixed(1) : '—'}</div>
          <div className="muted">km/{unit}</div>
        </div>
        <div className="ink2" style={{ fontSize: 13 }}>
          Trip costs currently assume <b className="num">{assumed} km/{unit}</b>.
          {m.average && Math.abs(m.average - assumed) > 0.2 && <> Your real figure is {m.average < assumed ? 'lower' : 'higher'}, so costs are {m.average < assumed ? 'under' : 'over'}-estimated by about {Math.abs(Math.round((assumed / m.average - 1) * 100))}%.</>}
        </div>
        {m.average && Math.abs(m.average - assumed) > 0.2 && (
          <button className="btn small primary" style={{ marginTop: 12 }} onClick={() => { setSettings({ ...settings, fuel: { ...settings.fuel, kmPerL: +m.average.toFixed(1) } }); setToast(`Trip costs now use ${m.average.toFixed(1)} km/${unit}`); }}>
            Use {m.average.toFixed(1)} km/{unit} for trip costs
          </button>
        )}
        <div className="grid-3" style={{ marginTop: 14 }}>
          <div><div className="muted" style={{ fontSize: 11.5 }}>This month</div><div className="num" style={{ fontWeight: 700 }}>{fmtINR(monthSpend)}</div></div>
          <div><div className="muted" style={{ fontSize: 11.5 }}>Avg price</div><div className="num" style={{ fontWeight: 700 }}>{m.avgPrice ? fmtINR(m.avgPrice, 2) : '—'}</div></div>
          <div><div className="muted" style={{ fontSize: 11.5 }}>Fill-ups</div><div className="num" style={{ fontWeight: 700 }}>{fuelLog.length}</div></div>
        </div>
      </div>

      {m.legs.length > 1 && (
        <>
          <SectionTitle>Mileage per tank</SectionTitle>
          <div className="card">
            <BarChart data={m.legs.map((l) => ({ label: new Date(l.t).getDate(), value: l.kmPerL, sub: `${fmtDay(l.t)} · ${Math.round(l.km)} km on ${l.litres.toFixed(1)} ${unit}` }))} format={(v, axis) => (axis ? Math.round(v) : `${v.toFixed(1)} km/${unit}`)} height={140} />
          </div>
        </>
      )}

      <SectionTitle>Fill-ups</SectionTitle>
      <div className="list">
        {sorted.map((f, i) => {
          const prev = sorted[i + 1];
          return (
            <button key={f.id} className="list-item" onClick={() => setView(f)}>
              <div className="glyph accent"><Fuel size={18} /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title ellipsis">{f.station || 'Fuel station'}</div>
                <div className="meta num">{fmtDay(f.t)} · {f.litres.toFixed(1)} {unit} @ {fmtINR(f.pricePerL, 2)}{prev ? ` · ${(f.odometer - prev.odometer).toLocaleString('en-IN')} km since` : ''}{f.full ? '' : ' · partial'}</div>
              </div>
              <b className="num">{fmtINR(f.total)}</b>
            </button>
          );
        })}
        {!sorted.length && <div className="list-item muted">No fill-ups yet. Tap + after you refuel.</div>}
      </div>

      <Sheet open={!!form} onClose={() => setForm(null)}>
        {form && (
          <div className="stack">
            <h3>Add fill-up</h3>
            <div className="grid-2">
              <div className="field"><label htmlFor="fl">{unit === 'L' ? 'Litres' : unit}</label><input id="fl" inputMode="decimal" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
              <div className="field"><label htmlFor="fp">Price per {unit} (₹)</label><input id="fp" inputMode="decimal" value={form.pricePerL} onChange={(e) => setForm({ ...form, pricePerL: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="ft">Total (₹)</label><input id="ft" inputMode="numeric" value={form.total || (litres ? total : '')} placeholder="auto" onChange={(e) => setForm({ ...form, total: e.target.value.replace(/\D/g, '') })} /></div>
              <div className="field"><label htmlFor="fo">Odometer (from tracker)</label><input id="fo" inputMode="numeric" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: Number(e.target.value.replace(/\D/g, '')) || '' })} /></div>
            </div>
            <div className="field"><label htmlFor="fs">Station</label><input id="fs" value={form.station} placeholder="e.g. Indian Oil, Hebbal" onChange={(e) => setForm({ ...form, station: e.target.value })} /></div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div><div style={{ fontWeight: 600 }}>Filled to full</div><div className="muted" style={{ fontSize: 12 }}>Needed for accurate mileage</div></div>
              <Toggle on={form.full} label="Full tank" onChange={(v) => setForm({ ...form, full: v })} />
            </div>
            <button
              className="btn primary"
              disabled={!litres || !form.pricePerL}
              onClick={() => {
                setFuelLog((l) => [{ id: `F${Date.now()}`, t: Date.now(), litres, pricePerL: Number(form.pricePerL), total, odometer: Number(form.odometer), full: form.full, station: form.station.trim() }, ...l]);
                setForm(null);
                setToast('Fill-up saved');
              }}
            >
              Save fill-up
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!view} onClose={() => setView(null)}>
        {view && (
          <div className="stack">
            <h3>{view.station || 'Fill-up'}</h3>
            <div className="muted num">{new Date(view.t).toLocaleString()} · {view.odometer.toLocaleString('en-IN')} km</div>
            <div className="num" style={{ fontSize: 28, fontWeight: 750 }}>{fmtINR(view.total)} <span className="muted" style={{ fontSize: 14 }}>{view.litres.toFixed(2)} {unit} @ {fmtINR(view.pricePerL, 2)}</span></div>
            <button className="btn" style={{ color: 'var(--critical-ink)' }} onClick={() => { setFuelLog((l) => l.filter((x) => x.id !== view.id)); setView(null); setToast('Fill-up deleted'); }}><Trash2 size={16} /> Delete</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
