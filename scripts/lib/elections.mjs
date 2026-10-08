import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
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

const PARTY_ALIASES = new Map([
  ['Labour and Co-operative', 'Labour'],
  ['Labour and Co-operative Party', 'Labour'],
  ['Conservative and Unionist Party', 'Conservative'],
  ['Scottish National Party', 'Scottish National'],
  ['Democratic Unionist Party', 'Democratic Unionist'],
  ['Social Democratic & Labour Party', 'Social Democratic and Labour'],
  ['Green Party', 'Green'],
  ['Green Party Northern Ireland', 'Green Party NI'],
  ['Alliance Party of Northern Ireland', 'Alliance'],
  ['Plaid Cymru - The Party of Wales', 'Plaid Cymru'],
  ['The Brexit Party', 'Brexit Party'],
]);

const SWING_COLOURS = {
  Labour: '#C81B4A', Conservative: '#1F6FB4', 'Liberal Democrats': '#D98A1F',
  'Scottish National': '#C9A227', 'Reform UK': '#12B6CF',
  'Democratic Unionist': '#D46A4C', 'Sinn Féin': '#00654F',
  'Social Democratic and Labour': '#2AA82C', 'Plaid Cymru': '#005B54',
  Green: '#5EB646', Independent: '#7A7A7A',
};

function partyName(name) {
  const value = name || 'Independent';
  return PARTY_ALIASES.get(value) || value;
}

function colourForParty(name) {
  const canonical = partyName(name);
  return PARTY_COLOURS[canonical] || '#7A7A7A';
}

function assertUnique(seats, label) {
  const ids = seats.map((seat) => seat.id);
  if (seats.length !== 650 || new Set(ids).size !== 650 || ids.some((id) => !id)) {
    throw new Error(`${label} must contain 650 seats with unique geographic codes`);
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
    invalidVotes += seat.invalidVotes || 0;
    for (const candidate of seat.candidates || []) {
      candidateCount += 1;
      const candidateParty = partyName(candidate.party);
      partyVotes.set(candidateParty, (partyVotes.get(candidateParty) || 0) + (candidate.votes || 0));
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
    id: election.id,
    year: election.year,
    label: election.label,
    date: election.date,
    isNotional: Boolean(election.isNotional),
    boundarySetId: election.boundarySetId,
    total: seats.length,
    source: 'UK Parliament Election Results database',
    totals: {
      electorate, validVotes, invalidVotes, candidates: candidateCount,
      turnout: electorate ? validVotes / electorate : null,
    },
    parties, voteShare, regions, swings, marginals, majorityBands,
    memberStats: {
      reelected: seats.filter((seat) => seat.resultType === 'hold').length,
      newMPs: seats.filter((seat) => seat.member && !seat.candidates?.[0]?.formerMp).length,
      byGender: seats.reduce((result, seat) => {
        const gender = seat.memberGender || 'Unknown';
        result[gender] = (result[gender] || 0) + 1;
        return result;
      }, {}),
    },
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
      gss: id,
      country: sourceProperties.country || null,
      region: sourceProperties.region || null,
      type: sourceProperties.type || null,
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
  const boundaryPath = join(root, 'data', 'source', 'boundaries', 'constituencies-2019.geojson.gz');
  const history = JSON.parse(readFileSync(historyPath, 'utf8'));
  const boundary2019 = JSON.parse(gunzipSync(readFileSync(boundaryPath)).toString('utf8'));
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
    if (!id || !geometry) throw new Error(`Invalid 2019 boundary feature ${feature.properties.pcon19nm}`);
    return featureFor(id, feature.properties.pcon19nm || feature.properties.PCON19NM, geometry);
  });
  const features2024 = currentFeatures.map((feature) => featureFor(
    feature.properties.id, feature.properties.name, feature.geometry, feature.properties,
  ));
  const oldBoundaryIds = new Set(features2010.map((feature) => feature.properties.id));
  if (features2010.length !== 650 || oldBoundaryIds.size !== 650) {
    throw new Error('ONS 2019 boundaries must contain 650 unique constituencies');
  }

  const currentById = new Map(currentSeats.map((seat) => [seat.id, seat]));
  const id2024 = new Set(features2024.map((feature) => feature.properties.id));
  if (id2024.size !== 650 || currentById.size !== 650 || [...id2024].some((id) => !currentById.has(id))) {
    throw new Error('2024 results and 2024 boundaries do not share the same 650 geographic codes');
  }
  const historyById = new Map(history.elections.map((election) => [election.id, election]));
  const expectedHistory = ['2010', '2015', '2017', '2019', '2019-notional-2024'];
  for (const id of expectedHistory) {
    if (!historyById.has(id)) throw new Error(`Historical source is missing ${id}`);
  }
  for (const election of history.elections.filter((entry) => entry.boundarySetId === '2010')) {
    assertUnique(election.seats, election.id);
    const actual = new Set(election.seats.map((seat) => seat.id));
    if (actual.size !== oldBoundaryIds.size || [...actual].some((id) => !oldBoundaryIds.has(id))) {
      throw new Error(`${election.id} results do not match the ONS 2019 constituency geography`);
    }
  }
  const notional = historyById.get('2019-notional-2024');
  assertUnique(notional.seats, notional.id);
  if (notional.seats.some((seat) => !id2024.has(seat.id))) {
    throw new Error('Notional 2019 results do not match 2024 geographic codes');
  }
  const crosswalk = history.boundaryCrosswalk || [];
  const crosswalkFrom = new Set(crosswalk.map((row) => row.fromCode));
  const crosswalkTo = new Set(crosswalk.map((row) => row.toCode));
  if (crosswalkFrom.size !== 650 || crosswalkTo.size !== 650
    || [...oldBoundaryIds].some((id) => !crosswalkFrom.has(id))
    || [...id2024].some((id) => !crosswalkTo.has(id))) {
    throw new Error('Official 2010–2019 to 2024 boundary crosswalk does not cover both 650-seat sets');
  }

  writeJson(join(boundaryDir, '2010.geojson'), { type: 'FeatureCollection', features: features2010 });
  writeJson(join(boundaryDir, '2024.geojson'), { type: 'FeatureCollection', features: features2024 });
  writeJson(join(crosswalkDir, '2010-to-2024.json'), {
    source: 'UK Parliament Election Results constituency area overlaps',
    fromBoundarySetId: '2010', toBoundarySetId: '2024',
    sharesNote: 'Population, residential and area shares describe geographic overlap. They do not project votes.',
    overlaps: crosswalk,
  });
  // Preserve the established public paths for the latest election.
  writeJson(join(outDir, 'boundaries.geojson'), { type: 'FeatureCollection', features: currentFeatures });
  writeJson(join(outDir, 'constituencies.json'), currentSeats);
  writeJson(join(outDir, 'parties.json'), currentSummary);

  const descriptors = [];
  const addElection = (entry, seats, censusSummary = null) => {
    const descriptor = {
      id: entry.id, year: entry.year, label: entry.label || String(entry.year), date: entry.date,
      boundarySetId: entry.boundarySetId,
      isNotional: Boolean(entry.isNotional),
      seats: seats.length,
      sourceName: entry.sourceName || 'UK Parliament Election Results',
      sourceUrl: entry.sourceUrl || 'https://electionresults.parliament.uk/',
      sourceLicense: 'Open Parliament Licence v3.0',
      boundaryLabel: entry.boundarySetId === '2010'
        ? '2010–2019 constituency boundaries' : '2024 constituency boundaries',
      resultsFile: `elections/${entry.id}.json`,
      summaryFile: `elections/${entry.id}-summary.json`,
      boundariesFile: `boundaries/${entry.boundarySetId}.geojson`,
      ...(entry.isNotional ? {
        caveat: 'Modelled party totals for 2019 projected onto 2024 constituencies. These are not declared constituency results and do not identify individual candidates.',
      } : {}),
    };
    assertUnique(seats, entry.id);
    const normalizedSeats = seats.map((seat) => ({
      ...seat,
      partyOfficial: seat.partyOfficial || seat.party || seat.partyGroup,
      party: partyName(seat.party),
      partyGroup: partyName(seat.partyGroup || seat.party),
      colour: seat.colour || colourForParty(seat.partyGroup || seat.party),
      swingColour: seat.gainedFrom ? (SWING_COLOURS[partyName(seat.gainedFrom)] || '#7A7A7A') : null,
      gss: seat.gss || seat.areaCode || seat.id,
      boundarySetId: entry.boundarySetId,
      isNotional: Boolean(entry.isNotional),
      candidates: (seat.candidates || []).map((candidate) => ({
        ...candidate,
        partyOfficial: candidate.partyOfficial || candidate.party,
        party: partyName(candidate.party || 'Unspecified'),
        partyGroup: partyName(candidate.party || 'Unspecified'),
      })),
    }));
    const summary = summarize(descriptor, normalizedSeats, censusSummary);
    writeJson(join(outDir, descriptor.resultsFile), normalizedSeats);
    writeJson(join(outDir, descriptor.summaryFile), summary);
    descriptors.push(descriptor);
  };

  for (const id of expectedHistory) {
    const election = historyById.get(id);
    const label = election.isNotional ? '2019 notional · 2024 boundaries' : String(election.year);
    addElection({ ...election, label }, election.seats);
  }
  addElection({
    id: '2024', year: 2024, date: '2024-07-04', label: '2024', boundarySetId: '2024',
    sourceName: 'House of Commons Library, CBP-10009',
    sourceUrl: 'https://commonslibrary.parliament.uk/research-briefings/cbp-10009/',
  }, currentSeats, currentSummary.census);

  descriptors.sort((a, b) => a.year - b.year || Number(a.isNotional) - Number(b.isNotional));
  const manifest = {
    schemaVersion: 1,
    defaultElection: '2024',
    boundaryCrosswalkFile: 'crosswalks/2010-to-2024.json',
    elections: descriptors,
    boundarySets: [
      { id: '2010', label: '2010–2019 constituency boundaries', source: 'ONS December 2019 Generalised Constituency Boundaries' },
      { id: '2024', label: '2024 constituency boundaries', source: 'Automatic Knowledge, UK constituencies 2024' },
    ],
    sources: [
      { name: 'UK Parliament Election Results', url: 'https://electionresults.parliament.uk/', license: 'Open Parliament Licence v3.0', coverage: '2010–2024; includes the 2019 notional results on 2024 boundaries' },
      { name: 'ONS Parliamentary Constituency Boundaries, December 2019', url: 'https://geoportal.statistics.gov.uk/', license: 'Open Government Licence v3.0; contains Ordnance Survey data', coverage: '650 constituencies in the 2010–2019 boundary period' },
      { name: 'Automatic Knowledge 2024 constituency boundaries', url: 'https://automatic-knowledge.com/', license: 'CC BY 4.0', attribution: 'Automatic Knowledge', coverage: '650 constituencies on 2024 boundaries' },
      { name: 'ONS Census 2021', license: 'Open Government Licence v3.0', coverage: 'England and Wales only; aggregated to the 2024 constituency boundaries' },
    ],
    caveats: [
      'The 2010, 2015, 2017 and 2019 declared results use the same constituency boundary period. The 2024 election uses a new boundary set.',
      'The 2019 notional dataset is a published model of party votes on the 2024 boundary set. It is useful for same-boundary comparisons with 2024, but it is not a second set of declared constituency results.',
      'Census 2021 is an area-level snapshot aggregated to 2024 boundaries. It does not describe the electorate in earlier elections.',
    ],
  };
  writeJson(join(outDir, 'elections.json'), descriptors);
  writeJson(join(outDir, 'manifest.json'), manifest);
  return { descriptors, features2010, manifest, crosswalk };
}
