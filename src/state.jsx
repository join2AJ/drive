import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createDemoSource } from './data/source.js';
import {
  DEFAULT_THRESHOLDS, analyzeTrip, detectEvents, frequentPlaces, geofenceTransitions,
} from './lib/analytics.js';
import { places as allPlaces } from './data/cityModel.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
};
const save = (key, v) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
};

const DEFAULT_SETTINGS = {
  theme: 'dark',
  notify: { crash: true, harsh: true, overspeed: true, geofence: true, ignition: false, tamper: true },
  contacts: [
    { name: 'Priya (spouse)', phone: '+91 98450 12345' },
    { name: 'Emergency', phone: '112' },
  ],
  sosCountdown: 30,
  placeNames: {},
};

export function AppProvider({ children }) {
  const [source] = useState(() => createDemoSource(Date.now()));
  const [thresholds, setThresholds] = useState(() => load('drive.thresholds', DEFAULT_THRESHOLDS));
  const [settings, setSettings] = useState(() => load('drive.settings', DEFAULT_SETTINGS));
  const [fences, setFences] = useState(source.geofences);
  const [toast, setToast] = useState(null);
  const [immobilized, setImmobilized] = useState(false);

  useEffect(() => save('drive.thresholds', thresholds), [thresholds]);
  useEffect(() => save('drive.settings', settings), [settings]);

  // Theme
  useEffect(() => {
    const apply = () => {
      const t = settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : settings.theme;
      document.documentElement.dataset.theme = t;
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  const trips = useMemo(() => source.trips.map((t) => analyzeTrip(t, thresholds)), [source, thresholds]);
  const tripById = useMemo(() => Object.fromEntries(trips.map((t) => [t.id, t])), [trips]);

  const savedPlaces = useMemo(() => {
    const base = Object.values(allPlaces).map((p) => ({ ...p, name: settings.placeNames[p.key] ?? p.name }));
    return base;
  }, [settings.placeNames]);
  const labelledPlaces = useMemo(() => savedPlaces.filter((p) => p.name), [savedPlaces]);

  const placeNameAt = useCallback(
    (pt) => {
      const p = savedPlaces.find((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < 320);
      return p ? p.name ?? 'Unlabeled place' : null;
    },
    [savedPlaces],
  );
  const placeAt = useCallback((pt) => savedPlaces.find((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < 320) ?? null, [savedPlaces]);

  const frequent = useMemo(() => frequentPlaces(trips, labelledPlaces), [trips, labelledPlaces]);

  const alerts = useMemo(() => buildAlerts(trips, fences), [trips, fences]);

  // ---------------- Live vehicle ----------------
  const live = useLiveVehicle(source.live, thresholds);

  const value = {
    source, vehicle: source.vehicle, trips, tripById, media: source.media, thresholds, setThresholds,
    settings, setSettings, fences, setFences, frequent, alerts, placeNameAt, placeAt, savedPlaces,
    live, toast, setToast, immobilized, setImmobilized,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function buildAlerts(trips, fences) {
  const out = [];
  const now = Date.now();
  for (const t of trips) {
    for (const e of t.events) out.push({ ...e, tripId: t.id, id: `${t.id}-${e.type}-${e.i}` });
    if (now - t.start < 2 * 86_400_000) {
      out.push({ type: 'ignition_on', t: t.start, x: t.samples[0].x, y: t.samples[0].y, tripId: t.id, id: `${t.id}-on` });
      const l = t.samples[t.samples.length - 1];
      out.push({ type: 'ignition_off', t: l.t, x: l.x, y: l.y, tripId: t.id, id: `${t.id}-off` });
    }
  }
  const recent = trips.filter((t) => now - t.start < 7 * 86_400_000);
  geofenceTransitions(recent, fences).forEach((g, k) => out.push({ ...g, id: `gf${k}` }));
  // Device-health alerts a wired unit raises on its own.
  const home = trips[0].samples[0];
  out.push({ type: 'power_cut', t: now - 9 * 86_400_000 - 3 * 3_600_000, x: home.x, y: home.y, id: 'pc1', detail: 'Main 12 V feed lost for 42 s · running on backup battery. Restored.' });
  out.push({ type: 'low_battery', t: now - 12 * 86_400_000 - 5 * 3_600_000, x: home.x, y: home.y, id: 'lb1', detail: 'Vehicle battery dropped to 11.6 V while parked overnight.' });
  return out.sort((a, b) => b.t - a.t);
}

/** Streams the live trip at 1 Hz, loops it, and runs crash detection on the rolling window. */
function useLiveVehicle(liveTrip, thresholds) {
  const [samples, setSamples] = useState(liveTrip.samples);
  const startIdx = Math.min(300, samples.length - 1);
  const [idx, setIdx] = useState(startIdx);
  const [crash, setCrash] = useState(null);
  const [paused, setPaused] = useState(false);
  const offset = useRef(Date.now() - liveTrip.samples[startIdx].t);
  const handled = useRef(new Set());

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i + 1 < samples.length) return i + 1;
        // Loop the demo trip.
        offset.current = Date.now() - liveTrip.samples[0].t;
        setSamples(liveTrip.samples);
        handled.current.clear();
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paused, samples.length, liveTrip]);

  // Real-time detection on the latest window.
  useEffect(() => {
    const win = samples.slice(Math.max(0, idx - 8), idx + 1);
    const evs = detectEvents(win, thresholds).filter((e) => e.type === 'crash');
    for (const e of evs) {
      const key = Math.round(e.t / 1000);
      if (!handled.current.has(key)) {
        handled.current.add(key);
        setCrash({ ...e, t: e.t + offset.current, live: true });
        setPaused(true);
      }
    }
  }, [idx, samples, thresholds]);

  const cur = samples[idx];
  const prev = samples[Math.max(0, idx - 3)];
  const heading = Math.atan2(cur.y - prev.y, cur.x - prev.x) || 0;
  const trail = samples.slice(Math.max(0, idx - 600), idx + 1);
  const ahead = samples.slice(idx);

  /** Demo: inject a collision profile into the upcoming stream (speed up, then ~80 → 4 km/h in 2 s). */
  const simulateImpact = useCallback(() => {
    setSamples((old) => {
      const base = old.slice(0, idx + 1);
      const rest = old.slice(idx);
      const cum = [0];
      for (let k = 1; k < rest.length; k++) cum.push(cum[k - 1] + Math.hypot(rest[k].x - rest[k - 1].x, rest[k].y - rest[k - 1].y));
      const at = (d) => {
        let k = 1;
        while (k < cum.length - 1 && cum[k] < d) k++;
        const f = Math.min(1, (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1));
        return { x: rest[k - 1].x + (rest[k].x - rest[k - 1].x) * f, y: rest[k - 1].y + (rest[k].y - rest[k - 1].y) * f, limit: rest[k].limit };
      };
      const speeds = [];
      let v = old[idx].v;
      while (v < 80) { v = Math.min(82, v + 9.5); speeds.push(v); }
      speeds.push(82, 81, 42, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      let d = 0;
      let t = old[idx].t;
      let pv = old[idx].v;
      const extra = speeds.map((sv) => {
        d += ((pv + sv) / 2 / 3.6);
        pv = sv;
        t += 1000;
        const p = at(d);
        return { t, x: p.x, y: p.y, v: sv, limit: p.limit };
      });
      return [...base, ...extra];
    });
  }, [idx]);

  const dismissCrash = useCallback(() => { setCrash(null); setPaused(false); }, []);
  const resume = useCallback(() => {
    setSamples(liveTrip.samples);
    setIdx(startIdx);
    offset.current = Date.now() - liveTrip.samples[startIdx].t;
    handled.current.clear();
    setPaused(false);
    setCrash(null);
  }, [liveTrip, startIdx]);

  return {
    cur, heading, trail, ahead, idx, samples, crash, setCrash, dismissCrash, simulateImpact, resume,
    tripStart: liveTrip.samples[0].t + offset.current,
    now: cur.t + offset.current,
    stopped: paused && !crash,
  };
}
