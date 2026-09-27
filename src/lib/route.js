// Route-deviation helpers: how far a point is from a planned route, and where along it.

function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return { d: Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y), t };
}

/** Simplify a sample stream to roughly every `step` metres (keeps checks fast). */
export function simplifyRoute(samples, step = 40) {
  const out = [samples[0]];
  for (const s of samples) {
    const l = out[out.length - 1];
    if (Math.hypot(s.x - l.x, s.y - l.y) >= step) out.push(s);
  }
  const last = samples[samples.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out.map((s) => ({ x: s.x, y: s.y }));
}

/** Distance (m) from a point to the route, and progress along it (0..1). */
export function offRoute(pt, route) {
  let best = Infinity;
  let bestI = 0;
  let bestT = 0;
  for (let i = 1; i < route.length; i++) {
    const { d, t } = segDist(pt, route[i - 1], route[i]);
    if (d < best) { best = d; bestI = i; bestT = t; }
  }
  return { dist: best, progress: route.length > 1 ? (bestI - 1 + bestT) / (route.length - 1) : 0 };
}

/**
 * Scans a stream for deviations: stretches further than `corridorM` from the route for at
 * least `graceSec`. Returns [{ from, to, maxOff, x, y, back }].
 */
export function findDeviations(samples, route, { corridorM = 200, graceSec = 20 } = {}) {
  const out = [];
  let run = null;
  for (let i = 0; i <= samples.length; i++) {
    const s = samples[i];
    const d = s ? offRoute(s, route).dist : 0;
    if (s && d > corridorM) {
      if (!run) run = { i, from: s.t, maxOff: d, x: s.x, y: s.y };
      if (d > run.maxOff) { run.maxOff = d; run.x = s.x; run.y = s.y; }
      run.to = s.t;
    } else if (run) {
      if ((run.to - run.from) / 1000 >= graceSec) out.push({ ...run, back: !!s });
      run = null;
    }
  }
  return out;
}
