// Small deterministic PRNG so the simulated fleet data is identical on every launch.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rand, min, max) => min + rand() * (max - min);
export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
