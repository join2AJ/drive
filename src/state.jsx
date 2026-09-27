import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createDemoSource } from './data/source.js';
import {
  DEFAULT_THRESHOLDS, analyzeTrip, detectEvents, frequentPlaces, geofenceTransitions,
} from './lib/analytics.js';
import { places as allPlaces, tollPlazas, DEFAULT_PARKING_FEES } from './data/cityModel.js';
import { DEFAULT_FUEL, tollsOnTrip } from './lib/costs.js';
import { defaultReminders, seedFuelLog } from './lib/paperwork.js';
import { DEFAULT_DRIVERS, unusualMovement, driverViolations } from './lib/security.js';
import { sha256, snapshotGps } from './lib/evidence.js';

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

/** useState that survives reloads (localStorage). `init` may be a function. */
function usePersistent(key, init) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch { /* fall through */ }
    return typeof init === 'function' ? init() : init;
  });
  useEffect(() => save(key, v), [key, v]);
  return [v, setV];
}

const DEFAULT_SETTINGS = {
  theme: 'dark',
  notify: { crash: true, harsh: true, overspeed: true, geofence: true, ignition: false, tamper: true },
  contacts: [
    { name: 'Priya (spouse)', phone: '+91 98450 12345' },
    { name: 'Emergency', phone: '112' },
  ],
  sosCountdown: 30,
  placeNames: {},
  fuel: DEFAULT_FUEL,
  // Remembered once, pre-filled into every claim.
  claimProfile: { driverName: 'Arjun Kumar', phone: '+91 98450 67890', licenceNo: '', insurer: '', policyNo: '' },
  parkingFees: DEFAULT_PARKING_FEES,
  logbookRule: 'office', // trips to/from Office default to "business"
  offlineMaps: { bengaluru: 'ready' },
  autoUpdateMaps: true,
};

const DEFAULT_CONTROLS = {
  locked: true,
  engine: 'on',
  mirrors: 'open',
  windows: 'closed',
  trunk: 'closed',
  lights: false,
  hazard: false,
  climate: false,
  climateTemp: 22,
  guard: true,
  valet: false,
  speedLimiter: false,
  speedLimitKmh: 80,
};

// Evidence window kept around an incident: 15 min before, 5 min after.
export const EVIDENCE_BEFORE = 15 * 60_000;
export const EVIDENCE_AFTER = 5 * 60_000;

export function AppProvider({ children }) {
  const [source] = useState(() => createDemoSource(Date.now()));
  const [thresholds, setThresholds] = useState(() => load('drive.thresholds', DEFAULT_THRESHOLDS));
  const [settings, setSettings] = useState(() => load('drive.settings', DEFAULT_SETTINGS));
  const [fences, setFences] = useState(source.geofences);
  const [toast, setToast] = useState(null);
  const [immobilized, setImmobilized] = useState(false);
  const [incidents, setIncidents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('drive.incidents') ?? '[]'); } catch { return []; }
  });
  const [deletedMedia, setDeletedMedia] = useState(() => {
    try { return JSON.parse(localStorage.getItem('drive.media.deleted') ?? '[]'); } catch { return []; }
  });

  useEffect(() => save('drive.thresholds', thresholds), [thresholds]);
  useEffect(() => save('drive.settings', settings), [settings]);
  useEffect(() => save('drive.incidents', incidents), [incidents]);
  useEffect(() => save('drive.media.deleted', deletedMedia), [deletedMedia]);

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

  const trips = useMemo(
    () => source.trips.map((t) => ({
      ...analyzeTrip(t, thresholds),
      tolls: tollsOnTrip(t.samples, tollPlazas),
      parkingKey: t.to && settings.parkingFees?.[t.to] != null ? t.to : null,
    })),
    [source, thresholds, settings.parkingFees],
  );
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


  // ---------------- Paperwork, money, people ----------------
  const [reminders, setReminders] = usePersistent('drive.reminders', () => defaultReminders(Date.now(), source.vehicle.odometerKm));
  const [fuelLog, setFuelLog] = usePersistent('drive.fuellog', () => seedFuelLog(source.trips.map((t) => analyzeTrip(t)), source.vehicle.odometerKm));
  const [tripTags, setTripTags] = usePersistent('drive.triptags', {});
  const [drivers, setDrivers] = usePersistent('drive.drivers', DEFAULT_DRIVERS);
  const [parking, setParking] = usePersistent('drive.parking', { note: '', timerUntil: null });
  const [stolen, setStolen] = usePersistent('drive.stolen', { active: false });
  const [share, setShare] = useState(null);
  const odometerKm = source.vehicle.odometerKm;
  const alerts = useMemo(() => buildAlerts(trips, fences, drivers), [trips, fences, drivers]);

  // ---------------- Connectivity ----------------
  // Phone: real navigator.onLine, plus a demo switch. Tracker: demo switch for "no 4G here".
  const [browserOnline, setBrowserOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [demoPhoneOffline, setDemoPhoneOffline] = useState(false);
  const [trackerOnline, setTrackerOnline] = useState(true);
  useEffect(() => {
    const on = () => setBrowserOnline(true);
    const off = () => setBrowserOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  const phoneOnline = browserOnline && !demoPhoneOffline;
  const network = { phoneOnline, trackerOnline, setTrackerOnline, demoPhoneOffline, setDemoPhoneOffline, connected: phoneOnline && trackerOnline };

  // ---------------- Live vehicle ----------------
  const live = useLiveVehicle(source.live, thresholds, network.connected, (n) => setToast(`Synced ${n} GPS points recorded while offline`));

  // Share-my-ride stops by itself on arrival.
  const remainingM = useMemo(() => {
    let d = 0;
    for (let i = 1; i < live.ahead.length; i += 1) d += Math.hypot(live.ahead[i].x - live.ahead[i - 1].x, live.ahead[i].y - live.ahead[i - 1].y);
    return d;
  }, [live.ahead]);
  useEffect(() => {
    if (share?.active && share.stopOnArrival && remainingM < 60) {
      setShare((sh) => ({ ...sh, active: false, endedAt: Date.now(), endReason: 'arrived' }));
      setToast('Arrived — ride sharing stopped automatically');
    }
  }, [remainingM, share]);
  const controls = useVehicleControls(live, immobilized, setImmobilized, setToast);

  // ---------------- Media & incidents ----------------
  // Evidence is append-only: anything inside an incident's window is locked and can't be deleted.
  const media = useMemo(() => {
    const extra = incidents.flatMap((inc) => inc.media ?? []);
    const all = [...extra, ...source.media].filter((m) => !deletedMedia.includes(m.id));
    return all
      .map((m) => {
        const inc = incidents.find((i) => i.media?.some((x) => x.id === m.id) || (m.t >= i.window[0] && m.t <= i.window[1]));
        return inc ? { ...m, locked: true, incidentId: inc.id } : m;
      })
      .sort((a, b) => b.t - a.t);
  }, [source.media, incidents, deletedMedia]);

  const deleteMedia = useCallback((id) => {
    const m = media.find((x) => x.id === id);
    if (!m || m.locked) return false;
    setDeletedMedia((d) => [...d, id]);
    return true;
  }, [media]);

  const createIncident = useCallback(async ({ type, t, samples, tripId, source: src = 'user', autoKey, extraMedia = true }) => {
    const window = [t - EVIDENCE_BEFORE, t + EVIDENCE_AFTER];
    const gps = snapshotGps(samples, window[0], window[1]);
    const at = gps.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best), gps[0] ?? { t, x: 0, y: 0, v: 0 });
    const seq = String(incidents.length + 1).padStart(4, '0');
    const id = `INC-${new Date(t).getFullYear()}-${seq}`;
    const now = Date.now();
    const newMedia = extraMedia
      ? [
          { id: `${id}-F`, kind: 'video', camera: 'Front', t: t - 30_000, duration: 60, eventType: 'incident', eventT: t, locked: true, sizeMB: 176 },
          { id: `${id}-C`, kind: 'video', camera: 'Cabin', t: t - 30_000, duration: 60, eventType: 'incident', eventT: t, locked: true, sizeMB: 118 },
          { id: `${id}-A`, kind: 'audio', camera: 'Cabin mic', t: t - 90_000, duration: 180, eventType: 'incident', eventT: t, locked: true, sizeMB: 2.8 },
        ]
      : [];
    const gpsHash = await sha256(JSON.stringify(gps));
    const inc = {
      id,
      autoKey,
      type,
      source: src,
      t,
      createdAt: now,
      tripId,
      window,
      location: { x: at.x, y: at.y },
      speedAt: at.v,
      gps,
      gpsHash,
      media: newMedia,
      photos: [],
      details: {},
      status: 'open',
      log: [{ t: now, action: src === 'auto' ? 'Created automatically by collision detection' : 'Incident logged by driver' }, { t: now, action: `Evidence locked: ${gps.length} GPS points, ${newMedia.length} recordings` }],
    };
    setIncidents((list) => [inc, ...list]);
    return inc;
  }, [incidents.length]);

  const updateIncident = useCallback((id, patch, action) => {
    setIncidents((list) => list.map((i) => {
      if (i.id !== id) return i;
      const next = typeof patch === 'function' ? patch(i) : { ...i, ...patch };
      return action ? { ...next, log: [...i.log, { t: Date.now(), action }] } : next;
    }));
  }, []);

  // The auto-detected collision becomes a case the driver can complete for the insurer.
  const crashAlert = alerts.find((a) => a.type === 'crash');
  const autoCreated = useRef(false);
  useEffect(() => {
    if (!crashAlert || autoCreated.current || incidents.some((i) => i.autoKey === 'auto-crash')) return;
    autoCreated.current = true;
    const trip = trips.find((t) => t.id === crashAlert.tripId);
    createIncident({ type: 'collision', t: crashAlert.t, samples: trip.samples, tripId: trip.id, source: 'auto', autoKey: 'auto-crash', extraMedia: false });
  }, [crashAlert, incidents, trips, createIncident]);

  const value = {
    source, vehicle: source.vehicle, trips, tripById, thresholds, setThresholds,
    settings, setSettings, fences, setFences, frequent, alerts, placeNameAt, placeAt, savedPlaces,
    live, toast, setToast, immobilized, setImmobilized, controls,
    media, deleteMedia, incidents, createIncident, updateIncident,
    reminders, setReminders, fuelLog, setFuelLog, tripTags, setTripTags, drivers, setDrivers,
    parking, setParking, stolen, setStolen, share, setShare, remainingM, odometerKm, network,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function buildAlerts(trips, fences, drivers = []) {
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
  // GNSS lost while 4G stayed up and the car was parked: classic jammer signature.
  out.push({ type: 'gps_jam', t: now - 6 * 86_400_000 - 21.8 * 3_600_000, x: home.x + 40, y: home.y + 25, id: 'gj1', detail: 'GPS jammed for 4 min at 2:12 AM while 4G stayed connected · motion sensor quiet · no movement' });
  unusualMovement(trips).forEach((u, k) => out.push({ ...u, id: `un${k}` }));
  // New-driver rule breaches (speed / curfew).
  for (const t of trips) {
    const d = drivers.find((x) => x.id === t.driver);
    if (!d?.rules?.enabled) continue;
    driverViolations(t, d.rules).forEach((v, k) => out.push({ ...v, type: v.type === 'curfew' ? 'curfew' : 'driver_speed', driver: d.name, tripId: t.id, id: `${t.id}-dv${k}`, detail: `${d.name}: ${v.detail}` }));
  }
  return out.sort((a, b) => b.t - a.t);
}

/** Streams the live trip at 1 Hz, loops it, and runs crash detection on the rolling window. */
function useLiveVehicle(liveTrip, thresholds, connected = true, onSync) {
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

  // Store-and-forward: while the link is down the tracker keeps logging (idx moves) but the
  // app only has what it last received (syncedIdx). On reconnect the backlog arrives at once.
  const [syncedIdx, setSyncedIdx] = useState(idx);
  const syncRef = useRef(onSync);
  syncRef.current = onSync;
  useEffect(() => {
    if (idx < syncedIdx) setSyncedIdx(idx);
    else if (connected && syncedIdx !== idx) {
      if (idx - syncedIdx > 3) syncRef.current?.(idx - syncedIdx);
      setSyncedIdx(idx);
    }
  }, [idx, connected, syncedIdx]);
  const vi = connected ? idx : Math.min(syncedIdx, idx);

  const cur = samples[vi];
  const prev = samples[Math.max(0, vi - 3)];
  const heading = Math.atan2(cur.y - prev.y, cur.x - prev.x) || 0;
  const trail = samples.slice(Math.max(0, vi - 600), vi + 1);
  const ahead = samples.slice(vi);
  const buffered = idx - vi;

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
    cur, heading, trail, ahead, idx: vi, deviceIdx: idx, buffered, samples, crash, setCrash, dismissCrash, simulateImpact, resume,
    tripStart: liveTrip.samples[0].t + offset.current,
    now: cur.t + offset.current,
    stopped: paused && !crash,
  };
}

/*
 * Remote vehicle commands. Each command goes out over 4G/SMS to the tracker, which drives
 * a relay or the car's CAN bus, then reports back. We simulate that round trip and enforce
 * the same safety interlocks the firmware would.
 */
function useVehicleControls(live, immobilized, setImmobilized, setToast) {
  const [state, setState] = useState(DEFAULT_CONTROLS);
  const [pending, setPending] = useState({});
  const [log, setLog] = useState([]);
  const [parkedDemo, setParked] = useState(false);
  const moving = !parkedDemo && live.cur.v > 3;
  // While the demo car is driving the engine is obviously running; "parked" lets you try the rest.
  const engine = parkedDemo ? state.engine : 'on';
  const setParkedDemo = useCallback((on) => {
    setParked(on);
    setState((s) => ({ ...s, engine: on ? 'off' : 'on', locked: on ? true : s.locked }));
  }, []);

  const send = useCallback((key, label, apply, { latency = 1400 } = {}) => {
    setPending((p) => ({ ...p, [key]: true }));
    const sentAt = Date.now();
    setTimeout(() => {
      setState((s) => apply(s));
      setPending((p) => ({ ...p, [key]: false }));
      setLog((l) => [{ t: Date.now(), label, ms: Date.now() - sentAt, ok: true }, ...l].slice(0, 30));
      if (navigator.vibrate) navigator.vibrate(30);
      setToast(`${label} · confirmed by vehicle`);
    }, latency + Math.random() * 700);
  }, [setToast]);

  return { state: { ...state, immobilized }, setState, pending, log, send, moving, engine, parkedDemo, setParkedDemo, setImmobilized };
}
