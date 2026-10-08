import React, { useMemo, useState } from 'react';
import BarChart from './BarChart';
import { pct, pctAdaptive } from '../lib/analysis';

/**
 * Census detail for one seat, shown inside the seat panel area.
 *
 * Census 2021 covers England and Wales only, so Scottish and Northern Irish
 * seats get an explicit explanation rather than a blank space.
 */
export default function CensusPanel({ seat }) {
  if (!seat) return null;
  if (!seat.census) {
    return (
      <section className="census-panel">
        <h3 className="sub">Census 2021</h3>
        <p className="note">
          No census data for this seat. The decennial census covers England and
          Wales only, so the {seat.country === 'Scotland' ? '57 Scottish'
            : '18 Northern Irish'} seats have none.
        </p>
      </section>
    );
  }

  const c = seat.census;

  const rows = [
    { label: 'Deprived households', value: c.deprived, format: (v) => pct(v, 1) },
    { label: 'Degree or above', value: c.degree, format: (v) => pct(v, 1) },
    { label: 'No qualifications', value: c.noQualifications, format: (v) => pct(v, 1) },
    { label: 'Ethnic minority', value: c.minority, format: (v) => pct(v, 1) },
    { label: 'White British', value: c.whiteBritish, format: (v) => pct(v, 1) },
    { label: 'No religion', value: c.noReligion, format: (v) => pct(v, 1) },
    { label: 'Christian', value: c.christian, format: (v) => pct(v, 1) },
    { label: 'Muslim', value: c.muslim, format: (v) => pct(v, 1) },
    { label: 'Hindu', value: c.hindu, format: (v) => pct(v, 1) },
  ].filter((r) => Number.isFinite(r.value));

  return (
    <section className="census-panel">
      <h3 className="sub">Who lives here</h3>
      <dl className="census-stats">
        <div>
          <dt>Residents (Census 2021)</dt>
          <dd>{c.population.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Electorate (2024)</dt>
          <dd>{seat.electorate.toLocaleString()}</dd>
        </div>
      </dl>

      <table className="census-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className="num">{r.format(r.value)}</td>
              <td className="bar-cell">
                <span
                  className="mini-bar"
                  style={{ width: `${Math.min(100, r.value * 100)}%` }}
                  aria-hidden="true"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {Number.isFinite(c.deprivationIndex) && (
        <p className="note">
          Deprivation index {c.deprivationIndex.toFixed(2)} of a possible 4
          (ONS TS011).
        </p>
      )}
      <p className="note muted">
        Census 2021, aggregated from MSOA areas via the ONS best-fit lookup.
      </p>
    </section>
  );
}

/**
 * National census overview: every metric's distribution, and the party whose
 * winning seats sit furthest above or below the national median.
 */
export function CensusOverview({ summary, seats, onSelectSeat }) {
  const [active, setActive] = useState(null);
  const metrics = useMemo(() => summary?.census?.metrics ?? [], [summary]);

  const rows = useMemo(() => metrics.map((m) => {
    const vals = seats
      .map((s) => s.census?.[m.seatKey])
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const band = (lo, hi) => vals.filter((v) => v >= lo && v < hi).length;
    return {
      key: m.seatKey,
      m,
      n: vals.length,
      median: vals[Math.floor(vals.length / 2)],
      bands: [
        { label: m.ticks[0], n: band(0, (m.ticks[1] && m.domain[0] + (m.domain[1] - m.domain[0]) / 3) ?? m.domain[1] / 3) },
        { label: m.ticks[1], n: band(m.domain[0] + (m.domain[1] - m.domain[0]) / 3, m.domain[0] + 2 * (m.domain[1] - m.domain[0]) / 3) },
        { label: m.ticks[2], n: band(m.domain[0] + 2 * (m.domain[1] - m.domain[0]) / 3, m.domain[1] + 1) },
      ].map((b, i) => ({ ...b, key: `${m.seatKey}-${i}` })),
    };
  }), [metrics, seats]);

  if (!metrics.length) return null;

  return (
    <div className="census-overview">
      <p className="note">
        {summary.census.note} Census 2021, {summary.census.seats.toLocaleString()} seats.
      </p>

      {rows.map((r) => (
        <div key={r.key}>
          <h3 className="sub">
            {r.m.label}
            <span className="muted"> · median {pct(r.median, 1)}</span>
          </h3>
          <p className="note">{r.m.hint}</p>
          <BarChart
            rows={r.bands.map((b) => ({ ...b, value: b.n, colour: '#5cc8d7' }))}
            ariaLabel={`Distribution of ${r.m.label}`}
            formatValue={(v) => `${v} seats`}
            onSelect={bandLabel => setActive(bandLabel === r.m.label ? null : r.m.label)}
            selected={active === r.m.label ? r.m.label : null}
          />
        </div>
      ))}

      <p className="note muted">
        Correlation between these measures and the 2024 result is on the
        Correlate tab.
      </p>
    </div>
  );
}

export { pctAdaptive };
