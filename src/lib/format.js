const DAY = 86_400_000;

export const fmtKm = (m, digits = 1) => `${(m / 1000).toFixed(digits)} km`;

export function fmtDuration(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m} min`;
  return `${s}s`;
}

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const fmtClock = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function fmtDay(ts, now = Date.now()) {
  const d = new Date(ts);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((start.getTime() - d.getTime()) / DAY) + 1;
  if (d >= start && d.getTime() < start.getTime() + DAY) return 'Today';
  if (d >= start && d.getTime() < start.getTime() + 2 * DAY) return 'Tomorrow';
  if (diff === 1) return 'Yesterday';
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== start.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString([], opts);
}

export function fmtAgo(ts, now = Date.now()) {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export const fmtHour = (h) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  const d = new Date(2000, 0, 1, hh, mm);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
