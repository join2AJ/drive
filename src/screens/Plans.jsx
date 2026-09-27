import { useState } from 'react';
import { Check, Building2, BadgeCheck, CreditCard, Smartphone, Landmark } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle, Segmented, Sheet } from '../components/ui.jsx';
import { PLANS, HARDWARE, VEHICLE_TYPES, quote, GST, INSTALL_FEE } from '../lib/plans.js';
import { fmtINR } from '../lib/costs.js';

export default function Plans({ pop, push }) {
  const { account, setAccount, setToast } = useApp();
  const [draft, setDraft] = useState(account);
  const [pay, setPay] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const audience = draft.type === 'business' ? 'business' : 'personal';
  const plans = Object.entries(PLANS).filter(([, p]) => p.audience === audience);
  const plan = PLANS[draft.plan]?.audience === audience ? draft.plan : plans.find(([, p]) => p.popular)?.[0] ?? plans[0][0];
  const p = PLANS[plan];
  const q = quote({ ...draft, plan });
  const isCurrent = account.plan === plan && account.type === draft.type;

  const switchAudience = (type) => {
    const first = Object.entries(PLANS).find(([, x]) => x.audience === (type === 'business' ? 'business' : 'personal') && x.popular)?.[0];
    set({ type, plan: first, vehicles: type === 'business' ? Math.max(10, draft.vehicles) : 1, vehicleType: type === 'business' ? 'taxi' : 'car', hw: type === 'business' ? 'cam' : 'tracker' });
  };

  return (
    <div className="screen pushed">
      <NavBar title="Plans & pricing" onBack={pop} />
      <Segmented options={[{ value: 'personal', label: 'Personal' }, { value: 'business', label: 'Business' }]} value={audience} onChange={switchAudience} />
      <div className="muted" style={{ fontSize: 13, margin: '8px 4px 12px' }}>
        {audience === 'personal' ? 'For owners of a car, bike, scooter or family vehicles.' : 'For taxi and auto operators, buses, trucks, delivery and any fleet. Priced per vehicle.'}
      </div>

      <div className="stack">
        {plans.map(([key, pl]) => (
          <button key={key} className="card fade" onClick={() => set({ plan: key, vehicles: Math.max(pl.vehicles[0], Math.min(draft.vehicles, pl.vehicles[1] === Infinity ? draft.vehicles : pl.vehicles[1])) })}
            style={{ textAlign: 'left', borderColor: plan === key ? 'var(--accent)' : undefined, borderWidth: plan === key ? 2 : 1, background: plan === key ? 'color-mix(in srgb, var(--accent) 7%, var(--surface))' : undefined }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 750, fontSize: 18 }}>{pl.name}</span>
                  {pl.popular && <span className="badge accent">Popular</span>}
                  {account.plan === key && account.type === draft.type && <span className="badge good">Current</span>}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>{pl.tagline}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {pl.monthly == null ? <div style={{ fontWeight: 750 }}>Talk to us</div> : (
                  <>
                    <div className="num" style={{ fontWeight: 800, fontSize: 22 }}>{pl.monthly ? fmtINR(pl.monthly) : 'Free'}</div>
                    {pl.monthly > 0 && <div className="muted" style={{ fontSize: 11.5 }}>{pl.perVehicle ? 'per vehicle / month' : 'per month'}</div>}
                  </>
                )}
              </div>
            </div>
            <div className="stack" style={{ gap: 4, marginTop: 10 }}>
              {pl.features.map((f) => <div key={f} className="row" style={{ gap: 8, fontSize: 13.5, alignItems: 'flex-start' }}><Check size={15} color="var(--good-ink)" style={{ flex: 'none', marginTop: 2 }} /><span>{f}</span></div>)}
            </div>
          </button>
        ))}
      </div>

      {p.monthly != null && q && (
        <>
          <SectionTitle>Your quote</SectionTitle>
          <div className="card stack">
            {audience === 'business' && (
              <div className="field"><label htmlFor="co">Business name</label><input id="co" value={draft.company} placeholder="e.g. City Cabs" onChange={(e) => set({ company: e.target.value })} /></div>
            )}
            <div>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Vehicle type</div>
              <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
                {Object.entries(VEHICLE_TYPES).map(([k, t]) => <button key={k} className={`chip ${draft.vehicleType === k ? 'on' : ''}`} onClick={() => set({ vehicleType: k, hw: t.device })}>{t.label}</button>)}
              </div>
            </div>
            {(p.perVehicle || p.vehicles[1] > 1) && (
              <div>
                <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>Vehicles</span><b className="num" style={{ color: 'var(--accent)' }}>{q.vehicles}</b></div>
                <input className="slider" type="range" min={p.vehicles[0]} max={p.perVehicle ? 500 : p.vehicles[1]} value={q.vehicles} aria-label="Number of vehicles" onChange={(e) => set({ vehicles: Number(e.target.value) })} />
                {p.perVehicle && <div className="muted" style={{ fontSize: 12 }}>10% off from 50 vehicles, 15% from 200. 1,000+? Choose Enterprise.</div>}
              </div>
            )}
            <div>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Billing</div>
              <Segmented options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly · 2 months free' }]} value={draft.billing} onChange={(v) => set({ billing: v })} />
            </div>
            <div>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tracker hardware</div>
              <div className="list">
                {Object.entries(HARDWARE).map(([k, h]) => (
                  <label key={k} className="list-item plain" style={{ cursor: 'pointer' }}>
                    <input type="radio" name="hw" checked={draft.hw === k} onChange={() => set({ hw: k })} style={{ accentColor: 'var(--accent)', width: 18, height: 18 }} />
                    <div className="grow"><div className="title" style={{ fontSize: 14 }}>{h.name}</div>{h.for && <div className="meta">{h.for}</div>}</div>
                    {k !== 'none' && <div className="num" style={{ textAlign: 'right', fontSize: 12.5 }}><b>{fmtINR(h.buy)}</b><div className="muted">or {fmtINR(h.rent)}/mo</div></div>}
                  </label>
                ))}
              </div>
              {draft.hw !== 'none' && (
                <div style={{ marginTop: 8 }}><Segmented options={[{ value: 'buy', label: 'Buy once' }, { value: 'rent', label: 'Rent monthly' }]} value={draft.hwMode} onChange={(v) => set({ hwMode: v })} /></div>
              )}
            </div>

            <table className="log">
              <tbody>
                <tr><td className="muted">Subscription{q.discount ? ` (−${Math.round(q.discount * 100)}%)` : ''}</td><td className="num" style={{ textAlign: 'right' }}>{fmtINR(q.subMonthly)}/mo</td></tr>
                {q.rentMonthly > 0 && <tr><td className="muted">Hardware rent</td><td className="num" style={{ textAlign: 'right' }}>{fmtINR(q.rentMonthly)}/mo</td></tr>}
                {q.upfront > 0 && <tr><td className="muted">Hardware & installation (one-time){q.install === 0 && draft.hw !== 'none' ? ' · free install' : ''}</td><td className="num" style={{ textAlign: 'right' }}>{fmtINR(q.upfront)}</td></tr>}
                <tr><td className="muted">Billed {q.periodLabel}</td><td className="num" style={{ textAlign: 'right' }}>{fmtINR(q.period)}</td></tr>
                <tr><td className="muted">GST {Math.round(GST * 100)}%</td><td className="num" style={{ textAlign: 'right' }}>{fmtINR(q.gst)}</td></tr>
                <tr><td style={{ fontWeight: 700 }}>First payment</td><td className="num" style={{ textAlign: 'right', fontWeight: 800, fontSize: 17 }}>{fmtINR(q.firstBill)}</td></tr>
              </tbody>
            </table>
            <div className="muted num" style={{ fontSize: 12.5 }}>
              ≈ {fmtINR(q.perVehicleMonthly)} per vehicle per month{q.yearlySaving ? ` · you save ${fmtINR(q.yearlySaving)} a year` : ''}. Installation {fmtINR(INSTALL_FEE)} per vehicle, free from 10 vehicles.
            </div>
          </div>
          <button className="btn primary" style={{ marginTop: 14 }} disabled={isCurrent && q.upfront === 0} onClick={() => (q.firstBill > 0 ? setPay(true) : (setAccount({ ...draft, plan }), setToast('Switched to the Free plan')))}>
            {isCurrent ? 'Current plan' : q.firstBill > 0 ? `Continue · ${fmtINR(q.firstBill)}` : 'Switch to Free'}
          </button>
        </>
      )}
      {p.monthly == null && (
        <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setToast('Request sent — our team will call you within one working day')}><Building2 size={18} /> Request an Enterprise quote</button>
      )}
      {audience === 'business' && (
        <button className="btn" style={{ marginTop: 10 }} onClick={() => push('fleet')}>See the fleet dashboard</button>
      )}

      <Sheet open={pay} onClose={() => setPay(false)}>
        <h3>Pay {q ? fmtINR(q.firstBill) : ''}</h3>
        <p className="muted" style={{ margin: '4px 0 14px', fontSize: 13.5 }}>{p.name}{draft.type === 'business' && q ? ` · ${q.vehicles} vehicles` : ''} · includes GST. Secure payment by Razorpay (demo — nothing is charged).</p>
        <div className="list" style={{ marginBottom: 14 }}>
          {[[Smartphone, 'UPI', 'GPay, PhonePe, Paytm, BHIM · autopay mandate'], [CreditCard, 'Card', 'Credit or debit, recurring'], [Landmark, 'Net banking / NACH', 'Best for business accounts']].map(([I, t, m]) => (
            <button key={t} className="list-item" onClick={() => { setAccount({ ...draft, plan }); setPay(false); setToast(`Subscribed to ${p.name} · GST invoice emailed`); }}>
              <div className="glyph accent"><I size={18} /></div>
              <div className="grow"><div className="title">{t}</div><div className="meta">{m}</div></div>
            </button>
          ))}
        </div>
        <div className="row muted" style={{ fontSize: 12, gap: 6 }}><BadgeCheck size={14} /> Cancel anytime. GST invoice for input tax credit (business).</div>
      </Sheet>
    </div>
  );
}
