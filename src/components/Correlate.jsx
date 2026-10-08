import React, { useMemo, useState } from 'react';
import BarChart from './BarChart';
import { pct, pctAdaptive } from '../lib/analysis';

/**
 * Correlation view: put any census metric on the x axis and any election metric
 * on the y axis, then show the seats as a scatter with a fitted trend.
 *
 * This is the payoff of joining census data to results: it turns "which party
 * won where" into questions like whether turnout tracks deprivation.
 *
 * Implemented with plain SVG. Pearson correlation and the least-squares line are
 * both short enough to compute directly, and it avoids a charting dependency.
 */

/** Pearson product-moment correlation coefficient. */
function pearson(points) {
  const n = points.length;
  if (n < 3) return null;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let sxy = 0; let sxx = 0; let syy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Least-squares fit, returned as y at xMin and xMax for drawing a line. */
function fit(points) {
  const n = points.length;
  if (n < 2) return null;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0; let sxx = 0;
  for (const p of points) {
    sxy += (p.x - meanX) * (p.y - meanY);
    sxx += (p.x - meanX) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  return { slope, intercept, at: (x) => slope * x + intercept };
}

/** Rank of a value within an array, as a 0..1 fraction. */
function rank(sorted, value) {
  if (!sorted.length) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

const W = 340;
const H = 260;
const PAD = { top: 12, right: 12, bottom: 34, left: 44 };

export default function Correlate({ seats, summary, onSelect, selected }) {
  const metrics = summary?.census?.metrics ?? [];

  const [xKey, setXKey] = useState(metrics[0]?.seatKey ?? 'deprived');
  const [yKey, setYKey] = useState('winnerShare');

  const Y_AXES = [
    { key: 'winnerShare', label: 'Winner’s share', format: (v) => pct(v, 0), domain: [0, 1] },
    { key: 'turnout', label: 'Turnout', format: (v) => pct(v, 0), domain: [0, 1] },
    { key: 'majorityShare', label: 'Margin', format: (v) => pctAdaptive(v), domain: [0, 0.5] },
  ];
  const yAxis = Y_AXES.find((a) => a.key === yKey) ?? Y_AXES[0];
  const xMetric = metrics.find((m) => m.seatKey === xKey);

  const points = useMemo(() => {
    if (!seats || !xMetric) return [];
    const out = [];
    for (const s of seats) {
      const x = s.census?.[xMetric.seatKey];
      const y = s[yAxis.key];
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, seat: s });
    }
    return out;
  }, [seats, xMetric, yAxis.key]);

  const r = useMemo(() => pearson(points), [points]);
  const line = useMemo(() => fit(points), [points]);
  const xSorted = useMemo(() => points.map((p) => p.x).sort((a, b) => a - b), [points]);

  if (!metrics.length) {
    return <p className="hint">No census data is available for this dataset.</p>;
  }

  const [xLo, xHi] = xMetric.observed;
  const yLo = yAxis.domain[0];
  const yHi = yAxis.domain[1];

  const sx = (v) => PAD.left + ((v - xLo) / (xHi - xLo || 1)) * (W - PAD.left - PAD.right);
  const sy = (v) => H - PAD.bottom - ((v - yLo) / (yHi - yLo || 1)) * (H - PAD.top - PAD.bottom);

  // Group by winning party so the scatter can be coloured consistently.
  const byParty = new Map();
  for (const p of points) {
    const g = p.seat.partyGroup;
    if (!byParty.has(g)) byParty.set(g, []);
    byParty.get(g).push(p);
  }

  const trend = line
    ? [
      { x: line.at(xLo), y: line.at(xLo) },
      { x: line.at(xHi), y: line.at(xHi) },
    ]
    : null;

  const strength = r === null ? '—' : Math.abs(r) >= 0.6 ? 'strong'
    : Math.abs(r) >= 0.35 ? 'moderate' : Math.abs(r) >= 0.15 ? 'weak' : 'very weak';

  return (
    <div className="correlate">
      <div className="axis-pickers">
        <label>
          <span>Census</span>
          <select value={xKey} onChange={(e) => setXKey(e.target.value)}>
            {metrics.map((m) => (
              <option key={m.seatKey} value={m.seatKey}>{m.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Election</span>
          <select value={yKey} onChange={(e) => setYKey(e.target.value)}>
            {Y_AXES.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="note">{xMetric.hint}. England and Wales only.</p>

      <svg
        className="scatter"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Scatter of ${xMetric.label} against ${yAxis.label}, correlation ${r?.toFixed(2) ?? 'unknown'}`}
      >
        {/* Axes */}
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} className="axis" />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} className="axis" />

        {/* Tick labels */}
        {[0, 0.5, 1].map((f) => {
          const value = yLo + f * (yHi - yLo);
          return (
            <text key={f} x={PAD.left - 6} y={sy(value) + 3} className="tick" textAnchor="end">
              {yAxis.format(value)}
            </text>
          );
        })}
        {[0, 0.5, 1].map((f) => {
          const value = xLo + f * (xHi - xLo);
          return (
            <text key={f} x={sx(value)} y={H - PAD.bottom + 14} className="tick" textAnchor="middle">
              {pct(value, 0)}
            </text>
          );
        })}
        <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} className="axis-label" textAnchor="middle">
          {xMetric.label}
        </text>
        <text
          x={-(PAD.top + (H - PAD.top - PAD.bottom) / 2)}
          y={12}
          className="axis-label"
          textAnchor="middle"
          transform="rotate(-90)"
        >
          {yAxis.label}
        </text>

        {/* Trend line */}
        {trend && (
          <line
            x1={sx(trend[0].x)} y1={sy(trend[0].y)}
            x2={sx(trend[1].x)} y2={sy(trend[1].y)}
            className="trend"
          />
        )}

        {/* Points, coloured by winning party */}
        {[...byParty.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .map(([party, list]) => (
            <g key={party}>
              {list.map((p) => {
                const isSel = selected?.id === p.seat.id;
                return (
                  <circle
                    key={p.seat.id}
                    cx={sx(p.x)}
                    cy={sy(p.y)}
                    r={isSel ? 4.5 : 2.6}
                    fill={p.seat.colour}
                    className="dot"
                    opacity={isSel ? 1 : 0.62}
                    onClick={() => onSelect(isSel ? null : p.seat)}
                  >
                    <title>
                      {`${p.seat.name}: ${pct(p.x, 1)} ${xMetric.short}, ${yAxis.format(p.y)}`}
                    </title>
                  </circle>
                );
              })}
            </g>
          ))}
      </svg>

      <p className="correlation">
        <strong>r = {r === null ? '—' : r.toFixed(2)}</strong>
        <span>{strength} {r === null ? '' : r < 0 ? 'negative' : 'positive'} relationship</span>
        <span className="muted">{points.length} seats</span>
      </p>

      <p className="note">
        {r === null ? 'Not enough overlapping seats to measure a relationship.'
          : Math.abs(r) < 0.15
            ? 'Essentially no linear relationship: this census measure did not move the vote much.'
            : `${xMetric.label} and ${yAxis.label} ${r < 0 ? 'move in opposite directions' : 'move together'} across the 573 English and Welsh seats. Correlation is not causation, and boundaries were redrawn for 2024.`}
      </p>

      <h3 className="sub">Seats at each end of the census range</h3>
      <div className="extremes">
        <div>
          <h4>Most {xMetric.short}</h4>
          <ul>
            {[...points].sort((a, b) => b.x - a.x).slice(0, 5).map((p) => (
              <li key={p.seat.id}>
                <button type="button" onClick={() => onSelect(p.seat)}>
                  <span className="dot" style={{ background: p.seat.colour }} aria-hidden="true" />
                  {p.seat.name}
                  <span className="muted">{pct(p.x, 1)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Least {xMetric.short}</h4>
          <ul>
            {[...points].sort((a, b) => a.x - b.x).slice(0, 5).map((p) => (
              <li key={p.seat.id}>
                <button type="button" onClick={() => onSelect(p.seat)}>
                  <span className="dot" style={{ background: p.seat.colour }} aria-hidden="true" />
                  {p.seat.name}
                  <span className="muted">{pct(p.x, 1)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h3 className="sub">Median {xMetric.short} by winner</h3>
      <BarChart
        rows={[...byParty.entries()]
          .map(([party, list]) => ({
            key: party,
            label: party,
            value: rank(xSorted, list.map((p) => p.x).sort((a, b) => a - b)[Math.floor(list.length / 2)]),
            colour: list[0].seat.colour,
          }))
          .sort((a, b) => b.value - a.value)}
        ariaLabel={`Median ${xMetric.label} by winning party, as a percentile`}
        formatValue={(v) => `${Math.round(v * 100)}th pct`}
      />
    </div>
  );
}
