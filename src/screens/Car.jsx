import { useMemo } from 'react';
import {
  Activity, Hexagon, AlarmClock, FileClock, Fuel, BookOpenCheck, ParkingSquare, Users, ShieldAlert, Film, Gamepad2, CreditCard, ChevronRight, Settings as Cog, AlertTriangle, BadgeIndianRupee, Building2, BookOpen,
} from 'lucide-react';
import { useApp } from '../state.jsx';
import { SectionTitle } from '../components/ui.jsx';
import { reminderStatus, mileageFromLog } from '../lib/paperwork.js';
import { fmtINR } from '../lib/costs.js';
import { fmtAgo } from '../lib/format.js';
import { PLANS } from '../lib/plans.js';

export default function Car({ push }) {
  const { account, vehicle, reminders, odometerKm, fuelLog, drivers, stolen, trips, media, parking, fences } = useApp();
  const now = Date.now();
  const statuses = reminders.map((r) => ({ r, s: reminderStatus(r, now, odometerKm) })).sort((a, b) => a.s.daysLeft - b.s.daysLeft);
  const attention = statuses.filter((x) => x.s.state !== 'ok');
  const mileage = useMemo(() => mileageFromLog(fuelLog), [fuelLog]);

  // FASTag: opening balance minus toll deductions, with an auto top-up when it ran low.
  const fastag = useMemo(() => {
    let bal = 1_500;
    let last = null;
    trips.forEach((t) => t.tolls.forEach((x) => {
      if (bal < 300) bal += 1_000;
      bal -= x.fee;
      last = { ...x, t: t.start };
    }));
    return { balance: bal, last };
  }, [trips]);

  const lastTrip = trips[trips.length - 1];

  return (
    <div className="screen">
      <div className="topbar">
        <h1>{vehicle.name}</h1>
        <button className="icon-btn" aria-label="Settings" onClick={() => push('settings')}><Cog size={20} /></button>
      </div>
      <div className="muted num" style={{ margin: '-6px 4px 14px', fontSize: 13 }}>{vehicle.plate} · {odometerKm.toLocaleString('en-IN')} km · {vehicle.fuel}</div>

      {stolen.active && (
        <button className="banner" style={{ marginBottom: 12 }} onClick={() => push('stolen')}>
          <div className="glyph crit"><ShieldAlert size={18} /></div>
          <div className="grow"><div style={{ fontWeight: 700 }}>Stolen-vehicle mode is on</div><div className="ink2" style={{ fontSize: 13 }}>Tracking every 5 s · police link active</div></div>
          <ChevronRight className="chev" size={18} />
        </button>
      )}

      {attention.length > 0 && (
        <div className="list fade" style={{ marginBottom: 4 }}>
          {attention.map(({ r, s }) => (
            <button key={r.key} className="list-item" onClick={() => push('reminders')}>
              <div className={`glyph ${s.state === 'overdue' ? 'crit' : 'warn'}`}><AlertTriangle size={18} /></div>
              <div className="grow">
                <div className="title">{r.label}</div>
                <div className="meta" style={{ color: s.state === 'overdue' ? 'var(--critical-ink)' : undefined }}>{s.state === 'overdue' ? 'Overdue · ' : 'Due '}{s.text}</div>
              </div>
              <ChevronRight className="chev" size={18} />
            </button>
          ))}
        </div>
      )}

      <SectionTitle>Money & paperwork</SectionTitle>
      <div className="hub-grid">
        <button className="hub-tile" onClick={() => push('reminders')}>
          <div className="glyph accent"><FileClock size={18} /></div>
          <div><div className="t">Reminders</div><div className="m">Insurance, PUC, RC, service, tyres</div></div>
        </button>
        <button className="hub-tile" onClick={() => push('fuel')}>
          <div className="glyph accent"><Fuel size={18} /></div>
          <div><div className="t">Fuel log</div><div className="m num">{mileage.average ? `Real mileage ${mileage.average.toFixed(1)} km/L` : 'Add your fill-ups'}</div></div>
        </button>
        <button className="hub-tile" onClick={() => push('logbook')}>
          <div className="glyph accent"><BookOpenCheck size={18} /></div>
          <div><div className="t">Logbook</div><div className="m">Business / personal · Excel & PDF</div></div>
        </button>
        <div className="hub-tile">
          <div className="glyph accent"><CreditCard size={18} /></div>
          <div>
            <div className="t num">FASTag {fmtINR(fastag.balance)}</div>
            <div className="m">{fastag.last ? `Last: ${fmtINR(fastag.last.fee)} · ${fmtAgo(fastag.last.t)}` : 'No tolls yet'}</div>
          </div>
        </div>
      </div>

      <SectionTitle>Tracking</SectionTitle>
      <div className="hub-grid">
        <button className="hub-tile" onClick={() => push('activity')}>
          <div className="glyph good"><Activity size={18} /></div>
          <div><div className="t">Stops & activity</div><div className="m">Running, idle, stopped · stop report</div></div>
        </button>
        <button className="hub-tile" onClick={() => push('routewatch')}>
          <div className="glyph warn"><AlarmClock size={18} /></div>
          <div><div className="t">Route watch</div><div className="m">Alarm when the vehicle leaves its route</div></div>
        </button>
        <button className="hub-tile" onClick={() => push('geofences')}>
          <div className="glyph violet"><Hexagon size={18} /></div>
          <div><div className="t">Geofences</div><div className="m">{fences.filter((f) => f.enabled).length} active · circle, drive-time, drawn</div></div>
        </button>
      </div>

      <SectionTitle>Safety & people</SectionTitle>
      <div className="hub-grid">
        <button className="hub-tile" onClick={() => push('stolen')}>
          <div className={`glyph ${stolen.active ? 'crit' : ''}`}><ShieldAlert size={18} /></div>
          <div><div className="t">Stolen-vehicle mode</div><div className="m">{stolen.active ? 'Active' : '5 s tracking, police link, safe engine cut'}</div></div>
        </button>
        <button className="hub-tile" onClick={() => push('drivers')}>
          <div className="glyph violet"><Users size={18} /></div>
          <div><div className="t">Drivers</div><div className="m">{drivers.length} profiles · {drivers.filter((d) => d.rules?.enabled).length} with new-driver rules</div></div>
        </button>
        <button className="hub-tile" onClick={() => push('parking')}>
          <div className="glyph good"><ParkingSquare size={18} /></div>
          <div><div className="t">Where I parked</div><div className="m">{parking.timerUntil && parking.timerUntil > now ? 'Parking timer running' : lastTrip ? `Last parked ${fmtAgo(lastTrip.end)}` : 'Parking timer & notes'}</div></div>
        </button>
        <button className="hub-tile" onClick={() => push('vault')}>
          <div className="glyph"><Film size={18} /></div>
          <div><div className="t">Vault</div><div className="m">{media.length} recordings · {media.filter((m) => m.locked).length} locked</div></div>
        </button>
      </div>

      <SectionTitle>Account</SectionTitle>
      <div className="hub-grid">
        <button className="hub-tile" onClick={() => push('plans')}>
          <div className="glyph accent"><BadgeIndianRupee size={18} /></div>
          <div><div className="t">Plan & billing</div><div className="m">{PLANS[account.plan]?.name ?? 'Free'} · {account.type === 'business' ? `${account.vehicles} vehicles` : 'personal'}</div></div>
        </button>
        <button className="hub-tile" onClick={() => push('fleet')}>
          <div className="glyph violet"><Building2 size={18} /></div>
          <div><div className="t">Fleet dashboard</div><div className="m">{account.type === 'business' ? 'All vehicles, live states' : 'For taxis, buses & trucks'}</div></div>
        </button>
      </div>
      <a className="list list-item" href="./docs/" target="_blank" rel="noopener" style={{ marginTop: 10, textDecoration: 'none', color: 'inherit' }}>
        <div className="glyph"><BookOpen size={18} /></div>
        <div className="grow"><div className="title">Help & product guide</div><div className="meta">Every feature, plans, hardware & setup</div></div>
        <ChevronRight className="chev" size={18} />
      </a>

      <SectionTitle>Motivation</SectionTitle>
      <button className="list list-item" onClick={() => push('achievements')}>
        <div className="glyph warn"><Gamepad2 size={18} /></div>
        <div className="grow"><div className="title">Streaks, badges & insurer score</div><div className="meta">Share a safe-driving certificate for a discount</div></div>
        <ChevronRight className="chev" size={18} />
      </button>
    </div>
  );
}
