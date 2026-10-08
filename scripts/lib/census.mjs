// Census 2021 demographics for Westminster parliamentary constituencies.
//
// Source: ONS Census 2021 topic summaries, via the Nomis bulk download service
// (https://www.nomisweb.co.uk/sources/census_2021_bulk). England and Wales only
// -- the census does not cover Scotland or Northern Ireland, so 573 of the 650
// seats get demographics and 77 do not.
//
// The tables publish at MSOA level (7,264 areas of 2,000-15,000 people), not at
// constituency level, so each is aggregated up through the ONS best-fit lookup
// `data/source/census/msoa-to-pcon.csv`. Best-fit assigns a whole MSOA to one
// constituency by population centroid, which is exact enough at these sizes and
// is ONS's own recommended method.
//
// Open Government Licence v3.0.

import { readFileSync } from 'node:fs';
import { csvToObjects, toNumber } from './csv.mjs';

/**
 * Which ONS table to pull from each downloaded file, and which Census column
 * within it matters. Each entry becomes one derived percentage on the seat.
 *
 * The Nomis MSOA files carry bare category names without the
 * "; measures: Value" suffix used by the ward-level extras, so columns are
 * matched on an exact prefix rather than a pattern.
 */
const TABLES = [
  {
    id: 'TS011',
    file: 'TS011-msoa.csv',
    label: 'Deprivation',
    // Households deprived in one or more dimensions, as a share of households.
    fields: [
      { key: 'oneDimension', column: 'Household deprivation: Household is deprived in one dimension' },
      { key: 'twoDimensions', column: 'Household deprivation: Household is deprived in two dimensions' },
      { key: 'threeDimensions', column: 'Household deprivation: Household is deprived in three dimensions' },
      { key: 'fourDimensions', column: 'Household deprivation: Household is deprived in four dimensions' },
      { key: 'households', column: 'Household deprivation: Total: All households' },
    ],
    share: (v) => (v.oneDimension + v.twoDimensions + v.threeDimensions + v.fourDimensions) / v.households,
  },
  {
    id: 'TS021',
    file: 'TS021-msoa.csv',
    label: 'Ethnic group',
    fields: [
      { key: 'whiteBritish', column: 'Ethnic group: White: English, Welsh, Scottish, Northern Irish or British' },
      { key: 'white', column: 'Ethnic group: White' },
      { key: 'population', column: 'Ethnic group: Total: All usual residents' },
    ],
    // Total minus the whole White category, per ONS's own definition of
    // "ethnic group minority".
    share: (v) => (v.population - v.white) / v.population,
  },
  {
    id: 'TS067',
    file: 'TS067-msoa.csv',
    label: 'Qualification',
    fields: [
      { key: 'noQualifications', column: 'Highest level of qualification: No qualifications' },
      { key: 'degree', column: 'Highest level of qualification: Level 4 qualifications and above' },
      { key: 'population', column: 'Highest level of qualification: Total: All usual residents aged 16 years and over' },
    ],
    share: (v) => v.degree / v.population,
  },
  {
    id: 'TS008',
    file: 'TS008-msoa.csv',
    label: 'Sex',
    // "All persons" is the total usual resident population, so this table is
    // the single source of record.population.
    populationSource: true,
    fields: [
      { key: 'female', column: 'Sex: Female' },
      { key: 'male', column: 'Sex: Male' },
      { key: 'population', column: 'Sex: All persons' },
    ],
    share: (v) => v.female / v.population,
  },
  {
    id: 'TS030',
    file: 'TS030-msoa.csv',
    label: 'Religion',
    fields: [
      { key: 'noReligion', column: 'Religion: No religion' },
      { key: 'christian', column: 'Religion: Christian' },
      { key: 'muslim', column: 'Religion: Muslim' },
      { key: 'hindu', column: 'Religion: Hindu' },
      { key: 'population', column: 'Religion: Total: All usual residents' },
    ],
    share: (v) => v.noReligion / v.population,
  },
];

/** Load the MSOA -> constituency best-fit lookup. */
/**
 * Resolve a Census column by prefix.
 *
 * The Nomis files are inconsistent: the MSOA extracts carry bare category names,
 * while some tables keep the ONS custom output's "; measures: Value" suffix. A
 * prefix match accepts both without duplicating every column name here.
 */
function makeResolver(header) {
  const exact = new Map(header.map((h) => [h, h]));
  return (wanted) => {
    if (exact.has(wanted)) return wanted;
    const hit = header.find((h) => h === wanted || h.startsWith(`${wanted};`));
    if (!hit) {
      throw new Error(
        `No column matching "${wanted}" in ${header.length}-column file. First few: ${header.slice(0, 3).join(' | ')}`,
      );
    }
    return hit;
  };
}

export function loadLookup(path) {
  const { rows } = csvToObjects(readFileSync(path, 'utf8'));
  const map = new Map();
  for (const r of rows) {
    const msoa = r.MSOA21CD;
    const pcon = r.PCON25CD;
    if (!msoa || !pcon) continue;
    if (!map.has(msoa)) {
      map.set(msoa, { pcon, pconName: r.PCON25NM });
    }
  }
  return map;
}

/**
 * Aggregate every configured table up to constituency level.
 *
 * @returns {Map<string, Record<string, number>>} constituency code -> metric
 */
export function loadDemographics(dir, lookup) {
  const out = new Map();

  for (const table of TABLES) {
    const { header, rows } = csvToObjects(readFileSync(`${dir}/${table.file}`, 'utf8'));
    const column = makeResolver(header);
    const columns = table.fields.map((f) => ({ ...f, column: column(f.column) }));

    // constituency code -> { metricKey: summed value }
    const totals = new Map();
    let unmatched = 0;

    for (const row of rows) {
      const hit = lookup.get(row['geography code']);
      if (!hit) { unmatched += 1; continue; }

      if (!totals.has(hit.pcon)) {
        totals.set(hit.pcon, {});
      }
      const bucket = totals.get(hit.pcon);

      for (const f of columns) {
        const v = toNumber(row[f.column]);
        if (v === null) continue;
        bucket[f.key] = (bucket[f.key] ?? 0) + v;
      }
    }

    if (unmatched) {
      console.warn(`  ! ${table.id}: ${unmatched} MSOA(s) had no constituency in the lookup`);
    }

    for (const [pcon, bucket] of totals) {
      const record = out.get(pcon) ?? {};
      const share = table.share(bucket);
      if (Number.isFinite(share)) {
        record[table.id] = share;
      }
      // Secondary shares worth showing alongside the headline one.
      if (table.id === 'TS030' && bucket.population) {
        record.muslimShare = bucket.muslim / bucket.population;
        record.hinduShare = bucket.hindu / bucket.population;
        record.christianShare = bucket.christian / bucket.population;
      }
      if (table.id === 'TS021' && bucket.population) {
        record.whiteBritishShare = bucket.whiteBritish / bucket.population;
      }
      if (table.id === 'TS067' && bucket.population) {
        record.noQualificationsShare = bucket.noQualifications / bucket.population;
      }
      if (table.id === 'TS011' && bucket.households) {
        // ONS's summary deprivation index, the headline deprivation measure.
        record.deprivationIndex = (
          bucket.oneDimension + 2 * bucket.twoDimensions
          + 3 * bucket.threeDimensions + 4 * bucket.fourDimensions
        ) / bucket.households;
      }
      // Resident population is taken from exactly one table. Summing the
      // "total" column of every table would multiply it by five, since each
      // table restates the population in its own (differently scoped) way.
      if (table.populationSource && bucket.population) {
        record.population = bucket.population;
      }
      out.set(pcon, record);
    }
  }

  return out;
}

/**
 * The metrics exposed in the UI, with human labels and a sensible display range
 * so a map colour ramp is not dominated by outliers.
 */
export const DEMOGRAPHIC_METRICS = [
  {
    key: 'TS011',
    seatKey: 'deprived',
    label: 'Deprivation',
    hint: 'Households deprived in at least one dimension, Census 2021',
    short: 'deprived households',
    domain: [0.4, 0.7],
    ticks: ['40%', '50%', '60%', '70%'],
  },
  {
    key: 'TS021',
    seatKey: 'minority',
    label: 'Ethnic minority share',
    hint: 'Usual residents in any group other than White, Census 2021',
    short: 'ethnic minority',
    domain: [0.02, 0.6],
    ticks: ['2%', '20%', '40%', '60%'],
  },
  {
    key: 'TS067',
    seatKey: 'degree',
    label: 'Degree-level qualification',
    hint: 'Residents aged 16+ with level 4 qualifications or above, Census 2021',
    short: 'with a degree',
    domain: [0.2, 0.65],
    ticks: ['20%', '35%', '50%', '65%'],
  },
  {
    key: 'TS030',
    seatKey: 'noReligion',
    label: 'No religion',
    hint: 'Usual residents reporting no religion, Census 2021',
    short: 'no religion',
    domain: [0.15, 0.75],
    ticks: ['15%', '35%', '55%', '75%'],
  },
];

export const DEMOGRAPHIC_TABLES = TABLES;
