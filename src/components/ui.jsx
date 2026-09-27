import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, Siren, OctagonAlert, Gauge, Zap, LogIn, LogOut, Power, PowerOff, BatteryWarning,
  ShieldAlert, Truck, SatelliteDish, MoonStar, Clock3, Timer, AlarmClock, Home, Briefcase, Dumbbell, ShoppingBag, Heart, GraduationCap, Plane, MapPin, Mic, Video,
} from 'lucide-react';

export const EVENT_META = {
  crash: { label: 'Possible collision', short: 'Collision', icon: Siren, tone: 'crit', severity: 3 },
  harsh_brake: { label: 'Harsh braking', short: 'Harsh brake', icon: OctagonAlert, tone: 'warn', severity: 2 },
  harsh_accel: { label: 'Harsh acceleration', short: 'Hard launch', icon: Zap, tone: 'warn', severity: 1 },
  overspeed: { label: 'Overspeeding', short: 'Overspeed', icon: Gauge, tone: 'warn', severity: 2 },
  geofence_enter: { label: 'Entered geofence', short: 'Arrived', icon: LogIn, tone: 'violet', severity: 0 },
  geofence_exit: { label: 'Left geofence', short: 'Left', icon: LogOut, tone: 'violet', severity: 0 },
  ignition_on: { label: 'Ignition on', short: 'Ignition on', icon: Power, tone: 'good', severity: 0 },
  ignition_off: { label: 'Ignition off', short: 'Ignition off', icon: PowerOff, tone: '', severity: 0 },
  power_cut: { label: 'Main power disconnected', short: 'Power cut', icon: BatteryWarning, tone: 'crit', severity: 2 },
  tamper: { label: 'Device tamper detected', short: 'Tamper', icon: ShieldAlert, tone: 'crit', severity: 2 },
  tow: { label: 'Movement with ignition off', short: 'Towing?', icon: Truck, tone: 'crit', severity: 2 },
  low_battery: { label: 'Low vehicle battery', short: 'Low battery', icon: BatteryWarning, tone: 'warn', severity: 1 },
  gps_jam: { label: 'GPS jamming suspected', short: 'GPS jammed', icon: SatelliteDish, tone: 'crit', severity: 3 },
  unusual_night: { label: 'Unusual night movement', short: 'Night move', icon: MoonStar, tone: 'crit', severity: 2 },
  curfew: { label: 'Curfew broken', short: 'Curfew', icon: Clock3, tone: 'warn', severity: 1 },
  driver_speed: { label: 'New-driver speed limit', short: 'Over limit', icon: Gauge, tone: 'warn', severity: 1 },
  route_deviation: { label: 'Left planned route', short: 'Off route', icon: AlarmClock, tone: 'warn', severity: 2 },
  long_idle: { label: 'Long idling', short: 'Idling', icon: Timer, tone: 'warn', severity: 1 },
};

export const PLACE_ICONS = { home: Home, briefcase: Briefcase, dumbbell: Dumbbell, shopping: ShoppingBag, heart: Heart, school: GraduationCap, plane: Plane, pin: MapPin, mic: Mic, video: Video };

export function PlaceIcon({ name, size = 18 }) {
  const I = PLACE_ICONS[name] ?? MapPin;
  return <I size={size} />;
}

export function EventGlyph({ type, size = 18 }) {
  const m = EVENT_META[type] ?? EVENT_META.ignition_off;
  const I = m.icon;
  return <div className={`glyph ${m.tone}`}><I size={size} /></div>;
}

export function NavBar({ title, onBack, right }) {
  return (
    <div className="navbar">
      <button className="icon-btn ghost" onClick={onBack} aria-label="Back"><ChevronLeft size={26} /></button>
      <div className="title">{title}</div>
      <div style={{ justifySelf: 'end' }}>{right}</div>
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="segmented" role="tablist">
      <div className="thumb" style={{ left: `calc(3px + ${idx} * (100% - 6px) / ${options.length})`, width: `calc((100% - 6px) / ${options.length})` }} />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Sheet({ open, onClose, children }) {
  if (!open) return null;
  // Portal to the app root so a sheet opened from a scrolled screen still sits at the bottom.
  const host = document.querySelector('.app');
  const body = (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grabber" />
        {children}
      </div>
    </>
  );
  return host ? createPortal(body, host) : body;
}

export function Toast({ message, onDone }) {
  // Keep the latest callback without restarting the timer on every parent render.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(() => done.current(), 2600);
    return () => clearTimeout(id);
  }, [message]);
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}

export function SectionTitle({ children, action, onAction }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action && <button className="link" onClick={onAction}>{action}</button>}
    </div>
  );
}

/** Animated count-up for hero numbers. */
export function CountUp({ value, decimals = 0, duration = 700 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - p) ** 3;
      setShown(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="num">{shown.toFixed(decimals)}</span>;
}
