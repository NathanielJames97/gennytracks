import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { canonicalPartyName } from '../../src/lib/parties.mjs';
import { simplifyGeometry } from './simplify.mjs';

const PARTY_COLOURS = {
  Labour: '#E4003B', Conservative: '#0087DC', 'Liberal Democrats': '#FAA61A',
  'Scottish National': '#FDF38E', 'Reform UK': '#12B6CF',
  'Democratic Unionist': '#D46A4C', 'Sinn Féin': '#00654F',
  'Social Democratic and Labour': '#2AA82C', 'Plaid Cymru': '#005B54',
  Green: '#5EB646', Independent: '#7A7A7A', Speaker: '#9E9E9E',
  Alliance: '#F6CB2F', 'Ulster Unionist': '#48A5EE',
  'Traditional Unionist Voice': '#0C3A6A', 'UK Independence Party': '#70147A',
  'Brexit Party': '#12B6CF', 'Green Party NI': '#2AA82C',
};

const SWING_COLOURS = {
  Labour: '#C81B4A', Conservative: '#1F6FB4', 'Liberal Democrats': '#D98A1F',
  'Scottish National': '#C9A227', 'Reform UK': '#12B6CF',
  'Democratic Unionist': '#D46A4C', 'Sinn Féin': '#00654F',
  'Social Democratic and Labour': '#2AA82C', 'Plaid Cymru': '#005B54',
  Green: '#5EB646', Independent: '#7A7A7A',
};

const partyName = canonicalPartyName;

function colourForParty(name) {
  const canonical = partyName(name);
  return PARTY_COLOURS[canonical] || '#7A7A7A';
}

function partyTotalsForSeat(seat) {
  if (Array.isArray(seat.partyTotals)) return seat.partyTotals;
  const totals = new Map();
  for (const row of seat.candidates || []) {
    const party = partyName(row.partyGroup || row.party || 'Unspecified');
    const current = totals.get(party) || { party, votes: 0, isGrouped: false };
    current.votes += Number(row.votes) || 0;
    current.isGrouped ||= Boolean(row.notionalAggregate);
    totals.set(party, current);
  }
  return [...totals.values()];
}

function assertUnique(seats, label, expected = 650) {
  const ids = seats.map((seat) => seat.id);
  if (seats.length !== expected || new Set(ids).size !== expected || ids.some((id) => !id)) {
    throw new Error(label + ' must contain ' + expected + ' seats with unique geographic codes');
  }
}

function summarize(election, seats, censusSummary) {
  const partySeats = new Map();
  const partyVotes = new Map();
  const regionRows = new Map();
  const swingRows = new Map();
  let validVotes = 0;
  let electorate = 0;
  let invalidVotes = 0;
  let invalidVotesKnown = true;
  let candidateCount = 0;

  for (const seat of seats) {
    const party = seat.partyGroup;
    const current = partySeats.get(party) || {
      party, seats: 0, gains: 0, holds: 0, colour: seat.colour,
    };
    current.seats += 1;
    if (seat.resultType === 'gain') current.gains += 1;
    if (seat.resultType === 'hold') current.holds += 1;
    partySeats.set(party, current);

    const region = seat.region || seat.country || 'Unknown';
    const row = regionRows.get(region) || {
      region, country: seat.country, seats: 0, electorate: 0, validVotes: 0, parties: {},
    };
    row.seats += 1;
    row.electorate += seat.electorate || 0;
    row.validVotes += seat.validVotes || 0;
    row.parties[party] = (row.parties[party] || 0) + 1;
    regionRows.set(region, row);

    if (seat.resultType === 'gain' && seat.gainedFrom) {
      const from = partyName(seat.gainedFrom);
      const key = `${party}<-${from}`;
      swingRows.set(key, (swingRows.get(key) || 0) + 1);
    }

    validVotes += seat.validVotes || 0;
    electorate += seat.electorate || 0;
    if (Number.isFinite(seat.invalidVotes)) invalidVotes += seat.invalidVotes;
    else invalidVotesKnown = false;
    for (const candidate of seat.candidates || []) {
      if (candidate.name && !candidate.notionalAggregate) candidateCount += 1;
    }
    for (const result of seat.partyTotals || []) {
      const resultParty = partyName(result.partyGroup || result.party);
      partyVotes.set(resultParty, (partyVotes.get(resultParty) || 0) + (result.votes || 0));
    }
  }

  const parties = [...partySeats.values()].sort((a, b) => b.seats - a.seats || a.party.localeCompare(b.party));
  const voteShare = [...partyVotes.entries()]
    .map(([party, votes]) => ({
      abbrev: party,
      party,
      votes,
      share: validVotes ? votes / validVotes : 0,
      seats: partySeats.get(party)?.seats || 0,
      colour: colourForParty(party),
    }))
    .sort((a, b) => b.votes - a.votes);
  const regions = [...regionRows.values()]
    .map((row) => ({ ...row, turnout: row.electorate ? row.validVotes / row.electorate : null }))
    .sort((a, b) => b.seats - a.seats);
  const swings = [...swingRows.entries()]
    .map(([key, count]) => {
      const [to, from] = key.split('<-');
      return { to, from, count };
    })
    .sort((a, b) => b.count - a.count);
  const marginals = seats.filter((seat) => Number.isFinite(seat.majority))
    .sort((a, b) => a.majority - b.majority)
    .slice(0, 50)
    .map((seat) => ({
      id: seat.id, name: seat.name, region: seat.region, majority: seat.majority,
      majorityShare: seat.majorityShare, party: seat.partyGroup, colour: seat.colour,
      member: seat.member,
    }));
  const majorityBands = [
    { label: '0-1k', min: 0, max: 1000 }, { label: '1-2k', min: 1000, max: 2000 },
    { label: '2-5k', min: 2000, max: 5000 }, { label: '5-10k', min: 5000, max: 10000 },
    { label: '10-15k', min: 10000, max: 15000 }, { label: '15k+', min: 15000, max: Infinity },
  ].map((band) => ({
    ...band, max: Number.isFinite(band.max) ? band.max : null,
    seats: seats.filter((seat) => Number.isFinite(seat.majority)
      && seat.majority >= band.min && seat.majority < (band.max ?? Infinity)).length,
  }));

  return {
    schemaVersion: 1,
    id: election.id,
    year: election.year,
    label: election.label,
    date: election.date,
    isNotional: Boolean(election.isNotional),
    boundarySetId: election.boundarySetId,
    total: seats.length,
    source: election.sourceName || 'UK Parliament Election Results database',
    totals: {
      electorate, validVotes, invalidVotes: invalidVotesKnown ? invalidVotes : null, candidates: candidateCount,
      turnout: electorate ? validVotes / electorate : null,
    },
    parties, voteShare, regions, swings, marginals, majorityBands,
    memberStats: candidateCount ? {
      reelected: seats.filter((seat) => seat.resultType === 'hold').length,
      newMPs: seats.filter((seat) => seat.member && !seat.candidates?.[0]?.formerMp).length,
      byGender: seats.reduce((result, seat) => {
        const gender = seat.memberGender || 'Unknown';
        result[gender] = (result[gender] || 0) + 1;
        return result;
      }, {}),
    } : null,
    ...(censusSummary ? { census: censusSummary } : {}),
  };
}

function featureFor(id, name, geometry, sourceProperties = {}) {
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      name,
      gss: Object.prototype.hasOwnProperty.call(sourceProperties, 'gss') ? sourceProperties.gss : id,
      country: sourceProperties.country || null,
      region: sourceProperties.region || null,
      type: sourceProperties.type || null,
      ...(sourceProperties.sourceCode !== undefined ? { sourceCode: sourceProperties.sourceCode } : {}),
    },
    geometry,
  };
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value));
}

/** Write the election catalog, normalized result files and boundary epochs. */
export function writeElectionData({ root, outDir, currentSeats, currentFeatures, currentSummary }) {
  const historyPath = join(root, 'data', 'source', 'hoc', 'historical-results.json');
  const history2001Path = join(root, 'data', 'source', 'hoc', 'historical-2001-results.json');
  const boundaryPath = join(root, 'data', 'source', 'boundaries', 'constituencies-2019.geojson.gz');
  const boundary2001Path = join(root, 'data', 'source', 'boundaries', 'constituencies-2001.geojson.gz');
  const history = JSON.parse(readFileSync(historyPath, 'utf8'));
  const history2001 = JSON.parse(readFileSync(history2001Path, 'utf8'));
  const boundary2019 = JSON.parse(gunzipSync(readFileSync(boundaryPath)).toString('utf8'));
  const boundary2001 = JSON.parse(gunzipSync(readFileSync(boundary2001Path)).toString('utf8'));
  const electionDir = join(outDir, 'elections');
  const boundaryDir = join(outDir, 'boundaries');
  const crosswalkDir = join(outDir, 'crosswalks');
  rmSync(electionDir, { recursive: true, force: true });
  mkdirSync(electionDir, { recursive: true });
  mkdirSync(boundaryDir, { recursive: true });
  mkdirSync(crosswalkDir, { recursive: true });

  const features2010 = boundary2019.features.map((feature) => {
    const id = feature.properties.pcon19cd || feature.properties.PCON19CD;
    const geometry = feature.geometry && simplifyGeometry(feature.geometry, {
      tolerance: 0.001, decimals: 5, minRingArea: 0.00008, maxPolygons: 80,
    });
    if (!id || !geometry) throw new Error('Invalid 2019 boundary feature ' + feature.properties.pcon19nm);
    return featureFor(id, feature.properties.pcon19nm || feature.properties.PCON19NM, geometry);
  });
  const features2024 = currentFeatures.map((feature) => featureFor(
    feature.properties.id, feature.properties.name, feature.geometry, feature.properties,
  ));

  const election2001 = history2001.elections.find((entry) => entry.id === '2001');
  if (!election2001) throw new Error('Normalized 2001 results are missing the 2001 election entry');
  assertUnique(election2001.seats, '2001', 659);
  const seats2001ById = new Map(election2001.seats.map((seat) => [seat.id, seat]));
  const features2001 = boundary2001.features.map((feature) => {
    const properties = feature.properties;
    const seat = seats2001ById.get(properties.id);
    if (!seat || seat.name !== properties.name) {
      throw new Error('2001 result and boundary names disagree for ' + properties.id);
    }
    return featureFor(properties.id, properties.name, feature.geometry, {
      ...properties, country: seat.country, region: seat.region, type: 'constituency',
    });
  });
  const ids2001 = new Set(features2001.map((feature) => feature.properties.id));
  if (features2001.length !== 659 || ids2001.size !== 659
    || [...seats2001ById.keys()].some((id) => !ids2001.has(id))) {
    throw new Error('2001 results and boundaries must match all 659 unique constituencies');
  }

  const ids2010 = new Set(features2010.map((feature) => feature.properties.id));
  if (features2010.length !== 650 || ids2010.size !== 650) {
    throw new Error('ONS 2019 boundaries must contain 650 unique constituencies');
  }
  const ids2024 = new Set(features2024.map((feature) => feature.properties.id));
  const seats2024ById = new Map(currentSeats.map((seat) => [seat.id, seat]));
  if (ids2024.size !== 650 || seats2024ById.size !== 650
    || [...ids2024].some((id) => !seats2024ById.has(id))) {
    throw new Error('2024 results and 2024 boundaries do not share the same 650 geographic codes');
  }

  const historyById = new Map([...history.elections, ...history2001.elections]
    .map((entry) => [entry.id, entry]));
  const expectedHistory = ['2001', '2010', '2015', '2017', '2019', '2019-notional-2024'];
  for (const id of expectedHistory) {
    if (!historyById.has(id)) throw new Error('Historical source is missing ' + id);
  }
  for (const entry of history.elections.filter((item) => item.boundarySetId === '2010')) {
    assertUnique(entry.seats, entry.id);
    const resultIds = new Set(entry.seats.map((seat) => seat.id));
    if (resultIds.size !== ids2010.size || [...ids2010].some((id) => !resultIds.has(id))) {
      throw new Error(entry.id + ' results do not match the ONS 2019 constituency geography');
    }
  }
  const notional = historyById.get('2019-notional-2024');
  assertUnique(notional.seats, notional.id);
  if (notional.seats.some((seat) => !ids2024.has(seat.id))) {
    throw new Error('Notional 2019 results do not match 2024 geographic codes');
  }

  const crosswalk = history.boundaryCrosswalk || [];
  const crosswalkFrom = new Set(crosswalk.map((row) => row.fromCode));
  const crosswalkTo = new Set(crosswalk.map((row) => row.toCode));
  if (crosswalkFrom.size !== 650 || crosswalkTo.size !== 650
    || [...ids2010].some((id) => !crosswalkFrom.has(id))
    || [...ids2024].some((id) => !crosswalkTo.has(id))) {
    throw new Error('Official 2010–2019 to 2024 boundary crosswalk does not cover both 650-seat sets');
  }

  writeJson(join(boundaryDir, '2001.geojson'), {
    schemaVersion: 1, type: 'FeatureCollection', features: features2001,
    provenance: boundary2001.provenance,
  });
  writeJson(join(boundaryDir, '2010.geojson'), {
    schemaVersion: 1, type: 'FeatureCollection', features: features2010,
  });
  writeJson(join(boundaryDir, '2024.geojson'), {
    schemaVersion: 1, type: 'FeatureCollection', features: features2024,
  });
  writeJson(join(crosswalkDir, '2010-to-2024.json'), {
    schemaVersion: 1,
    sourceId: 'parliament-election-results',
    source: 'UK Parliament Election Results constituency area overlaps',
    fromBoundarySetId: '2010',
    toBoundarySetId: '2024',
    sharesNote: 'Population, residential and area shares describe geographic overlap. They do not project votes.',
    overlaps: crosswalk,
  });
  writeJson(join(outDir, 'boundaries.geojson'), {
    schemaVersion: 1, type: 'FeatureCollection', features: currentFeatures,
  });
  writeJson(join(outDir, 'constituencies.json'), currentSeats);
  writeJson(join(outDir, 'parties.json'), currentSummary);

  const descriptors = [];
  const addElection = (entry, seats, censusSummary = null) => {
    const descriptor = {
      id: entry.id,
      year: entry.year,
      label: entry.label || String(entry.year),
      date: entry.date,
      boundarySetId: entry.boundarySetId,
      ...(entry.resultCodePeriod ? { resultCodePeriod: entry.resultCodePeriod } : {}),
      isNotional: Boolean(entry.isNotional),
      candidateDataGranularity: entry.candidateDataGranularity || (entry.isNotional ? 'party-aggregate' : 'candidate'),
      sourceId: entry.sourceId || (entry.id === '2024' ? 'commons-library-2024' : 'parliament-election-results'),
      seats: seats.length,
      sourceName: entry.sourceName || 'UK Parliament Election Results',
      sourceUrl: entry.sourceUrl || 'https://electionresults.parliament.uk/',
      sourceLicense: entry.sourceLicense || 'Open Parliament Licence v3.0',
      boundaryLabel: entry.boundaryLabel || (entry.boundarySetId === '2010'
        ? '2010–2019 constituency boundaries'
        : entry.boundarySetId === '2024' ? '2024 constituency boundaries' : String(entry.boundarySetId) + ' constituency boundaries'),
      marginDataAvailable: entry.marginDataAvailable !== false,
      resultsFile: 'elections/' + entry.id + '.json',
      summaryFile: 'elections/' + entry.id + '-summary.json',
      boundariesFile: 'boundaries/' + entry.boundarySetId + '.geojson',
      ...(entry.caveat ? { caveat: entry.caveat } : {}),
      ...(entry.boundaryCaveat ? { boundaryCaveat: entry.boundaryCaveat } : {}),
      ...(entry.isNotional && !entry.caveat ? {
        caveat: 'Modelled party totals for 2019 projected onto 2024 constituencies. These are not declared constituency results and do not identify individual candidates.',
      } : {}),
    };
    assertUnique(seats, entry.id, entry.expectedSeatCount || 650);
    const normalizedSeats = seats.map((seat) => ({
      ...seat,
      partyOfficial: seat.partyOfficial || seat.party || seat.partyGroup,
      party: partyName(seat.party),
      partyGroup: partyName(seat.partyGroup || seat.party),
      colour: seat.colour || colourForParty(seat.partyGroup || seat.party),
      swingColour: seat.gainedFrom ? (SWING_COLOURS[partyName(seat.gainedFrom)] || '#7A7A7A') : null,
      gss: Object.prototype.hasOwnProperty.call(seat, 'gss') ? seat.gss : (seat.areaCode || seat.id),
      boundarySetId: entry.boundarySetId,
      isNotional: Boolean(entry.isNotional),
      candidates: (seat.candidates || []).map((candidate) => ({
        ...candidate,
        partyOfficial: candidate.partyOfficial || candidate.party,
        party: partyName(candidate.party || 'Unspecified'),
        partyGroup: partyName(candidate.party || 'Unspecified'),
      })),
      partyTotals: partyTotalsForSeat(seat).map((row) => ({
        ...row,
        party: partyName(row.partyGroup || row.party || 'Unspecified'),
        votes: Number(row.votes) || 0,
        share: Number.isFinite(row.share) ? row.share
          : (seat.validVotes ? (Number(row.votes) || 0) / seat.validVotes : null),
      })),
    }));
    const summary = summarize(descriptor, normalizedSeats, censusSummary);
    writeJson(join(outDir, descriptor.resultsFile), {
      schemaVersion: 1, electionId: descriptor.id, results: normalizedSeats,
    });
    writeJson(join(outDir, descriptor.summaryFile), summary);
    descriptors.push(descriptor);
  };

  for (const id of expectedHistory) {
    const entry = historyById.get(id);
    const label = entry.isNotional ? '2019 notional · 2024 boundaries' : String(entry.year);
    addElection({ ...entry, label }, entry.seats);
  }
  addElection({
    id: '2024',
    year: 2024,
    date: '2024-07-04',
    label: '2024',
    boundarySetId: '2024',
    sourceName: 'House of Commons Library, CBP-10009',
    sourceUrl: 'https://commonslibrary.parliament.uk/research-briefings/cbp-10009/',
  }, currentSeats, currentSummary.census);

  descriptors.sort((a, b) => a.year - b.year || Number(a.isNotional) - Number(b.isNotional));
  const manifest = {
    schemaVersion: 1,
    defaultElection: '2024',
    elections: descriptors,
    crosswalks: [{
      id: '2010-to-2024',
      file: 'crosswalks/2010-to-2024.json',
      sourceId: 'parliament-election-results',
      fromBoundarySetId: '2010',
      toBoundarySetId: '2024',
    }],
    boundarySets: [
      {
        id: '2001',
        label: '2001 election boundaries',
        sourceId: 'constructed-2001-election-boundaries',
        resultCodePeriod: '1997–2001 PCA identifiers',
        seats: 659,
        caveat: election2001.boundaryCaveat,
      },
      {
        id: '2010',
        label: '2010–2019 constituency boundaries',
        sourceId: 'ons-2010-boundaries',
        seats: 650,
        validFrom: '2010-05-06',
        validTo: '2024-07-03',
      },
      {
        id: '2024',
        label: '2024 constituency boundaries',
        sourceId: 'ak-2024-boundaries',
        seats: 650,
        validFrom: '2024-07-04',
      },
    ],
    sources: [
      {
        id: 'parliament-election-results',
        name: 'UK Parliament Election Results',
        url: 'https://electionresults.parliament.uk/',
        license: 'Open Parliament Licence v3.0',
        attribution: 'UK Parliament',
        coverage: '2010–2024; includes the 2019 notional results on 2024 boundaries',
      },
      {
        id: 'commons-library-2024',
        name: 'House of Commons Library, CBP-10009',
        url: 'https://commonslibrary.parliament.uk/research-briefings/cbp-10009/',
        license: 'Open Parliament Licence v3.0',
        attribution: 'House of Commons Library',
        coverage: '2024 UK general election declared constituency and candidate results',
      },
      {
        id: 'commons-library-2001-results',
        name: 'House of Commons Library, CBP-8647',
        url: 'https://commonslibrary.parliament.uk/research-briefings/cbp-8647/',
        license: 'Open Parliament Licence v3.0',
        attribution: 'House of Commons Library',
        coverage: '2001 constituency party-group totals, electorate, valid votes and source notes',
      },
      {
        id: 'ons-2010-boundaries',
        name: 'ONS Parliamentary Constituency Boundaries, December 2019',
        url: 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WPC_Dec_2019_GCB_UK_2022/FeatureServer/0',
        license: 'Open Government Licence v3.0; contains Ordnance Survey data',
        attribution: 'Office for National Statistics; contains Ordnance Survey data',
        coverage: '650 constituencies in the 2010–2019 boundary period',
      },
      {
        id: 'commons-library-2001-boundary-history',
        name: 'House of Commons Library, RP 08/38',
        url: 'https://researchbriefings.files.parliament.uk/documents/RP08-38/RP08-38.pdf',
        license: 'Open Parliament Licence v3.0',
        attribution: 'House of Commons Library',
        coverage: '1997 and 2001 constituency boundary chronology',
      },
      {
        id: 'ons-2001-gb-boundaries',
        name: 'ONS Westminster Parliamentary Constituencies (2001 and 2005) Boundaries GB BFE',
        url: 'https://www.data.gov.uk/dataset/c6f9c53b-e2ba-487f-925e-0d8e8064651a/westminster-parliamentary-constituencies-2001-and-2005-boundaries-gb-bfe',
        license: 'OGL v3.0 under the data.gov.uk default site terms; the dataset-specific licence field is not set',
        attribution: 'Office for National Statistics; contains Ordnance Survey data',
        coverage: '641 Great Britain constituencies in the 2001 layer',
      },
      {
        id: 'osni-1993-wards',
        name: 'OSNI Open Data 50K Boundaries: Wards (1993)',
        url: 'https://admin.opendatani.gov.uk/dataset/osni-open-data-50k-boundaries-wards-1993',
        license: 'LPS Open Government Data Licence',
        attribution: 'Land and Property Services, Ordnance Survey of Northern Ireland',
        coverage: '582 Northern Ireland wards used to construct the 18 constituency polygons',
      },
      {
        id: 'ni-1995-constituency-order',
        name: 'Parliamentary Constituencies (Northern Ireland) Order 1995',
        url: 'https://www.legislation.gov.uk/uksi/1995/2992/made',
        license: 'Open Government Licence v3.0',
        attribution: 'The National Archives',
        coverage: 'Statutory ward definitions for 18 Northern Ireland constituencies',
      },
      {
        id: 'constructed-2001-election-boundaries',
        name: 'Composite 2001 election constituency geography',
        url: 'https://www.data.gov.uk/dataset/c6f9c53b-e2ba-487f-925e-0d8e8064651a/westminster-parliamentary-constituencies-2001-and-2005-boundaries-gb-bfe',
        license: 'Composite; component licences and limitations are recorded in the source entries',
        attribution: 'Office for National Statistics, OSNI and The National Archives',
        coverage: '641 ONS Great Britain boundaries plus 18 Northern Ireland ward unions',
      },
      {
        id: 'ak-2024-boundaries',
        name: 'Automatic Knowledge 2024 constituency boundaries',
        url: 'https://automatic-knowledge.com/',
        license: 'CC BY 4.0',
        attribution: 'Automatic Knowledge',
        coverage: '650 constituencies on 2024 boundaries',
      },
      {
        id: 'ons-census-2021',
        name: 'ONS Census 2021',
        url: 'https://www.ons.gov.uk/census',
        license: 'Open Government Licence v3.0',
        attribution: 'Office for National Statistics',
        coverage: 'England and Wales; MSOA counts aggregated to 2024 constituency boundaries with the ONS best-fit lookup',
      },
      {
        id: 'nrs-census-2022',
        name: 'Scotland’s Census 2022',
        url: 'https://www.scotlandscensus.gov.uk/2022-output-area-data/',
        license: 'Open Government Licence v3.0',
        attribution: 'National Records of Scotland',
        coverage: 'Scotland; output-area counts aggregated to UK Parliamentary Constituency 2024 with the NRS OA22_UKPC24 lookup',
      },
      {
        id: 'nisra-census-2021',
        name: 'Northern Ireland Census 2021',
        url: 'https://build.nisra.gov.uk/en/custom/data?d=PEOPLE&v=PARLCON24&v=AGE_BAND_AGG11',
        license: 'Open Government Licence v3.0',
        attribution: 'Northern Ireland Statistics and Research Agency',
        coverage: 'Northern Ireland; published Parliamentary Constituency 2024 tables aggregated from Data Zones',
      },
    ],
    caveats: [
      'The 2001 election workbook is a GitHub mirror that has not been byte-compared with the Commons Library download; its source hash is stored with the normalized input.',
      'The 2001 workbook publishes party-group totals, not named candidates, winning margins, or invalid-ballot counts; its Other category groups smaller parties.',
      'The Commons Library documents minor London and South East boundary changes before the 2001 election; the 2001 geometry must not be treated as exact 1997 geography.',
      'The 2001 Northern Ireland boundary construction uses 1993 OSNI wards against the 1995 Order, which references wards as at 1 June 1994.',
      'No 2001-to-2010 constituency overlap crosswalk is included yet; only the published 2010–2024 crosswalk describes boundary lineage.',
      'The 2010, 2015, 2017 and 2019 declared results use the same constituency boundary period. The 2024 election uses a new boundary set.',
      'The 2019 notional dataset is a published model of party votes on the 2024 boundary set. It is useful for same-boundary comparisons with 2024, but it is not a second set of declared constituency results.',
      'Census context is an area-level snapshot aggregated or published on 2024 boundaries. It does not describe the electorate in earlier elections.',
      'Census context uses 2021 data in England, Wales and Northern Ireland and 2022 data in Scotland. Northern Ireland PCON24 counts are approximated by aggregating Data Zones; Scotland OA22 counts are summed through the published OA22-to-UKPC24 lookup.',
      'Education measures are country-specific and not directly harmonized: England, Wales and Northern Ireland Level 4+ includes HNC/HND, while Scotland’s degree-level-or-above measure excludes HNC/HND.',
    ],
  };
  writeJson(join(outDir, 'elections.json'), descriptors);
  writeJson(join(outDir, 'manifest.json'), manifest);
  return { descriptors, features2001, features2010, manifest, crosswalk };
}
