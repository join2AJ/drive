import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, LocateFixed } from 'lucide-react';
import { city } from '../data/cityModel.js';
import { driveZone } from '../lib/geofence.js';

// Lightweight vector map rendered in SVG. It draws the road network as a basemap and
// overlays routes, markers, geofences and the live vehicle. Supports drag, pinch and wheel
// zoom. For production, swap the basemap for MapLibre/Google Maps and keep the overlays.

const Basemap = memo(function Basemap({ k, detail }) {
  const { nodes, edges, parks, river, lake } = city;
  const byKind = useMemo(() => {
    const local = [];
    const arterial = [];
    const ring = [];
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const d = `M${a.x.toFixed(0)} ${a.y.toFixed(0)}L${b.x.toFixed(0)} ${b.y.toFixed(0)}`;
      if (e.limit >= 70) ring.push(d);
      else if (e.arterial) arterial.push(d);
      else local.push(d);
    }
    return { local: local.join(''), arterial: arterial.join(''), ring: ring.join('') };
  }, [edges, nodes]);
  const riverD = useMemo(() => 'M' + river.map((p) => `${p[0].toFixed(0)} ${p[1].toFixed(0)}`).join('L'), [river]);

  return (
    <g>
      {parks.map((p, i) => (
        <polygon key={i} points={p.map((q) => q.join(',')).join(' ')} fill="var(--map-park)" />
      ))}
      <ellipse cx={lake.cx} cy={lake.cy} rx={lake.rx} ry={lake.ry} fill="var(--map-water)" />
      <path d={riverD} stroke="var(--map-water)" strokeWidth={Math.max(60, 9 * k)} fill="none" strokeLinecap="round" />
      {detail && <path d={byKind.local} stroke="var(--map-road)" strokeWidth={Math.max(14, 2.2 * k)} strokeLinecap="round" fill="none" />}
      <path d={byKind.arterial} stroke="var(--map-arterial)" strokeWidth={Math.max(26, 4 * k)} strokeLinecap="round" fill="none" />
      <path d={byKind.ring} stroke="var(--map-ring)" strokeWidth={Math.max(34, 5.5 * k)} strokeLinecap="round" fill="none" />
    </g>
  );
});

function fitView(bounds, aspect, pad = 0.18) {
  const w = Math.max(bounds.maxX - bounds.minX, 600);
  const h = Math.max(bounds.maxY - bounds.minY, 600);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  let vw = w * (1 + pad * 2);
  let vh = h * (1 + pad * 2);
  if (vw / vh > aspect) vh = vw / aspect;
  else vw = vh * aspect;
  return { cx, cy, vw };
}

export function boundsOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function pathD(points, step = 1) {
  if (!points.length) return '';
  let d = `M${points[0].x.toFixed(0)} ${points[0].y.toFixed(0)}`;
  for (let i = step; i < points.length; i += step) d += `L${points[i].x.toFixed(0)} ${points[i].y.toFixed(0)}`;
  const last = points[points.length - 1];
  d += `L${last.x.toFixed(0)} ${last.y.toFixed(0)}`;
  return d;
}

/**
 * props:
 *  fit        – bounds to frame ({minX,minY,maxX,maxY}); re-fits when `fitKey` changes
 *  follow     – {x,y} point to keep centered (live mode) unless the user has panned
 *  children   – render prop (k) => overlay SVG; k = metres per CSS pixel
 */
export default function MapView({ fit, fitKey, follow, children, controls = true, detail = true, interactive = true, style, className = '', controlsTop = 12, onMapClick }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 300 });
  const [view, setView] = useState(null);
  const [userMoved, setUserMoved] = useState(false);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width || 360, h: e.contentRect.height || 300 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspect = size.w / size.h;
  useEffect(() => {
    if (fit) setView(fitView(fit, aspect));
    setUserMoved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, aspect]);

  useEffect(() => {
    if (follow && !userMoved) setView((v) => (v ? { ...v, cx: follow.x, cy: follow.y } : v));
  }, [follow?.x, follow?.y, userMoved]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = view ?? (fit ? fitView(fit, aspect) : { cx: 4300, cy: 5900, vw: 9000 });
  const vh = v.vw / aspect;
  const k = v.vw / size.w; // metres per pixel

  const zoom = (factor, px, py) => {
    setUserMoved(true);
    setView((cur) => {
      const c = cur ?? v;
      const nvw = Math.min(16000, Math.max(500, c.vw * factor));
      if (px == null) return { ...c, vw: nvw };
      const mx = c.cx + (px / size.w - 0.5) * c.vw;
      const my = c.cy + (py / size.h - 0.5) * (c.vw / aspect);
      const r = nvw / c.vw;
      return { vw: nvw, cx: mx - (mx - c.cx) * r, cy: my - (my - c.cy) * r };
    });
  };

  const onPointerDown = (e) => {
    if (!interactive) return;
    // Capture only once the finger actually drags, so taps still reach overlay shapes.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    gesture.current = null;
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    if (!prev.captured && Math.hypot(e.clientX - prev.x0, e.clientY - prev.y0) > 4) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
      prev.captured = true;
    }
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        setUserMoved(true);
        setView((cur) => {
          const c = cur ?? v;
          const kk = c.vw / size.w;
          return { ...c, cx: c.cx - dx * kk, cy: c.cy - dy * kk };
        });
      }
    } else if (pts.length === 2) {
      const other = pts.find((p) => p !== prev);
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 0 && d1 > 0) zoom(d0 / d1);
    }
    pointers.current.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    // A tap (no drag) reports map coordinates in metres.
    if (onMapClick && p && !p.captured && e.type === 'pointerup') {
      const r = ref.current.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const scale = Math.max(v.vw / size.w, (v.vw / aspect) / size.h); // preserveAspectRatio "slice"
      onMapClick({ x: v.cx + (px - size.w / 2) * scale, y: v.cy + (py - size.h / 2) * scale });
    }
  };
  const onWheel = (e) => {
    if (!interactive) return;
    const r = ref.current.getBoundingClientRect();
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  };

  return (
    <div ref={ref} className={`map ${className}`} style={style} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
      <svg viewBox={`${v.cx - v.vw / 2} ${v.cy - vh / 2} ${v.vw} ${vh}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map">
        <rect x={-5000} y={-5000} width={20000} height={25000} fill="var(--map-land)" />
        <Basemap k={k} detail={detail} />
        {children?.(k)}
      </svg>
      {controls && interactive && (
        <div className="map-controls" style={{ top: controlsTop }}>
          <button className="icon-btn" aria-label="Zoom in" onClick={() => zoom(1 / 1.5)}><Plus size={18} /></button>
          <button className="icon-btn" aria-label="Zoom out" onClick={() => zoom(1.5)}><Minus size={18} /></button>
          <button className="icon-btn" aria-label="Recenter" onClick={() => { setUserMoved(false); if (fit) setView(fitView(fit, aspect)); if (follow) setView((c) => ({ ...(c ?? v), cx: follow.x, cy: follow.y })); }}>
            <LocateFixed size={18} />
          </button>
        </div>
      )}
      <div className="map-attrib">Simulated basemap · Bengaluru</div>
    </div>
  );
}

// ---------- Overlay primitives (all sizes in px, scaled by k) ----------

export function Route({ points, k, color = 'var(--accent)', width = 5, step = 1, dashed, casing = true, opacity = 1 }) {
  const d = useMemo(() => pathD(points, step), [points, step]);
  return (
    <g opacity={opacity}>
      {casing && <path d={d} stroke="var(--page)" strokeWidth={(width + 3) * k} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={0.7} />}
      <path d={d} stroke={color} strokeWidth={width * k} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dashed ? `${2 * k} ${9 * k}` : undefined} />
    </g>
  );
}

export function Pin({ x, y, k, color = 'var(--accent)', label, icon, size = 26 }) {
  const s = size * k;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={s / 2 + 2 * k} fill="var(--page)" opacity={0.6} />
      <circle r={s / 2} fill={color} stroke="#fff" strokeWidth={2 * k} />
      {icon && <g transform={`translate(${-s * 0.3} ${-s * 0.3}) scale(${(s * 0.6) / 24})`} color="#fff">{icon}</g>}
      {label && (
        <text y={s / 2 + 14 * k} textAnchor="middle" fontSize={11.5 * k} fontWeight={650} fill="var(--ink)" stroke="var(--page)" strokeWidth={3 * k} paintOrder="stroke">
          {label}
        </text>
      )}
    </g>
  );
}

export function Vehicle({ x, y, heading = 0, k, color = 'var(--accent)', pulse = true }) {
  const s = 15 * k;
  return (
    <g transform={`translate(${x} ${y})`}>
      {pulse && <circle className="veh-pulse" r={34 * k} fill={color} />}
      <circle r={s + 3 * k} fill="#fff" />
      <circle r={s} fill={color} />
      <path d={`M0 ${-s * 0.62} L${s * 0.46} ${s * 0.5} L0 ${s * 0.22} L${-s * 0.46} ${s * 0.5} Z`} fill="#fff" transform={`rotate(${(heading * 180) / Math.PI + 90})`} />
    </g>
  );
}

export function Fence({ x, y, r, k, label, active = true, f, color = 'var(--violet)', editing = false, compact = false }) {
  // Accepts either a full fence object (`f`) or the old circle props.
  const fence = f ?? { type: 'circle', x, y, radius: r, name: label };
  const name = label ?? fence.name;
  const common = { fill: color, fillOpacity: 0.1, stroke: color, strokeWidth: 1.5 * k, strokeDasharray: `${6 * k} ${4 * k}` };
  let shape;
  let top = { x: fence.x, y: fence.y };
  if (fence.type === 'polygon') {
    const pts = fence.points ?? [];
    shape = (
      <>
        {pts.length >= 3 && <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} {...common} />}
        {pts.length === 2 && <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={color} strokeWidth={2 * k} />}
        {editing && pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={6 * k} fill={i === 0 ? color : 'var(--surface)'} stroke={color} strokeWidth={2 * k} />)}
      </>
    );
    top = pts.reduce((a, p) => (p.y < a.y ? p : a), pts[0] ?? top);
  } else if (fence.type === 'drive') {
    const z = driveZone(fence, fence.minutes, fence.traffic);
    const d = z.segments.map((sg) => `M${sg.a.x.toFixed(0)} ${sg.a.y.toFixed(0)}L${sg.b.x.toFixed(0)} ${sg.b.y.toFixed(0)}`).join('');
    shape = (
      <>
        {z.hull.length >= 3 && <polygon points={z.hull.map((p) => `${p.x},${p.y}`).join(' ')} fill={color} fillOpacity={0.05} stroke={color} strokeOpacity={0.35} strokeWidth={1 * k} strokeDasharray={`${3 * k} ${5 * k}`} />}
        {!compact && <path d={d} stroke={color} strokeOpacity={0.6} strokeWidth={Math.max(45, 4.5 * k)} strokeLinecap="round" fill="none" />}
        <circle cx={fence.x} cy={fence.y} r={6 * k} fill={color} stroke="var(--surface)" strokeWidth={2 * k} />
      </>
    );
    top = z.hull.reduce((a, p) => (p.y < a.y ? p : a), z.hull[0] ?? top);
  } else {
    shape = (
      <>
        <circle cx={fence.x} cy={fence.y} r={fence.radius} {...common} />
        {editing && <circle cx={fence.x} cy={fence.y} r={6 * k} fill={color} stroke="var(--surface)" strokeWidth={2 * k} />}
      </>
    );
    top = { x: fence.x, y: fence.y - fence.radius };
  }
  return (
    <g opacity={active ? 1 : 0.4}>
      {shape}
      {name && top && (
        <text x={top.x} y={top.y - 8 * k} textAnchor="middle" fontSize={10.5 * k} fontWeight={650} fill={color} stroke="var(--page)" strokeWidth={3 * k} paintOrder="stroke">
          {name}
        </text>
      )}
    </g>
  );
}
