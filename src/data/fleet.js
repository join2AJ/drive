import { city, route } from './cityModel.js';
import { simulateDrive } from './simulator.js';
import { mulberry32 } from '../lib/rng.js';

// A demo business fleet: taxis, autos, a bus, trucks and delivery bikes around the same city.
// Each moving vehicle loops a simulated drive; the clock picks where it is right now.

const DRIVERS = ['Ramesh K', 'Imran S', 'Suresh B', 'Manjunath R', 'Venkatesh P', 'Arif M', 'Lakshmi N', 'Prakash G', 'Naveen H', 'Joseph D', 'Kiran T', 'Ravi S'];
const PLAN = [
  ['taxi', 'running'], ['taxi', 'running'], ['taxi', 'idle'], ['taxi', 'running'], ['taxi', 'stopped'],
  ['auto', 'running'], ['auto', 'running'], ['bus', 'running'], ['truck', 'running'], ['truck', 'stopped'],
  ['bike', 'running'], ['bike', 'offline'],
];

export function generateFleet() {
  const rand = mulberry32(314);
  const n = city.nodes.length;
  return PLAN.map(([type, mode], i) => {
    let a = Math.floor(rand() * n);
    let b = Math.floor(rand() * n);
    let path = route(a, b);
    for (let tries = 0; path.edges.length < 12 && tries < 10; tries++) { b = Math.floor(rand() * n); path = route(a, b); }
    const factor = type === 'bus' || type === 'truck' ? 0.8 : type === 'bike' ? 1.05 : 0.95;
    const sim = simulateDrive({ path, start: 0, seed: 1000 + i, speedFactor: factor });
    const loopSec = sim.samples.length;
    const plateNo = String(1000 + Math.floor(rand() * 8999));
    return {
      id: `V${i + 1}`,
      type,
      mode,
      plate: `KA ${String(1 + Math.floor(rand() * 60)).padStart(2, '0')} ${type === 'bike' || type === 'auto' ? 'E' : 'C'}${String.fromCharCode(65 + Math.floor(rand() * 26))} ${plateNo}`,
      driver: DRIVERS[i],
      name: { taxi: 'Swift Dzire', auto: 'Bajaj RE', bus: 'Tata Starbus', truck: 'Ashok Leyland 1616', bike: 'Honda Activa' }[type],
      samples: sim.samples,
      loopSec,
      offset: Math.floor(rand() * loopSec),
      odometer: 12_000 + Math.floor(rand() * 140_000),
      kmToday: 20 + Math.floor(rand() * 160),
      alertsToday: Math.floor(rand() * 4),
      lastSeenMin: mode === 'offline' ? 190 : 0,
    };
  });
}

/** Position and state of a fleet vehicle at clock time `nowSec`. */
export function fleetPosition(v, nowSec) {
  if (v.mode === 'stopped' || v.mode === 'offline') {
    const s = v.samples[v.samples.length - 1];
    return { ...s, v: 0, state: v.mode === 'offline' ? 'offline' : 'stopped', heading: 0 };
  }
  const k = v.mode === 'idle' ? v.offset : (Math.floor(nowSec) + v.offset) % v.loopSec;
  const s = v.samples[k];
  const p = v.samples[Math.max(0, k - 3)];
  const heading = Math.atan2(s.y - p.y, s.x - p.x) || 0;
  const state = v.mode === 'idle' || s.v <= 2 ? 'idle' : 'running';
  return { ...s, v: v.mode === 'idle' ? 0 : s.v, state, heading };
}
