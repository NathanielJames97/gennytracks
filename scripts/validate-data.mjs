import { readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'public', 'data');
const schema = JSON.parse(readFileSync(join(ROOT, 'data', 'schemas', 'election-data-v1.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const schemaRoot = { ...schema };
delete schemaRoot.$id;
const validators = Object.fromEntries(
  ['manifest', 'resultBundle', 'summary', 'featureCollection', 'crosswalk']
    .map((name) => [name, ajv.compile({ ...schemaRoot, $ref: '#/$defs/' + name })]),
);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read JSON ${path}: ${error.message}`);
  }
}

function validateShape(name, value, label) {
  const validate = validators[name];
  if (!validate(value)) {
    const issues = validate.errors
      .map((error) => `${error.instancePath || '/'} ${error.message}`)
      .join('; ');
    throw new Error(`${label} does not match schema v1: ${issues}`);
  }
}

function safeDataPath(outDir, relative) {
  if (typeof relative !== 'string' || relative.startsWith('/') || relative.includes('\\')) {
    throw new Error(`Invalid generated data path: ${relative}`);
  }
  const path = resolve(outDir, relative);
  if (!path.startsWith(resolve(outDir) + sep)) throw new Error(`Generated data path escapes data directory: ${relative}`);
  return path;
}

function keySet(values, label) {
  const keys = values.map(String);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) {
    throw new Error(`${label} contains a missing or duplicate geographic code`);
  }
  return new Set(keys);
}

function close(actual, expected, label, tolerance = 1) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: generated ${actual}, expected ${expected}`);
  }
}

function sum(records, field) {
  return records.reduce((total, record) => total + (Number.isFinite(record[field]) ? record[field] : 0), 0);
}

function assertShares(rows, groupKey, shareKey, label) {
  const totals = new Map();
  for (const row of rows) totals.set(row[groupKey], (totals.get(row[groupKey]) || 0) + row[shareKey]);
  for (const [code, value] of totals) close(value, 1, `${label} for ${code}`, 0.001);
}

/** Validate all schema-versioned JSON and its cross-file relationships. */
export function validateGeneratedData(outDir = DEFAULT_OUT) {
  const manifestPath = join(outDir, 'manifest.json');
  const manifest = readJson(manifestPath);
  validateShape('manifest', manifest, manifestPath);

  const sourceIds = keySet(manifest.sources.map((source) => source.id), 'Manifest sources');
  const boundaryById = new Map();
  for (const boundary of manifest.boundarySets) {
    if (boundaryById.has(boundary.id)) throw new Error(`Duplicate boundary set ${boundary.id}`);
    if (!sourceIds.has(boundary.sourceId)) throw new Error(`Boundary set ${boundary.id} references missing source ${boundary.sourceId}`);
    boundaryById.set(boundary.id, boundary);
  }

  const descriptorIds = keySet(manifest.elections.map((item) => item.id), 'Manifest elections');
  if (!descriptorIds.has(manifest.defaultElection)) throw new Error(`Default election ${manifest.defaultElection} is not in the catalog`);
  const allSets = new Map();
  for (const descriptor of manifest.elections) {
    const boundary = boundaryById.get(descriptor.boundarySetId);
    if (!boundary) throw new Error(`Election ${descriptor.id} references missing boundary set ${descriptor.boundarySetId}`);
    if (!sourceIds.has(descriptor.sourceId)) throw new Error(`Election ${descriptor.id} references missing source ${descriptor.sourceId}`);

    const resultPath = safeDataPath(outDir, descriptor.resultsFile);
    const summaryPath = safeDataPath(outDir, descriptor.summaryFile);
    const boundaryPath = safeDataPath(outDir, descriptor.boundariesFile);
    const bundle = readJson(resultPath);
    const summary = readJson(summaryPath);
    const collection = readJson(boundaryPath);
    validateShape('resultBundle', bundle, resultPath);
    validateShape('summary', summary, summaryPath);
    validateShape('featureCollection', collection, boundaryPath);

    if (bundle.electionId !== descriptor.id) throw new Error(`${descriptor.id} results file declares election ${bundle.electionId}`);
    if (summary.id !== descriptor.id) throw new Error(`${descriptor.id} summary file declares election ${summary.id}`);
    if (bundle.results.length !== descriptor.seats) throw new Error(`${descriptor.id} has ${bundle.results.length} result rows; manifest declares ${descriptor.seats}`);
    if (collection.features.length !== boundary.seats || boundary.seats !== descriptor.seats) {
      throw new Error(`${descriptor.id} has ${collection.features.length} boundary features; ${boundary.id} expects ${boundary.seats}`);
    }

    const resultIds = keySet(bundle.results.map((seat) => seat.id), `${descriptor.id} results`);
    const featureIds = keySet(collection.features.map((feature) => feature.properties.id), `${boundary.id} boundaries`);
    for (const feature of collection.features) {
      if (String(feature.id) !== String(feature.properties.id)) {
        throw new Error(`${boundary.id} feature id disagrees with properties.id for ${feature.properties.name}`);
      }
    }
    if (resultIds.size !== featureIds.size || [...resultIds].some((id) => !featureIds.has(id))) {
      throw new Error(`${descriptor.id} result codes do not match ${boundary.id} boundary codes`);
    }
    if (!allSets.has(boundary.id)) allSets.set(boundary.id, { ids: featureIds, file: boundaryPath });
    else {
      const established = allSets.get(boundary.id).ids;
      if (established.size !== featureIds.size || [...established].some((id) => !featureIds.has(id))) {
        throw new Error(`Boundary set ${boundary.id} is published with inconsistent feature IDs`);
      }
    }

    const results = bundle.results;
    close(summary.total, descriptor.seats, `${descriptor.id} summary seat total`, 0);
    close(sum(results, 'electorate'), summary.totals.electorate, `${descriptor.id} electorate`);
    close(sum(results, 'validVotes'), summary.totals.validVotes, `${descriptor.id} valid votes`);
    const invalidVotesKnown = results.every((seat) => Number.isFinite(seat.invalidVotes));
    if (summary.totals.invalidVotes === null) {
      if (invalidVotesKnown) throw new Error(descriptor.id + ' summary hides available invalid-vote totals');
    } else {
      if (!invalidVotesKnown) throw new Error(descriptor.id + ' summary invents unavailable invalid-vote totals');
      close(sum(results, 'invalidVotes'), summary.totals.invalidVotes, descriptor.id + ' invalid votes');
    }
    const namedCandidateCount = results.reduce((total, seat) => total + (seat.candidates || [])
      .filter((candidate) => candidate.name && !candidate.notionalAggregate).length, 0);
    close(namedCandidateCount, summary.totals.candidates, `${descriptor.id} named candidate count`);

    const seatTotals = new Map();
    for (const seat of results) seatTotals.set(seat.partyGroup, (seatTotals.get(seat.partyGroup) || 0) + 1);
    const summarySeatTotals = new Map(summary.parties.map((row) => [row.party, row.seats]));
    for (const [party, count] of seatTotals) close(summarySeatTotals.get(party) ?? 0, count, `${descriptor.id} seats for ${party}`, 0);
    close([...summarySeatTotals.values()].reduce((total, value) => total + value, 0), descriptor.seats, `${descriptor.id} summary party seats`, 0);

    const hasPartyRows = results.every((seat) => Array.isArray(seat.partyTotals) && seat.partyTotals.length > 0);
    for (const seat of results) {
      const voteRows = hasPartyRows ? seat.partyTotals : seat.candidates;
      const voteTotal = sum(voteRows || [], 'votes');
      if (descriptor.candidateDataGranularity === 'candidate') {
        if (!seat.candidates?.length) throw new Error(`${descriptor.id} ${seat.id} has no candidate rows`);
        close(voteTotal, seat.validVotes, `${descriptor.id} ${seat.id} candidate votes`);
        close(seat.candidates[0].votes, seat.winnerVotes, `${descriptor.id} ${seat.id} winner votes`);
      } else if (voteRows?.length) {
        close(voteTotal, seat.validVotes, `${descriptor.id} ${seat.id} ${hasPartyRows ? 'party' : 'aggregate'} votes`);
      }
      if (Number.isFinite(seat.majority) && Number.isFinite(seat.validVotes) && seat.majority > seat.validVotes) {
        throw new Error(`${descriptor.id} ${seat.id} majority exceeds valid votes`);
      }
    }

    const voteShareTotal = summary.voteShare.reduce((total, row) => total + row.votes, 0);
    close(voteShareTotal, summary.totals.validVotes, `${descriptor.id} national party vote total`);
  }

  const crosswalkIds = keySet(manifest.crosswalks.map((item) => item.id), 'Manifest crosswalks');
  let crosswalkLinkCount = 0;
  for (const descriptor of manifest.crosswalks) {
    if (!sourceIds.has(descriptor.sourceId)) throw new Error(`Crosswalk ${descriptor.id} references missing source ${descriptor.sourceId}`);
    if (!boundaryById.has(descriptor.fromBoundarySetId) || !boundaryById.has(descriptor.toBoundarySetId)) {
      throw new Error(`Crosswalk ${descriptor.id} references a missing boundary set`);
    }
    const crosswalkPath = safeDataPath(outDir, descriptor.file);
    const crosswalk = readJson(crosswalkPath);
    validateShape('crosswalk', crosswalk, crosswalkPath);
    if (crosswalk.sourceId !== descriptor.sourceId
      || crosswalk.fromBoundarySetId !== descriptor.fromBoundarySetId
      || crosswalk.toBoundarySetId !== descriptor.toBoundarySetId) {
      throw new Error(`Crosswalk ${descriptor.id} content disagrees with its manifest descriptor`);
    }
    const oldIds = allSets.get(descriptor.fromBoundarySetId)?.ids;
    const newIds = allSets.get(descriptor.toBoundarySetId)?.ids;
    if (!oldIds || !newIds) throw new Error(`Crosswalk ${descriptor.id} boundary sets are not present in the published election catalog`);
    const linkKeys = new Set();
    for (const row of crosswalk.overlaps) {
      if (!oldIds.has(row.fromCode) || !newIds.has(row.toCode)) {
        throw new Error(`Crosswalk ${descriptor.id} has an unknown link ${row.fromCode} -> ${row.toCode}`);
      }
      const key = `${row.fromCode}\0${row.toCode}`;
      if (linkKeys.has(key)) throw new Error(`Crosswalk ${descriptor.id} repeats link ${row.fromCode} -> ${row.toCode}`);
      linkKeys.add(key);
    }
    for (const [field, maximum] of [
      ['fromPopulationShare', 1], ['toPopulationShare', 1],
      ['fromResidentialShare', 1], ['toResidentialShare', 1],
      ['fromAreaShare', 1], ['toAreaShare', 1],
    ]) {
      for (const row of crosswalk.overlaps) {
        if (!Number.isFinite(row[field]) || row[field] < 0 || row[field] > maximum) {
          throw new Error(`Crosswalk ${descriptor.id} ${field} is outside 0–1 for ${row.fromCode} -> ${row.toCode}`);
        }
      }
    }
    for (const [field, key] of [
      ['fromPopulationShare', 'fromCode'], ['toPopulationShare', 'toCode'],
      ['fromResidentialShare', 'fromCode'], ['toResidentialShare', 'toCode'],
      ['fromAreaShare', 'fromCode'], ['toAreaShare', 'toCode'],
    ]) assertShares(crosswalk.overlaps, key, field, `Crosswalk ${descriptor.id} ${field}`);
    crosswalkLinkCount += crosswalk.overlaps.length;
  }

  return {
    elections: manifest.elections.length,
    boundarySets: boundaryById.size,
    resultRows: manifest.elections.reduce((total, item) => total + item.seats, 0),
    crosswalks: crosswalkIds.size,
    crosswalkLinks: crosswalkLinkCount,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = validateGeneratedData(process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUT);
  console.log(`Validated ${report.elections} elections, ${report.boundarySets} boundary sets, ${report.resultRows} seat rows and ${report.crosswalkLinks} links across ${report.crosswalks} crosswalks (schema v1).`);
}


