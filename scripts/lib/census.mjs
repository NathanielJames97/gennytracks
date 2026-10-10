// Census 2021 demographics for Westminster parliamentary constituencies.
//
// Source: ONS Census 2021 topic summaries, via the Nomis bulk download service
// (https://www.nomisweb.co.uk/census/2021/bulk). Current local inputs cover
// England and Wales only. Scotland's Census was in 2022 and Northern Ireland's
// was in 2021; no values are extrapolated into either country.
//
// The tables publish at MSOA level (7,264 areas of 2,000-15,000 people), not at
// constituency level, so each is aggregated up through the ONS best-fit lookup
// `data/source/census/msoa-to-pcon.csv`. The ONS publication identifies its
// target as July 2024 PCON24, while the exported CSV's physical fields are
// PCON25* (the ONS service exposes PCON24* as their aliases). Preserve that
// original file schema and document the alias explicitly; never infer a
// boundary vintage from the physical header alone.
//
// Open Government Licence v3.0. Added inputs: TS007 age and TS054 household
// tenure, downloaded from the Nomis Census 2021 bulk table archive.

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
    id: 'TS007',
    file: 'census2021-ts007-msoa.csv',
    label: 'Age',
    fields: [
      { key: 'age65to74', column: 'Age: Aged 65 to 74 years' },
      { key: 'age75to84', column: 'Age: Aged 75 to 84 years' },
      { key: 'age85Plus', column: 'Age: Aged 85 years and over' },
      { key: 'population', column: 'Age: Total' },
    ],
    share: (v) => (v.age65to74 + v.age75to84 + v.age85Plus) / v.population,
  },
  {
    id: 'TS054',
    file: 'census2021-ts054-msoa.csv',
    label: 'Housing tenure',
    fields: [
      { key: 'owned', column: 'Tenure of household: Owned' },
      { key: 'sharedOwnership', column: 'Tenure of household: Shared ownership' },
      { key: 'households', column: 'Tenure of household: Total: All households' },
    ],
    share: (v) => (v.owned + v.sharedOwnership) / v.households,
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

/** Load the MSOA -> July 2024 constituency best-fit lookup. */
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

export function loadLookup(path, expectedConstituencies) {
  const { rows } = csvToObjects(readFileSync(path, 'utf8'));
  const header = Object.keys(rows[0] ?? {});
  if (!header.includes('MSOA21CD') || !header.includes('PCON25CD')) {
    throw new Error(`Expected ONS lookup physical columns MSOA21CD and PCON25CD; got ${header.join(', ')}`);
  }
  const map = new Map();
  for (const r of rows) {
    const msoa = r.MSOA21CD;
    const pcon = r.PCON25CD;
    if (!msoa || !pcon) continue;
    if (!map.has(msoa)) {
      map.set(msoa, { pcon, pconName: r.PCON25NM });
    }
  }
  if (expectedConstituencies) {
    const found = new Set([...map.values()].map(({ pcon }) => pcon));
    const missing = [...expectedConstituencies].filter((code) => !found.has(code));
    const unexpected = [...found].filter((code) => !expectedConstituencies.has(code));
    if (missing.length || unexpected.length) {
      throw new Error(
        `ONS July 2024 MSOA lookup code coverage mismatch: missing ${missing.length}, unexpected ${unexpected.length}`,
      );
    }
  }
  return map;
}

/**
 * Aggregate every configured table up to constituency level.
 *
 * @returns {Map<string, Record<string, number>>} constituency code -> metric
 */
export function loadDemographics(dir, lookup, expected = {}) {
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
      if (table.id === 'TS007' && bucket.population) {
        record.age65Plus = share;
      }
      if (table.id === 'TS054' && bucket.households) {
        record.ownerOccupiedShare = share;
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

  mergeCountryMetrics(out, loadScotlandDemographics(dir, expected.scotlandCodes));
  mergeCountryMetrics(out, loadNorthernIrelandDemographics(dir, expected.northernIrelandCodes));

  if (expected.seatCodes) {
    const actual = new Set(out.keys());
    const missing = [...expected.seatCodes].filter((code) => !actual.has(code));
    const unexpected = [...actual].filter((code) => !expected.seatCodes.has(code));
    if (missing.length || unexpected.length) {
      throw new Error(`Census seat coverage mismatch: missing ${missing.length}, unexpected ${unexpected.length}`);
    }
  }

  return out;
}

function mergeCountryMetrics(target, source) {
  for (const [code, values] of source) {
    target.set(code, { ...(target.get(code) ?? {}), ...values });
  }
}

/** Aggregate official NRS OA22 tables through its published UKPC24 lookup. */
function loadScotlandDemographics(dir, expectedCodes) {
  const lookupPath = `${dir}/scotland-oa22-ukpc24.csv`;
  const { rows: allocationRows } = csvToObjects(readFileSync(lookupPath, 'utf8'));
  const allocation = new Map(allocationRows.map((r) => [r.OA22, r.UKPC24]));
  const pcons = new Map();
  const tableRows = (file) => {
    const text = readFileSync(`${dir}/${file}`, 'utf8');
    // NRS output-area table downloads have three metadata lines before their
    // CSV header: publication, table title, and population base.
    const parsed = csvToObjects(text.split(/\r?\n/).slice(3).join('\n'));
    return parsed;
  };
  const age = tableRows('scotland-uv103-age-by-single-year.csv');
  const tenure = tableRows('scotland-uv404-household-tenure-households.csv');
  const qualification = tableRows('scotland-uv501-highest-level-of-qualification.csv');
  const ageHeaders = age.header;
  const over65Headers = ageHeaders.filter((h) => /^(?:6[5-9]|[7-9]\d|100 and over)$/.test(h));
  const ageTotal = ageHeaders.find((h) => h === 'All people');
  const ageData = new Map(age.rows.map((r) => [r[''], r]));
  const tenureData = new Map(tenure.rows.map((r) => [r[''], r]));
  const qualificationData = new Map(qualification.rows.map((r) => [r[''], r]));
  if (!ageTotal || over65Headers.length !== 36) {
    throw new Error('NRS UV103 age table is missing expected age 65+ columns');
  }

  for (const [oa, pcon] of allocation) {
    const a = ageData.get(oa);
    const h = tenureData.get(oa);
    const q = qualificationData.get(oa);
    if (!a || !h || !q) continue;
    const people = toNumber(a[ageTotal]);
    const seniors = over65Headers.reduce((sum, key) => sum + (toNumber(a[key]) ?? 0), 0);
    const households = toNumber(h['All occupied households']);
    const owned = toNumber(h['Owned: Total']);
    const adults = toNumber(q['All people aged 16 and over']);
    const degreePlus = toNumber(q['Degree level qualifications or above']);
    const bucket = pcons.get(pcon) ?? { population: 0, age65Count: 0, households: 0, owned: 0, adults: 0, degreePlus: 0 };
    if (people !== null) bucket.population += people;
    bucket.age65Count += seniors;
    if (households !== null) bucket.households += households;
    if (owned !== null) bucket.owned += owned;
    if (adults !== null) bucket.adults += adults;
    if (degreePlus !== null) bucket.degreePlus += degreePlus;
    pcons.set(pcon, bucket);
  }

  const result = new Map([...pcons].map(([pcon, v]) => [pcon, {
    population: v.population,
    age65Plus: v.population ? v.age65Count / v.population : null,
    ownerOccupiedShare: v.households ? v.owned / v.households : null,
    scotlandDegreeShare: v.adults ? v.degreePlus / v.adults : null,
    censusYear: 2022,
    censusSource: 'National Records of Scotland Census 2022',
    censusSourceId: 'nrs-census-2022',
    censusMethod: '2022 output-area counts summed to UK Parliamentary Constituency 2024 using the NRS OA22_UKPC24 lookup',
  }]));
  assertExactCodes(result.keys(), expectedCodes, 'NRS OA22 to UKPC24');
  return result;
}

/** Load NISRA's published Northern Ireland Census 2021 PCON24 tables. */
function loadNorthernIrelandDemographics(dir, expectedCodes) {
  const read = (file) => csvToObjects(readFileSync(`${dir}/${file}`, 'utf8')).rows;
  const ageRows = read('ni-age-pcon24.csv');
  const housingRows = read('ni-housing-pcon24.csv');
  const qualificationRows = read('ni-qualification-pcon24.csv');
  const seats = new Map();
  const get = (code) => {
    const row = seats.get(code) ?? { population: 0, age65Count: 0, ageRows: 0, households: 0, owned: 0, adults: 0, level4Plus: 0 };
    seats.set(code, row);
    return row;
  };
  for (const row of ageRows) {
    const bucket = get(row['Parliamentary Constituency 2024 Code']);
    const count = toNumber(row.Count);
    if (count === null) continue;
    bucket.population += count;
    bucket.ageRows += count;
    if (row['Age - 11 Categories Code'] === '11') bucket.age65Count += count;
  }
  for (const row of housingRows) {
    const bucket = get(row['Parliamentary Constituency 2024 Code']);
    const count = toNumber(row.Count);
    if (count === null) continue;
    bucket.households += count;
    if (row['Tenure - 4 Categories Code'] === '1') bucket.owned += count;
  }
  for (const row of qualificationRows) {
    const bucket = get(row['Parliamentary Constituency 2024 Code']);
    const count = toNumber(row.Count);
    if (count === null || row['Qualifications (Highest Level) Code'] === '-8') continue;
    bucket.adults += count;
    if (row['Qualifications (Highest Level) Code'] === '5') bucket.level4Plus += count;
  }

  const result = new Map([...seats].map(([pcon, v]) => [pcon, {
    population: v.population,
    age65Plus: v.population ? v.age65Count / v.population : null,
    ownerOccupiedShare: v.households ? v.owned / v.households : null,
    niLevel4PlusShare: v.adults ? v.level4Plus / v.adults : null,
    censusYear: 2021,
    censusSource: 'Northern Ireland Statistics and Research Agency Census 2021',
    censusSourceId: 'nisra-census-2021',
    censusMethod: 'Published Northern Ireland Census 2021 table aggregated directly to Parliamentary Constituency 2024',
  }]));
  assertExactCodes(result.keys(), expectedCodes, 'NISRA PCON24');
  return result;
}

function assertExactCodes(actualCodes, expectedCodes, label) {
  if (!expectedCodes) return;
  const actual = new Set(actualCodes);
  const missing = [...expectedCodes].filter((code) => !actual.has(code));
  const unexpected = [...actual].filter((code) => !expectedCodes.has(code));
  if (missing.length || unexpected.length) {
    throw new Error(`${label} code coverage mismatch: missing ${missing.length}, unexpected ${unexpected.length}`);
  }
}

/**
 * The metrics exposed in the UI, with human labels and a sensible display range
 * so a map colour ramp is not dominated by outliers.
 */
export const DEMOGRAPHIC_METRICS = [
  {
    key: 'TS008',
    seatKey: 'population',
    label: 'Resident population',
    hint: 'Usual resident population from each country’s census (2021 in England, Wales and Northern Ireland; 2022 in Scotland)',
    short: 'residents',
    unit: 'people',
    domain: [0, 120000],
    ticks: ['0', '40k', '80k', '120k'],
    countries: ['England', 'Wales', 'Scotland', 'Northern Ireland'],
    source: 'ONS TS008; NRS UV103; NISRA AGE_BAND_AGG11',
    sourceIds: { England: 'ons-census-2021', Wales: 'ons-census-2021', Scotland: 'nrs-census-2022', 'Northern Ireland': 'nisra-census-2021' },
    yearByCountry: { England: 2021, Wales: 2021, Scotland: 2022, 'Northern Ireland': 2021 },
    definition: 'Usual residents at each country census date; count from the country table shown in sourceIds.',
    sourceUrl: 'https://www.nomisweb.co.uk/census/2021/bulk',
  },
  {
    key: 'TS007',
    seatKey: 'age65Plus',
    label: 'Residents aged 65 and over',
    hint: 'Usual residents aged 65+ as a share of all usual residents; country census dates are 2021 except Scotland (2022)',
    short: 'aged 65+',
    unit: 'share',
    domain: [0.08, 0.4],
    ticks: ['8%', '18%', '29%', '40%'],
    countries: ['England', 'Wales', 'Scotland', 'Northern Ireland'],
    source: 'ONS TS007; NRS UV103; NISRA AGE_BAND_AGG11',
    sourceIds: { England: 'ons-census-2021', Wales: 'ons-census-2021', Scotland: 'nrs-census-2022', 'Northern Ireland': 'nisra-census-2021' },
    yearByCountry: { England: 2021, Wales: 2021, Scotland: 2022, 'Northern Ireland': 2021 },
    definition: 'Age 65+ divided by total usual resident population. Scotland census reference date is 20 March 2022; other countries use their 2021 census tables.',
    sourceUrl: 'https://www.scotlandscensus.gov.uk/documents/2022-output-area-data/',
  },
  {
    key: 'TS054',
    seatKey: 'ownerOccupiedShare',
    label: 'Owner occupation or shared ownership',
    hint: 'Households in owner-occupied or shared-ownership tenure divided by all occupied households; country census dates are 2021 except Scotland (2022)',
    short: 'owner occupied or shared ownership',
    unit: 'share',
    domain: [0.25, 0.9],
    ticks: ['25%', '47%', '68%', '90%'],
    countries: ['England', 'Wales', 'Scotland', 'Northern Ireland'],
    source: 'ONS TS054; NRS UV404; NISRA HH_TENURE_AGG4',
    sourceIds: { England: 'ons-census-2021', Wales: 'ons-census-2021', Scotland: 'nrs-census-2022', 'Northern Ireland': 'nisra-census-2021' },
    yearByCountry: { England: 2021, Wales: 2021, Scotland: 2022, 'Northern Ireland': 2021 },
    definition: 'England and Wales combine owned and shared ownership; Scotland uses UV404 Owned: Total; Northern Ireland uses owner-occupied households. Denominator is occupied households in each census.',
    sourceUrl: 'https://build.nisra.gov.uk/en/custom/data?d=HOUSEHOLD&v=PARLCON24&v=HH_TENURE_AGG4',
  },
  {
    key: 'TS011',
    seatKey: 'deprived',
    label: 'Deprivation',
    hint: 'Households deprived in at least one dimension, Census 2021',
    short: 'deprived households',
    unit: 'share',
    countries: ['England', 'Wales'],
    source: 'ONS Census 2021 TS011',
    domain: [0.4, 0.7],
    ticks: ['40%', '50%', '60%', '70%'],
  },
  {
    key: 'TS021',
    seatKey: 'minority',
    label: 'Ethnic minority share',
    hint: 'Usual residents in any group other than White, Census 2021',
    short: 'ethnic minority',
    unit: 'share',
    countries: ['England', 'Wales'],
    source: 'ONS Census 2021 TS021',
    domain: [0.02, 0.6],
    ticks: ['2%', '20%', '40%', '60%'],
  },
  {
    key: 'TS067',
    seatKey: 'degree',
    label: 'Level 4 qualifications or above (England and Wales)',
    hint: 'Residents aged 16+ with Level 4 qualifications or above, Census 2021',
    short: 'with Level 4+',
    unit: 'share',
    countries: ['England', 'Wales'],
    source: 'ONS Census 2021 TS067',
    sourceIds: { England: 'ons-census-2021', Wales: 'ons-census-2021' },
    yearByCountry: { England: 2021, Wales: 2021 },
    definition: 'ONS TS067: residents aged 16+ with Level 4 qualifications and above divided by residents aged 16+.',
    sourceUrl: 'https://www.nomisweb.co.uk/census/2021/bulk',
    domain: [0.2, 0.65],
    ticks: ['20%', '35%', '50%', '65%'],
  },
  {
    key: 'HIGHEST_QUALIFICATION',
    seatKey: 'niLevel4PlusShare',
    label: 'Level 4 qualifications or above (Northern Ireland)',
    hint: 'Residents aged 16+ with Level 4 qualifications or above, Census 2021',
    short: 'with Level 4+',
    unit: 'share',
    countries: ['Northern Ireland'],
    source: 'NISRA Census 2021 HIGHEST_QUALIFICATION',
    sourceIds: { 'Northern Ireland': 'nisra-census-2021' },
    yearByCountry: { 'Northern Ireland': 2021 },
    definition: 'NISRA highest qualification category 5 divided by residents aged 16+; the category includes HNC/HND and professional qualifications.',
    sourceUrl: 'https://build.nisra.gov.uk/en/custom/data?d=PEOPLE&v=PARLCON24&v=HIGHEST_QUALIFICATION',
    domain: [0.2, 0.65],
    ticks: ['20%', '35%', '50%', '65%'],
  },
  {
    key: 'UV501',
    seatKey: 'scotlandDegreeShare',
    label: 'Degree-level qualifications or above (Scotland)',
    hint: 'Residents aged 16+ with degree-level qualifications or above, Census 2022',
    short: 'with degree-level+',
    unit: 'share',
    countries: ['Scotland'],
    source: 'NRS Scotland Census 2022 UV501',
    sourceIds: { Scotland: 'nrs-census-2022' },
    yearByCountry: { Scotland: 2022 },
    definition: 'NRS UV501 degree-level qualifications or above divided by residents aged 16+; HNC/HND are a separate category, so this is not the same threshold as Northern Ireland.',
    sourceUrl: 'https://www.scotlandscensus.gov.uk/documents/2022-output-area-data/',
    domain: [0.2, 0.65],
    ticks: ['20%', '35%', '50%', '65%'],
  },
  {
    key: 'TS030',
    seatKey: 'noReligion',
    label: 'No religion',
    hint: 'Usual residents reporting no religion, Census 2021',
    short: 'no religion',
    unit: 'share',
    countries: ['England', 'Wales'],
    source: 'ONS Census 2021 TS030',
    domain: [0.15, 0.75],
    ticks: ['15%', '35%', '55%', '75%'],
  },
];

export const DEMOGRAPHIC_TABLES = TABLES;
