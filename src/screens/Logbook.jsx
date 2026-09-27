import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Briefcase, User } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented, Toggle } from '../components/ui.jsx';
import { tagFor, monthKey, monthLabel } from '../lib/paperwork.js';
import { tripCosts, fmtINR } from '../lib/costs.js';
import { fmtTime } from '../lib/format.js';
import { exportPdf, exportXlsx } from '../lib/exporters.js';

export default function Logbook({ pop, push }) {
  const { trips, tripTags, setTripTags, settings, setSettings, placeNameAt, vehicle, drivers, setToast } = useApp();
  const months = useMemo(() => [...new Set(trips.map((t) => monthKey(t.start)))].reverse(), [trips]);
  const [month, setMonth] = useState(months[0]);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);
  const rule = settings.logbookRule;

  const rows = useMemo(() => trips
    .filter((t) => monthKey(t.start) === month)
    .map((t) => {
      const c = tripCosts(t, settings.fuel, settings.parkingFees);
      return {
        trip: t,
        tag: tagFor(t, tripTags, rule, placeNameAt),
        from: placeNameAt(t.samples[0]) ?? 'Unknown',
        to: placeNameAt(t.samples[t.samples.length - 1]) ?? 'Roadside',
        km: t.summary.distance / 1000,
        ...c,
      };
    }), [trips, month, tripTags, rule, placeNameAt, settings.fuel, settings.parkingFees]);

  const shown = rows.filter((r) => filter === 'all' || r.tag === filter).reverse();
  const sum = (tag, k) => rows.filter((r) => r.tag === tag).reduce((a, r) => a + r[k], 0);
  const driverName = (id) => drivers.find((d) => d.id === id)?.name ?? '';

  const table = () => {
    const list = rows.filter((r) => filter === 'all' || r.tag === filter);
    const columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Start', key: 'start', width: 8 },
      { header: 'End', key: 'end', width: 8 },
      { header: 'From', key: 'from', width: 18 },
      { header: 'To', key: 'to', width: 18 },
      { header: 'Driver', key: 'driver', width: 10 },
      { header: 'Purpose', key: 'purpose', width: 10 },
      { header: 'Km', key: 'km', width: 8, type: 'number' },
      { header: 'Fuel ₹', key: 'fuel', width: 9, type: 'number' },
      { header: 'Toll ₹', key: 'toll', width: 8, type: 'number' },
      { header: 'Parking ₹', key: 'parking', width: 10, type: 'number' },
      { header: 'Total ₹', key: 'cost', width: 10, type: 'number' },
    ];
    const r2 = (v) => Math.round(v * 10) / 10;
    const data = list.map((r) => ({
      date: new Date(r.trip.start).toLocaleDateString('en-IN'),
      start: fmtTime(r.trip.start), end: fmtTime(r.trip.end), from: r.from, to: r.to,
      driver: driverName(r.trip.driver), purpose: r.tag === 'business' ? 'Business' : 'Personal',
      km: r2(r.km), fuel: Math.round(r.fuel), toll: r.toll, parking: r.parking, cost: Math.round(r.cost),
    }));
    const totals = {
      km: r2(list.reduce((a, r) => a + r.km, 0)),
      fuel: Math.round(list.reduce((a, r) => a + r.fuel, 0)),
      toll: list.reduce((a, r) => a + r.toll, 0),
      parking: list.reduce((a, r) => a + r.parking, 0),
      cost: Math.round(list.reduce((a, r) => a + r.cost, 0)),
    };
    return { columns, data, totals };
  };

  const doExport = async (kind) => {
    setBusy(kind);
    try {
      const { columns, data, totals } = table();
      const scope = filter === 'all' ? 'All trips' : filter === 'business' ? 'Business trips' : 'Personal trips';
      const base = `logbook-${vehicle.plate.replace(/\s/g, '')}-${month}-${filter}`;
      const title = `Vehicle logbook · ${monthLabel(month)}`;
      if (kind === 'xlsx') await exportXlsx({ fileName: `${base}.xlsx`, title: `${title} · ${vehicle.name} ${vehicle.plate} · ${scope}`, columns, rows: data, totals });
      else await exportPdf({ fileName: `${base}.pdf`, title, subtitle: `${vehicle.name} · ${vehicle.plate} · ${scope} · fuel at ₹${settings.fuel.pricePerL}/L, ${settings.fuel.kmPerL} km/L`, columns, rows: data, totals, footer: 'Distances and times from the vehicle GPS tracker (tamper-evident log). Tolls via FASTag.' });
      setToast(kind === 'xlsx' ? 'Excel logbook downloaded' : 'PDF logbook downloaded');
    } catch {
      setToast('Export failed — try again');
    }
    setBusy(null);
  };

  return (
    <div className="screen pushed">
      <NavBar title="Logbook" onBack={pop} />
      <div className="chips" style={{ marginBottom: 12 }}>
        {months.map((m) => <button key={m} className={`chip ${month === m ? 'on' : ''}`} onClick={() => setMonth(m)}>{monthLabel(m)}</button>)}
      </div>

      <div className="grid-2 fade">
        <div className="stat">
          <div className="label"><Briefcase size={13} /> Business</div>
          <div className="value num">{Math.round(sum('business', 'km'))}<small>km</small></div>
          <div className="delta num">{fmtINR(sum('business', 'cost'))} · {rows.filter((r) => r.tag === 'business').length} trips</div>
        </div>
        <div className="stat">
          <div className="label"><User size={13} /> Personal</div>
          <div className="value num">{Math.round(sum('personal', 'km'))}<small>km</small></div>
          <div className="delta num">{fmtINR(sum('personal', 'cost'))} · {rows.filter((r) => r.tag === 'personal').length} trips</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <div className="grow"><div style={{ fontWeight: 600 }}>Trips to or from Office are business</div><div className="muted" style={{ fontSize: 12.5 }}>Tap a trip's tag to override it</div></div>
          <Toggle on={rule === 'office'} label="Auto-tag office trips" onChange={(v) => setSettings({ ...settings, logbookRule: v ? 'office' : 'none' })} />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => doExport('xlsx')} disabled={!!busy}>{busy === 'xlsx' ? <span className="spinner" /> : <FileSpreadsheet size={18} />} Excel</button>
        <button className="btn" onClick={() => doExport('pdf')} disabled={!!busy}>{busy === 'pdf' ? <span className="spinner" /> : <FileText size={18} />} PDF</button>
      </div>

      <SectionTitle>{monthLabel(month)}</SectionTitle>
      <Segmented options={[{ value: 'all', label: 'All' }, { value: 'business', label: 'Business' }, { value: 'personal', label: 'Personal' }]} value={filter} onChange={setFilter} />
      <div className="list" style={{ marginTop: 12 }}>
        {shown.map((r) => (
          <div key={r.trip.id} className="list-item plain">
            <button className="grow" style={{ minWidth: 0, textAlign: 'left' }} onClick={() => push('trip', { id: r.trip.id })}>
              <div className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{r.from} → {r.to}</div>
              <div className="muted num" style={{ fontSize: 12 }}>
                {new Date(r.trip.start).toLocaleDateString([], { day: 'numeric', month: 'short' })}, {fmtTime(r.trip.start)} · {r.km.toFixed(1)} km · {fmtINR(r.cost)}{r.toll ? ' · toll' : ''}
              </div>
            </button>
            <button
              className={`badge ${r.tag === 'business' ? 'accent' : ''}`}
              style={{ height: 30, padding: '0 10px' }}
              aria-label={`Tag as ${r.tag === 'business' ? 'personal' : 'business'}`}
              onClick={() => setTripTags((t) => ({ ...t, [r.trip.id]: r.tag === 'business' ? 'personal' : 'business' }))}
            >
              {r.tag === 'business' ? <Briefcase size={12} /> : <User size={12} />}{r.tag === 'business' ? 'Business' : 'Personal'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
