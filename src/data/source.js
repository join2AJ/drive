import { generateHistory, generateLiveTrip } from './simulator.js';
import { places } from './cityModel.js';
import { mulberry32 } from '../lib/rng.js';

/*
 * Data source adapter.
 *
 * The UI only talks to this shape, so swapping the simulator for a real tracker backend
 * (the vendor cloud API, a Traccar server, or your own MQTT ingest) means implementing
 * the same fields:
 *
 *   vehicle      – static vehicle + device metadata
 *   trips        – [{ id, start, end, samples: [{t,x,y,v,limit}], deviceEvents }]
 *   media        – dashcam / cabin-audio recordings the unit uploaded
 *   savedPlaces  – user-labelled places
 *   geofences    – [{ id, name, x, y, radius, enabled }]
 *   live         – { samples } a trip currently in progress (streamed at 1 Hz)
 *
 * Positions are local metres; see lib/geo.js for lat/lng conversion.
 */
export function createDemoSource(now = Date.now()) {
  const trips = generateHistory(now);
  const live = generateLiveTrip(now);
  return {
    kind: 'demo',
    vehicle: {
      name: 'Hyundai Creta',
      plate: 'KA 03 MX 4521',
      fuel: 'Petrol',
      odometerKm: 28_431,
      device: {
        model: 'NV Prime Nxt Gen (wired)',
        imei: '86 471204 553918 2',
        firmware: 'v4.2.7',
        sim: 'Airtel M2M · 4G',
        installed: 'Glovebox, hardwired to ignition',
        cameras: ['Front 1440p', 'Cabin 1080p IR'],
        mic: 'Cabin microphone',
      },
    },
    trips,
    live,
    media: buildMedia(trips, now),
    savedPlaces: Object.values(places).filter((p) => p.name),
    geofences: [
      { id: 'g1', name: 'Home', x: places.home.x, y: places.home.y, radius: 400, enabled: true },
      { id: 'g2', name: 'Office', x: places.office.x, y: places.office.y, radius: 500, enabled: true },
      { id: 'g3', name: 'School', x: places.school.x, y: places.school.y, radius: 300, enabled: false },
    ],
  };
}

function buildMedia(trips, now) {
  const rand = mulberry32(42);
  const media = [];
  let n = 0;
  const add = (m) => media.push({ id: `M${++n}`, ...m });

  for (const trip of trips) {
    for (const ev of trip.deviceEvents) {
      if (ev.type === 'crash') {
        add({ kind: 'video', camera: 'Front', t: ev.t - 15_000, duration: 30, tripId: trip.id, eventType: 'crash', eventT: ev.t, locked: true, sizeMB: 94 });
        add({ kind: 'video', camera: 'Cabin', t: ev.t - 15_000, duration: 30, tripId: trip.id, eventType: 'crash', eventT: ev.t, locked: true, sizeMB: 61 });
        add({ kind: 'audio', camera: 'Cabin mic', t: ev.t - 30_000, duration: 120, tripId: trip.id, eventType: 'crash', eventT: ev.t, locked: true, sizeMB: 1.9 });
      } else if (ev.type === 'harsh_brake') {
        add({ kind: 'video', camera: 'Front', t: ev.t - 10_000, duration: 20, tripId: trip.id, eventType: 'harsh_brake', eventT: ev.t, locked: false, sizeMB: 58 });
      }
    }
  }
  // A few clips and voice notes the driver saved manually with the button / voice command.
  const recent = trips.filter((t) => t.start > now - 21 * 86_400_000);
  for (let k = 0; k < 5; k++) {
    const trip = recent[Math.floor(rand() * recent.length)];
    const at = trip.start + (trip.end - trip.start) * (0.2 + rand() * 0.6);
    if (k % 2 === 0) add({ kind: 'video', camera: 'Front', t: at, duration: 20, tripId: trip.id, eventType: 'manual', locked: false, sizeMB: 57 });
    else add({ kind: 'audio', camera: 'Voice note', t: at, duration: 12 + Math.round(rand() * 40), tripId: trip.id, eventType: 'manual', locked: false, sizeMB: 0.4 });
  }
  return media.sort((a, b) => b.t - a.t);
}
