import { Lock, LockOpen, Snowflake } from 'lucide-react';

// Top-down vehicle illustration that reflects live body state: locks, mirrors, windows,
// boot, lights, hazards, engine and horn.
export default function CarTopView({ s, engine, honking, flashing, height = 250 }) {
  const lights = s.lights || flashing;
  const glass = s.windows === 'open' ? 'var(--accent-soft)' : 'var(--car-glass)';
  return (
    <svg viewBox="0 0 200 360" height={height} style={{ overflow: 'visible' }} aria-label="Vehicle status">
      <defs>
        <linearGradient id="beam" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0" stopColor="#fff6c8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="186" rx="70" ry="168" fill="#000" opacity="0.18" />

      {lights && (
        <g className={flashing ? 'blink' : ''}>
          <polygon points="62,38 22,-40 96,-40 76,38" fill="url(#beam)" />
          <polygon points="124,38 104,-40 178,-40 138,38" fill="url(#beam)" />
        </g>
      )}

      {honking && (
        <g stroke="var(--accent)" strokeWidth="3" fill="none" strokeLinecap="round" className="horn-waves">
          <path d="M78 6 Q100 -6 122 6" />
          <path d="M68 -8 Q100 -26 132 -8" />
          <path d="M58 -22 Q100 -46 142 -22" />
        </g>
      )}

      {engine === 'on' && (
        <g className="exhaust" fill="var(--ink-3)">
          <circle cx="72" cy="346" r="5" />
          <circle cx="66" cy="356" r="7" />
        </g>
      )}

      {/* body */}
      <rect x="48" y="26" width="104" height="306" rx="40" fill="var(--car-body)" stroke="var(--car-edge)" strokeWidth="2" className={engine === 'on' ? 'idle-shake' : ''} />
      <path d="M58 70 Q100 58 142 70" stroke="var(--car-edge)" strokeWidth="1.5" fill="none" />

      {/* mirrors */}
      <g transform={`rotate(${s.mirrors === 'folded' ? 62 : 0} 52 128)`} style={{ transition: 'transform .6s cubic-bezier(.3,.7,.2,1)' }}>
        <rect x="30" y="121" width="22" height="12" rx="5" fill="var(--car-body)" stroke="var(--car-edge)" strokeWidth="1.5" />
      </g>
      <g transform={`rotate(${s.mirrors === 'folded' ? -62 : 0} 148 128)`} style={{ transition: 'transform .6s cubic-bezier(.3,.7,.2,1)' }}>
        <rect x="148" y="121" width="22" height="12" rx="5" fill="var(--car-body)" stroke="var(--car-edge)" strokeWidth="1.5" />
      </g>

      {/* glass */}
      <polygon points="62,110 138,110 130,152 70,152" fill={glass} stroke="var(--car-edge)" strokeWidth="1" style={{ transition: 'fill .4s' }} />
      <rect x="54" y="156" width="8" height="100" rx="3" fill={glass} style={{ transition: 'fill .4s' }} />
      <rect x="138" y="156" width="8" height="100" rx="3" fill={glass} style={{ transition: 'fill .4s' }} />
      <rect x="70" y="156" width="60" height="102" rx="10" fill="var(--car-roof)" />
      <polygon points="70,262 130,262 138,290 62,290" fill={glass} stroke="var(--car-edge)" strokeWidth="1" />
      <line x1="48" y1="206" x2="60" y2="206" stroke="var(--car-edge)" strokeWidth="1.5" />
      <line x1="140" y1="206" x2="152" y2="206" stroke="var(--car-edge)" strokeWidth="1.5" />

      {/* boot lid */}
      <g transform={`translate(0 ${s.trunk === 'open' ? 22 : 0})`} style={{ transition: 'transform .6s' }}>
        <rect x="58" y="294" width="84" height="34" rx="14" fill="var(--car-body)" stroke={s.trunk === 'open' ? 'var(--warning)' : 'var(--car-edge)'} strokeWidth="1.5" strokeDasharray={s.trunk === 'open' ? '4 3' : undefined} />
      </g>

      {/* lamps */}
      <ellipse cx="68" cy="38" rx="11" ry="5" fill={lights ? '#fffbe0' : 'var(--car-lamp)'} className={flashing ? 'blink' : ''} />
      <ellipse cx="132" cy="38" rx="11" ry="5" fill={lights ? '#fffbe0' : 'var(--car-lamp)'} className={flashing ? 'blink' : ''} />
      <rect x="56" y="322" width="22" height="6" rx="3" fill={s.hazard || flashing ? '#ff4d3d' : '#8a2a22'} className={s.hazard || flashing ? 'blink' : ''} />
      <rect x="122" y="322" width="22" height="6" rx="3" fill={s.hazard || flashing ? '#ff4d3d' : '#8a2a22'} className={s.hazard || flashing ? 'blink' : ''} />
      {s.hazard &&
        [[50, 60], [150, 60], [50, 300], [150, 300]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="6" fill="#fab219" className="blink" />)}

      {/* centre badge: lock state */}
      <g transform="translate(100 207)">
        <circle r="22" fill={s.locked ? 'var(--good)' : 'var(--warning)'} style={{ transition: 'fill .3s' }} />
        <g transform="translate(-11 -11)" color="#fff">{s.locked ? <Lock size={22} /> : <LockOpen size={22} />}</g>
      </g>
      {s.climate && engine === 'on' && (
        <g transform="translate(100 170)">
          <circle r="13" fill="var(--accent)" />
          <g transform="translate(-8 -8)" color="#fff"><Snowflake size={16} /></g>
        </g>
      )}
    </svg>
  );
}
