import React, { useMemo, useState } from 'react';
import BarChart from './BarChart';
import { pct, pctAdaptive } from '../lib/analysis';

const CENSUS_SOURCE_LINKS = {
  'ons-census-2021': [
    { label: 'ONS / Nomis Census 2021 tables', href: 'https://www.nomisweb.co.uk/census/2021/bulk' },
    { label: 'ONS July 2024 constituency lookup', href: 'https://www.data.gov.uk/dataset/f004674d-d0db-467b-9bd7-009b9d1e2fc6/msoa-2021-to-westminster-parliamentary-constituency-july-2024-best-fit-lookup-in-ew' },
  ],
  'nrs-census-2022': [
    { label: 'NRS Census 2022 output-area tables', href: 'https://www.scotlandscensus.gov.uk/documents/2022-output-area-data/' },
    { label: 'NRS OA22 to UKPC24 lookup', href: 'https://nrscotland.gov.uk/publications/2022-census-geography-products/' },
  ],
  'nisra-census-2021': [
    { label: 'NISRA 2021 PCON24 table', href: 'https://build.nisra.gov.uk/en/custom/data?d=PEOPLE&v=PARLCON24&v=AGE_BAND_AGG11' },
    { label: 'NISRA Crown copyright and licence', href: 'https://www.nisra.gov.uk/crown-copyright' },
  ],
};

/**
 * Census detail for one seat, shown inside the seat panel area.
 *
 * Available census measures use official 2021 England and Wales tables.
 * Scottish (2022) and Northern Irish (2021) inputs are not yet included.
 */
export default function CensusPanel({ seat }) {
  if (!seat) return null;
  if (!seat.census) {
    return (
      <section className="census-panel">
        <h3 className="sub">Census context</h3>
        <p className="note">
          No census measures are available for this seat yet. {seat.country === 'Scotland'
            ? 'Scotland’s census was in 2022; its published tables and allocation to 2024 constituencies have not been added.'
            : 'Northern Ireland’s Census 2021 tables and allocation to 2024 constituencies have not been added.'}
        </p>
      </section>
    );
  }

  const c = seat.census;

  const rows = [
    { label: 'Residents aged 65 and over', value: c.age65Plus, format: (v) => pct(v, 1) },
    { label: 'Owner occupation or shared ownership', value: c.ownerOccupiedShare, format: (v) => pct(v, 1) },
    { label: 'Deprived households', value: c.deprived, format: (v) => pct(v, 1) },
    { label: 'Level 4 qualifications or above (England and Wales, age 16+)', value: c.degree, format: (v) => pct(v, 1) },
    { label: 'Level 4 qualifications or above (Northern Ireland, age 16+)', value: c.niLevel4PlusShare, format: (v) => pct(v, 1) },
    { label: 'Degree-level qualifications or above (Scotland, age 16+)', value: c.scotlandDegreeShare, format: (v) => pct(v, 1) },
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
      <h3 className="sub">Who lives here · Census {c.censusYear}</h3>
      <dl className="census-stats">
        <div>
          <dt>Residents (Census {c.censusYear})</dt>
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
        {c.censusSource}. {c.censusMethod}. Age is the share of all
        residents aged 65+; housing divides owner-occupied households in
        Scotland and Northern Ireland, and owned or shared-ownership households
        in England and Wales, by occupied households. Education category labels and thresholds
        differ by country, as noted above. Sources:{' '}
        {(CENSUS_SOURCE_LINKS[c.censusSourceId] ?? []).map((source, index) => (
          <React.Fragment key={source.href}>
            {index > 0 ? '; ' : ''}
            <a href={source.href} target="_blank" rel="noreferrer">{source.label}</a>
          </React.Fragment>
        ))}
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
        {summary.census.note} {summary.census.seats.toLocaleString()} seats currently have data.
      </p>

      {rows.map((r) => (
        <div key={r.key}>
          <h3 className="sub">
            {r.m.label}
            <span className="muted"> · median {r.m.unit === 'people'
              ? Math.round(r.median).toLocaleString()
              : pct(r.median, 1)}</span>
          </h3>
          <p className="note">
            {r.m.hint} {r.m.definition} Coverage: {Object.values(r.m.coverageByCountry ?? {}).reduce((sum, n) => sum + n, 0)} seats ({Object.entries(r.m.coverageByCountry ?? {})
              .filter(([, n]) => n > 0)
              .map(([country, n]) => `${country} ${n}`)
              .join(', ')}).
            {r.m.sourceUrl && <> Source: <a href={r.m.sourceUrl} target="_blank" rel="noreferrer">{r.m.source}</a>.</>}
          </p>
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
