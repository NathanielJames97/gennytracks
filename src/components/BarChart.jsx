import React from 'react';

/**
 * Horizontal bar chart drawn with plain SVG and CSS, no charting dependency.
 *
 * Every row is a labelled bar. `value` is the numeric magnitude; `display` is
 * the already-formatted text so the axis labels stay under the app's control.
 */
export default function BarChart({
  rows,
  max,
  formatValue = (v) => v,
  onSelect,
  selected,
  ariaLabel,
}) {
  if (!rows?.length) return null;
  const ceiling = max ?? Math.max(...rows.map((r) => r.value || 0), 1);

  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      {rows.map((row) => {
        const w = ceiling > 0 ? Math.max((row.value / ceiling) * 100, row.value > 0 ? 1.5 : 0) : 0;
        const isSelected = selected === row.key;
        return (
          <button
            type="button"
            key={row.key}
            className={`chart-row${isSelected ? ' on' : ''}`}
            onClick={onSelect ? () => onSelect(isSelected ? null : row.key) : undefined}
            aria-pressed={onSelect ? isSelected : undefined}
            disabled={!onSelect}
            title={`${row.label}: ${formatValue(row.value)}`}
          >
            <span className="chart-label">
              {row.colour && (
                <span className="chart-dot" style={{ background: row.colour }} aria-hidden="true" />
              )}
              {row.label}
            </span>
            <span className="chart-track">
              <span
                className="chart-bar"
                style={{ width: `${w}%`, background: row.colour || 'var(--accent)' }}
              />
            </span>
            <span className="chart-value">{formatValue(row.value)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Simple vertical histogram, used for the majority distribution.
 */
export function Histogram({ bands, ariaLabel }) {
  if (!bands?.length) return null;
  const max = Math.max(...bands.map((b) => b.seats), 1);

  return (
    <div className="histogram" role="img" aria-label={ariaLabel}>
      {bands.map((b) => (
        <div className="hist-col" key={b.label}>
          <div className="hist-bar" style={{ height: `${(b.seats / max) * 100}%` }} />
          <span className="hist-count">{b.seats}</span>
          <span className="hist-label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
