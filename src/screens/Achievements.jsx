import { useEffect, useMemo, useState } from 'react';
import { Flame, Award, ShieldCheck, Download, Share2, Zap, Gauge, Sunrise, Leaf, Route as RouteIcon, Moon } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar, SectionTitle } from '../components/ui.jsx';
import { streaks, badges, insurerScore } from '../lib/engagement.js';
import { sha256 } from '../lib/evidence.js';
import { exportPdf } from '../lib/exporters.js';

const ICONS = { smooth: Zap, speed: Gauge, early: Sunrise, eco: Leaf, km: RouteIcon, night: Moon };

export default function Achievements({ pop }) {
  const { trips, vehicle, settings, setToast } = useApp();
  const st = useMemo(() => streaks(trips), [trips]);
  const list = useMemo(() => badges(trips), [trips]);
  const cert = useMemo(() => insurerScore(trips), [trips]);
  const [code, setCode] = useState('');
  useEffect(() => {
    sha256(JSON.stringify({ plate: vehicle.plate, imei: vehicle.device.imei, ...cert })).then((h) => setCode(h.slice(0, 12).toUpperCase()));
  }, [cert, vehicle]);

  const rows = [
    ['Safety score', `${cert.score} / 100 (grade ${cert.grade})`],
    ['Distance tracked', `${Math.round(cert.km).toLocaleString('en-IN')} km over ${cert.days} days (${cert.trips} trips)`],
    ['Harsh events per 100 km', cert.harshPer100.toFixed(2)],
    ['Time over speed limit', `${(cert.overPct * 100).toFixed(1)}%`],
    ['Night driving (10 PM–5 AM)', `${(cert.night * 100).toFixed(1)}%`],
    ['Collisions detected', String(cert.crashes)],
  ];

  const download = async () => {
    try {
      await exportPdf({
        fileName: `safe-driving-${vehicle.plate.replace(/\s/g, '')}.pdf`,
        title: 'Safe-driving certificate',
        subtitle: `${vehicle.name} · ${vehicle.plate} · driver ${settings.claimProfile.driverName} · issued ${new Date().toLocaleDateString('en-IN')}`,
        columns: [{ header: 'Measure', key: 'k' }, { header: 'Value', key: 'v' }],
        rows: rows.map(([k, v]) => ({ k, v })),
        footer: `Computed from GPS tracker IMEI ${vehicle.device.imei}. Verification code ${code}.`,
      });
      setToast('Certificate downloaded');
    } catch {
      setToast('Could not create the PDF');
    }
  };
  const share = async () => {
    const text = `My safe-driving score is ${cert.score}/100 (grade ${cert.grade}) over ${Math.round(cert.km)} km in ${cert.days} days, measured by my car's GPS tracker. Verification code ${code}.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Safe-driving certificate', text });
      else { await navigator.clipboard.writeText(text); setToast('Copied — paste it into your insurer’s renewal form'); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="screen pushed">
      <NavBar title="Streaks & badges" onBack={pop} />

      <div className="card fade">
        <div className="row">
          <div className="glyph warn" style={{ width: 52, height: 52, borderRadius: 18 }}><Flame size={26} /></div>
          <div className="grow">
            <div className="num" style={{ fontSize: 26, fontWeight: 750, lineHeight: 1 }}>{st.current} day{st.current === 1 ? '' : 's'}</div>
            <div className="muted" style={{ fontSize: 13 }}>Smooth-driving streak · best {st.best}</div>
          </div>
        </div>
        <div className="streak-days" style={{ marginTop: 14 }} aria-label="Last 14 driving days">
          {st.days.map((d) => <i key={d.day} className={d.ok ? 'ok' : 'bad'} title={`${new Date(d.day).toLocaleDateString()} · ${d.ok ? 'smooth' : 'harsh event'}`} />)}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>A day counts when every trip scores 85+ with no harsh braking or launches.</div>
      </div>

      <SectionTitle>Badges</SectionTitle>
      <div className="grid-3">
        {list.map((b) => {
          const I = ICONS[b.key] ?? Award;
          return (
            <div key={b.key} className={`badge-tile ${b.earned ? 'earned' : ''}`}>
              <div className="medal"><I size={24} /></div>
              <div style={{ fontWeight: 650, fontSize: 12.5, lineHeight: 1.2 }}>{b.title}</div>
              {!b.earned && <div className="progress" style={{ width: '80%' }}><div style={{ width: `${b.progress * 100}%` }} /></div>}
              <div className="muted" style={{ fontSize: 11, lineHeight: 1.25 }}>{b.detail}</div>
            </div>
          );
        })}
      </div>

      <SectionTitle>For your insurer</SectionTitle>
      <div className="cert">
        <div className="row">
          <ShieldCheck size={22} color="var(--accent)" />
          <div className="grow"><div style={{ fontWeight: 750 }}>Safe-driving certificate</div><div className="muted" style={{ fontSize: 12.5 }}>Last {cert.days} days · {vehicle.plate}</div></div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{cert.score}</div>
            <div className="muted" style={{ fontSize: 12 }}>grade {cert.grade}</div>
          </div>
        </div>
        <table className="log" style={{ marginTop: 12 }}>
          <tbody>{rows.slice(1).map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td className="num" style={{ textAlign: 'right' }}>{v}</td></tr>)}</tbody>
        </table>
        <div className="hash" style={{ marginTop: 8 }}>Verification code {code}</div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <button className="btn small" style={{ width: '100%' }} onClick={download}><Download size={15} /> PDF</button>
          <button className="btn small primary" style={{ width: '100%' }} onClick={share}><Share2 size={15} /> Share</button>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Some Indian insurers offer pay-how-you-drive discounts on renewal. Share this with your insurer or agent and ask.</div>
    </div>
  );
}
