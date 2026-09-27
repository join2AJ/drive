// Evidence helpers for incidents: tamper-evident fingerprints and compact GPS snapshots.

export async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Non-secure contexts have no SubtleCrypto; fall back to FNV-1a (integrity hint only).
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
    return `fnv1a-${h.toString(16)}`;
  }
}

/** Every-2-second snapshot of the GPS stream within [from, to], rounded for storage. */
export function snapshotGps(samples, from, to, step = 2) {
  const out = [];
  let last = -Infinity;
  for (const s of samples) {
    if (s.t < from || s.t > to) continue;
    if (s.t - last < step * 1000 - 1) continue;
    last = s.t;
    out.push({ t: s.t, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, v: Math.round(s.v * 10) / 10, limit: s.limit });
  }
  return out;
}

/** Downscale a photo to a small JPEG data URL so it can be stored on-device. */
export function compressImage(file, max = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const INCIDENT_TYPES = [
  { key: 'collision', label: 'Collision', hint: 'Hit another vehicle or object' },
  { key: 'hit_run', label: 'Hit & run', hint: 'Other party left the scene' },
  { key: 'theft', label: 'Theft / break-in', hint: 'Vehicle or contents stolen' },
  { key: 'vandalism', label: 'Vandalism', hint: 'Scratches, broken glass' },
  { key: 'road_damage', label: 'Pothole / road', hint: 'Damage from road condition' },
  { key: 'road_rage', label: 'Road rage', hint: 'Threat or harassment' },
  { key: 'parking', label: 'Parking damage', hint: 'Damaged while parked' },
  { key: 'other', label: 'Other', hint: 'Anything else to record' },
];

export const DAMAGE_ZONES = [
  ['front', 'Front bumper'], ['bonnet', 'Bonnet'], ['windshield', 'Windshield'], ['roof', 'Roof'],
  ['fl', 'Front-left'], ['fr', 'Front-right'], ['rl', 'Rear-left'], ['rr', 'Rear-right'],
  ['rearglass', 'Rear glass'], ['boot', 'Boot'], ['rear', 'Rear bumper'],
];

export const STATEMENT_PROMPTS = [
  'Just before it happened I was…',
  'The other vehicle came from…',
  'Traffic signal / right of way:',
  'Road and weather conditions:',
  'After the incident I…',
];
