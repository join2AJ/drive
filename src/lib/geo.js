// Local planar coordinates (metres, x east / y south) anchored to a real-world origin.
// The simulator works in metres; the UI shows latitude/longitude derived from them.
export const ORIGIN = { lat: 12.9975, lng: 77.5712 }; // Bengaluru

const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function toLatLng(x, y) {
  return { lat: ORIGIN.lat - y / M_PER_DEG_LAT, lng: ORIGIN.lng + x / M_PER_DEG_LNG };
}

export function fromLatLng(lat, lng) {
  return { x: (lng - ORIGIN.lng) * M_PER_DEG_LNG, y: (ORIGIN.lat - lat) * M_PER_DEG_LAT };
}

export function haversine(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function formatLatLng(x, y) {
  const { lat, lng } = toLatLng(x, y);
  return `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;
}
