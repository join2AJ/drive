import { useLayoutEffect, useMemo, useRef, useState } from 'react';

// Hand-rolled SVG charts: thin marks, recessive axes, one series colour, hover tooltips.

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const niceMax = (v) => {
  const steps = [10, 20, 25, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500, 1000];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 100) * 100;
};

/**
 * Speed over time with the overspeed threshold, event markers and a crosshair.
 * `onHover(index|null)` lets the parent sync a marker on the map.
 */
export function SpeedChart({ samples, events = [], threshold, height = 170, onHover, highlight, formatX }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 30, r: 8, t: 12, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const t0 = samples[0]?.t ?? 0;
  const t1 = samples[samples.length - 1]?.t ?? 1;
  const maxV = niceMax(Math.max(threshold ?? 0, ...samples.map((s) => s.v)) * 1.05);
  const X = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * iw;
  const Y = (v) => pad.t + ih - (v / maxV) * ih;

  const { line, area, overD } = useMemo(() => {
    const step = Math.max(1, Math.floor(samples.length / (iw * 1.5)));
    let line = '';
    let over = '';
    for (let i = 0; i < samples.length; i += step) {
      const s = samples[i];
      const p = `${X(s.t).toFixed(1)} ${Y(s.v).toFixed(1)}`;
      line += (i ? 'L' : 'M') + p;
      if (threshold && s.v > threshold) {
        const prev = samples[Math.max(0, i - step)];
        over += (prev.v > threshold && i ? 'L' : 'M') + p;
      }
    }
    const area = `${line}L${X(t1).toFixed(1)} ${Y(0)}L${X(t0).toFixed(1)} ${Y(0)}Z`;
    return { line, area, overD: over };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, w, maxV, threshold]);

  const ticks = [0, maxV / 2, maxV];
  const xTicks = 4;

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const t = t0 + ((px - pad.l) / iw) * (t1 - t0);
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (samples[m].t < t) lo = m;
      else hi = m;
    }
    const i = Math.abs(samples[lo].t - t) < Math.abs(samples[hi].t - t) ? lo : hi;
    setHover(i);
    onHover?.(i);
  };
  const clear = () => { setHover(null); onHover?.(null); };
  const hs = hover != null ? samples[hover] : highlight != null ? samples[highlight] : null;

  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={clear} style={{ touchAction: 'pan-y' }} role="img" aria-label="Speed over time">
        <defs>
          <linearGradient id="spd-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={pad.l - 6} y={Y(v) + 3.5} textAnchor="end">{Math.round(v)}</text>
          </g>
        ))}
        {Array.from({ length: xTicks }, (_, k) => {
          const t = t0 + ((t1 - t0) * (k + 0.5)) / xTicks;
          return <text key={k} x={X(t)} y={height - 6} textAnchor="middle">{formatX ? formatX(t) : ''}</text>;
        })}
        <path d={area} fill="url(#spd-fill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {overD && <path d={overD} fill="none" stroke="var(--critical)" strokeWidth={2.4} strokeLinejoin="round" />}
        {threshold && (
          <g>
            <line x1={pad.l} x2={w - pad.r} y1={Y(threshold)} y2={Y(threshold)} stroke="var(--critical)" strokeDasharray="3 4" strokeWidth={1} opacity={0.8} />
            <text x={w - pad.r} y={Y(threshold) - 4} textAnchor="end" style={{ fill: 'var(--critical-ink)' }}>{threshold} km/h limit</text>
          </g>
        )}
        {events.map((e, k) => {
          const s = samples[Math.min(e.i, samples.length - 1)];
          if (!s) return null;
          const col = e.type === 'crash' ? 'var(--critical)' : e.type === 'overspeed' ? 'var(--serious)' : 'var(--warning)';
          return <circle key={k} cx={X(s.t)} cy={Y(s.v)} r={5} fill={col} stroke="var(--surface)" strokeWidth={2} />;
        })}
        {hs && (
          <g pointerEvents="none">
            <line x1={X(hs.t)} x2={X(hs.t)} y1={pad.t} y2={pad.t + ih} stroke="var(--ink-3)" strokeWidth={1} />
            <circle cx={X(hs.t)} cy={Y(hs.v)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: Math.min(w - 60, Math.max(60, X(hs.t))), top: Y(hs.v) }}>
          <b className="num">{Math.round(hs.v)} km/h</b>
          <div className="muted">{formatX ? formatX(hs.t) : ''} · limit {hs.limit}</div>
        </div>
      )}
    </div>
  );
}

/** Vertical bars with per-bar hover. `data: [{label, value, sub}]` */
export function BarChart({ data, height = 150, format = (v) => v, highlightLast = true, color = 'var(--accent)' }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 30, r: 4, t: 10, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const bw = iw / data.length;
  const barW = Math.max(3, Math.min(26, bw - 2));
  const Y = (v) => pad.t + ih - (v / max) * ih;
  const every = Math.ceil(data.length / 7);
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={height} role="img" aria-label="Bar chart">
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} />
            <text x={pad.l - 6} y={Y(v) + 3.5} textAnchor="end">{format(v, true)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * bw + (bw - barW) / 2;
          const h = Math.max(0, Y(0) - Y(d.value));
          const r = Math.min(4, barW / 2, h);
          const isLast = highlightLast && i === data.length - 1;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onPointerDown={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x} ${Y(0)}V${Y(d.value) + r}Q${x} ${Y(d.value)} ${x + r} ${Y(d.value)}H${x + barW - r}Q${x + barW} ${Y(d.value)} ${x + barW} ${Y(d.value) + r}V${Y(0)}Z`}
                  fill={color}
                  opacity={hover == null ? (isLast || !highlightLast ? 1 : 0.55) : hover === i ? 1 : 0.35}
                />
              )}
              {i % every === (data.length - 1) % every && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: Math.min(w - 50, Math.max(50, pad.l + hover * bw + bw / 2)), top: Y(data[hover].value) }}>
          <b className="num">{format(data[hover].value)}</b>
          <div className="muted">{data[hover].sub ?? data[hover].label}</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal histogram of time spent per speed band. Bands at/over the limit are status-coloured. */
export function SpeedHistogram({ bins, limit }) {
  const [hover, setHover] = useState(null);
  const total = bins.reduce((a, b) => a + b.sec, 0) || 1;
  const max = Math.max(...bins.map((b) => b.sec)) || 1;
  return (
    <div className="stack" style={{ gap: 5 }}>
      {bins.map((b, i) => {
        const over = b.from >= limit;
        const pct = (b.sec / total) * 100;
        return (
          <div key={i} className="row" style={{ gap: 8, fontSize: 12 }} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className="num muted" style={{ width: 52, textAlign: 'right' }}>{b.to ? `${b.from}–${b.to}` : `${b.from}+`}</span>
            <div className="grow" style={{ height: 14, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: hover === i ? 'var(--surface-2)' : 'transparent' }} />
              <div style={{ width: `${Math.max(0.8, (b.sec / max) * 100)}%`, height: '100%', borderRadius: '0 4px 4px 0', background: over ? 'var(--critical)' : 'var(--accent)', opacity: hover == null || hover === i ? 1 : 0.5, position: 'relative' }} />
            </div>
            <span className="num" style={{ width: 44, color: 'var(--ink-2)' }}>{pct < 1 ? pct.toFixed(1) : Math.round(pct)}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** 7 × 24 sequential heatmap of driving minutes. */
export function Heatmap({ matrix }) {
  const [hover, setHover] = useState(null);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const max = Math.max(...matrix.flat()) || 1;
  const ramp = ['var(--surface-2)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'];
  const color = (v) => (v <= 0.5 ? ramp[0] : ramp[Math.min(5, 1 + Math.floor((v / max) * 4.999))]);
  return (
    <div className="chart">
      <div style={{ display: 'grid', gridTemplateColumns: '30px repeat(24, minmax(0, 1fr))', gap: 2 }}>
        {order.map((d) => (
          <div key={d} style={{ display: 'contents' }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', alignSelf: 'center' }}>{names[d]}</div>
            {matrix[d].map((v, h) => (
              <div
                key={h}
                onPointerEnter={() => setHover({ d, h, v })}
                onPointerDown={() => setHover({ d, h, v })}
                onPointerLeave={() => setHover(null)}
                style={{ aspectRatio: '1', borderRadius: 3, background: color(v), outline: hover && hover.d === d && hover.h === h ? '2px solid var(--ink)' : 'none' }}
              />
            ))}
          </div>
        ))}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} style={{ fontSize: 9.5, color: 'var(--ink-3)', textAlign: 'center' }}>{h % 6 === 0 ? h : ''}</div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}>
        <span className="ink2">{hover ? `${names[hover.d]} ${hover.h}:00–${hover.h + 1}:00 · ${Math.round(hover.v)} min total` : 'Tap a cell for details'}</span>
        <span className="row" style={{ gap: 3 }}>
          <span className="muted" style={{ marginRight: 4 }}>Less</span>
          {ramp.slice(1).map((c) => <i key={c} style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />)}
          <span className="muted" style={{ marginLeft: 4 }}>More</span>
        </span>
      </div>
    </div>
  );
}

export function ScoreRing({ value, size = 38, stroke = 4, label = true }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 85 ? 'var(--good)' : value >= 65 ? 'var(--warning)' : 'var(--critical)';
  return (
    <div className="score" style={{ width: size, height: size, fontSize: size > 60 ? size * 0.3 : undefined }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      {label && <span className="num">{value}</span>}
    </div>
  );
}

/** Semi-circular live speedometer. */
export function SpeedGauge({ speed, limit, max = 140, size = 150 }) {
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const start = Math.PI * 0.8;
  const sweep = Math.PI * 1.4;
  const arc = (from, to) => {
    const a0 = start + sweep * from;
    const a1 = start + sweep * to;
    return `M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
  };
  const f = Math.min(1, speed / max);
  const over = limit && speed > limit;
  const la = start + sweep * Math.min(1, limit / max);
  return (
    <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`} aria-label={`Speed ${Math.round(speed)} km/h`}>
      <path d={arc(0, 1)} stroke="var(--surface-3)" strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={arc(0, Math.max(0.001, f))} stroke={over ? 'var(--critical)' : 'var(--accent)'} strokeWidth={10} fill="none" strokeLinecap="round" style={{ transition: 'all .9s linear' }} />
      {limit && <line x1={cx + (r - 9) * Math.cos(la)} y1={cy + (r - 9) * Math.sin(la)} x2={cx + (r + 9) * Math.cos(la)} y2={cy + (r + 9) * Math.sin(la)} stroke="var(--critical)" strokeWidth={2.5} strokeLinecap="round" />}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.3} fontWeight={750} fill="var(--ink)" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{Math.round(speed)}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ink-3)">km/h</text>
    </svg>
  );
}
