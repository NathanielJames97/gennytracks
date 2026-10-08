#!/usr/bin/env node
/**
 * Builds the web-ready data layer for gennytracks.
 *
 * Inputs (all committed in this repo, all previously unused by the app):
 *   data/List of MPs elected in the 2024 … - Wikipedia.html   MP table + photos
 *   data/source/constituency.geojson                         650 seat boundaries
 *
 * Outputs (regenerate with `npm run build:data`):
 *   public/data/constituencies.json   one record per seat: geojson props + MP
 *   public/data/boundaries.geojson    reprojected + simplified geometry
 *   public/data/parties.json          colour/party/region lookups for the map
 *   public/photos/<slug>.jpg          341 MP portraits, safely renamed
 *
 * The two sources are joined on constituency name. They differ in exactly one
 * respect -- the geojson capitalises mid-name "The" -- which normaliseName()
 * absorbs, so the join is a clean 650/650 with no fuzzy matching.
 *
 * Note the 64 MB source geometry deliberately lives under data/, not public/:
 * Create React App copies everything in public/ verbatim into the build output,
 * so anything sitting there ships to every visitor.
 */

import {
  readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseWikipediaHtml, normaliseName } from './lib/parse-wikipedia.mjs';
import { simplifyGeometry, countCoords, countRings } from './lib/simplify.mjs';
import { reprojectGeometry, boundsOf } from './lib/reproject.mjs';
import {
  loadConstituencyResults, loadCandidateResults, nationalTotals, partyName,
  PARTY_NAMES,
} from './lib/hoc.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const WIKI_HTML = join(
  ROOT,
  'data',
  'List of MPs elected in the 2024 United Kingdom general election - Wikipedia.html',
);
const WIKI_PHOTOS = `${WIKI_HTML.replace(/\.html$/, '')}_files`;
const SOURCE_GEOJSON = join(ROOT, 'data', 'source', 'constituency.geojson');

// Official results from House of Commons Library research brief CBP-10009.
const HOC_DIR = join(ROOT, 'data', 'source', 'hoc');
const HOC_CONSTITUENCY = join(HOC_DIR, 'constituency.csv');
const HOC_CANDIDATE = join(HOC_DIR, 'candidate.csv');

const OUT_DIR = join(ROOT, 'public', 'data');
const OUT_PHOTOS = join(ROOT, 'public', 'photos');

// Tunables for geometry simplification. These are in DEGREES and only make
// sense once the source EPSG:3857 coordinates have been reprojected to WGS84.
const SIMPLIFY = {
  tolerance: 0.002,    // degrees; ~140 m at 54 deg N, comfortably sub-pixel at zoom 7
  decimals: 5,          // ~1.1 m of coordinate precision
  minRingArea: 0.0002,  // deg^2; drops sub-pixel rocks and skerries, keeps real isles
  maxPolygons: 60,      // landmasses per seat; keeps Islay, drops the 4000 Arran rocks
};

// Party colours, as used for the swatches in the Wikipedia MPs table, so the
// map stays consistent with that source. These are display conventions rather
// than official brand values -- Green and the Northern Irish parties differ
// between sources -- so treat them as approximate.
const PARTY_COLOURS = {
  Labour: '#E4003B',
  Conservative: '#0087DC',
  'Liberal Democrats': '#FAA61A',
  'Scottish National': '#FDF38E',
  'Reform UK': '#12B6CF',
  'Democratic Unionist': '#D46A4C',
  'Sinn Féin': '#00654F',
  'Social Democratic and Labour': '#2AA82C',
  'Plaid Cymru': '#005B54',
  Green: '#5EB646',
  Independent: '#7A7A7A',
  Speaker: '#9E9E9E',
  Alliance: '#F6CB2F',
  'Ulster Unionist': '#48A5EE',
  'Traditional Unionist Voice': '#0C3A6A',
};

/**
 * The HoC "gain from X" text spells the previous holder out ("gain from Con"),
 * but its First/Second party columns use abbreviations. Resolve the spelled-out
 * name back to an abbreviation so the caller gets consistent keys.
 */
function abbrevToHoC(name) {
  const trimmed = String(name || '').trim();
  const byName = Object.entries(PARTY_NAMES).find(([, v]) => v === trimmed);
  if (byName) return byName[0];
  // Already an abbreviation, or a name with no mapping: pass through.
  return trimmed;
}

/** Diverging pair for gain maps, keyed by the party that lost the seat. */
const SWING_COLOURS = {
  Labour: '#C81B4A',
  Conservative: '#1F6FB4',
  'Liberal Democrats': '#D98A1F',
  'Scottish National': '#C9A227',
  'Reform UK': '#12B6CF',
  'Democratic Unionist': '#D46A4C',
  'Sinn Féin': '#00654F',
  'Social Democratic and Labour': '#2AA82C',
  'Plaid Cymru': '#005B54',
  Green: '#5EB646',
  Independent: '#7A7A7A',
};

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
// "how much smaller is `after` than `before`", as a positive percentage.
const pct = (after, before) => `${((1 - after / before) * 100).toFixed(1)}% smaller`;

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents: "Sinn Féin" -> "Sinn Fein"
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The source dataset is called "uk-constituencies-2024-geo-plus-hex": besides the
 * real boundary, every feature carries one extra regular hexagon from a hexbin
 * tessellation. All 650 of them are identical (7 vertices, area 1060881120 in
 * source units) and they are NOT located on their constituency -- Bradford
 * South's hexagon sits near 9 deg E, East Thanet's near 13 deg E, both out in
 * the ocean. Rendering them would smear the map, so they are stripped.
 *
 * The signature is detected rather than hard-coded, and only removed when it is
 * unambiguous: present in nearly every feature and low-vertex (so a real
 * coastline can never be mistaken for it).
 */
function detectHexOverlay(features) {
  const seen = new Map(); // signature -> { count, area, verts }
  for (const f of features) {
    const g = f.geometry;
    if (!g || g.type !== 'MultiPolygon') continue;
    for (const poly of g.coordinates) {
      const ring = poly[0];
      if (!ring || ring.length > 12) continue;
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
      }
      const key = `${ring.length}@${Math.abs(a / 2).toFixed(0)}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }

  let best = null;
  for (const [key, count] of seen) {
    if (count / features.length < 0.9) continue;
    if (!best || count > best.count) best = { key, count };
  }
  if (!best) return null;

  const verts = Number(best.key.split('@')[0]);
  if (verts > 12) return null;
  return { ...best, verts };
}

/** Drop the hexbin overlay polygons from a feature's geometry. */
function stripHexOverlay(feature, hex) {
  if (!hex || feature.geometry?.type !== 'MultiPolygon') return feature.geometry;
  const kept = feature.geometry.coordinates.filter((poly) => {
    const ring = poly[0];
    if (!ring || ring.length > 12) return true;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
    }
    return `${ring.length}@${Math.abs(a / 2).toFixed(0)}` !== hex.key;
  });
  if (!kept.length) return null;
  return feature.geometry.type === 'MultiPolygon'
    ? { type: 'MultiPolygon', coordinates: kept }
    : { type: 'Polygon', coordinates: kept[0] };
}

function main() {
  console.log('gennytracks :: building data layer\n');

  // ---------------------------------------------------------------- parse
  const { records: mps, problems } = parseWikipediaHtml(WIKI_HTML);
  if (problems.length) {
    console.warn(`  ! ${problems.length} row(s) skipped:`);
    problems.slice(0, 5).forEach((p) => console.warn(`      row ${p.row}: ${p.reason}`));
  }
  console.log(`  parsed        ${mps.length} MP records from Wikipedia`);

  // --------------------------------------------------------------- geometry
  // The source declares EPSG:3857 (Web Mercator metres). Reproject to WGS84
  // degrees before simplifying, so tolerances and area thresholds are in real
  // map units and Leaflet can render the result.
  const raw = JSON.parse(readFileSync(SOURCE_GEOJSON, 'utf8'));
  const rawBytes = readFileSync(SOURCE_GEOJSON).length;
  const rawCoords = raw.features.reduce((n, f) => n + countCoords(f.geometry), 0);
  const rawRings = raw.features.reduce((n, f) => n + countRings(f.geometry), 0);
  const srcBounds = boundsOf(raw);
  console.log(`  loaded        ${raw.features.length} features, ${mb(rawBytes)}`);
  console.log(`  source crs    ${raw.crs?.properties?.name || 'undeclared'}`);
  console.log(`  source bounds ${srcBounds.map((n) => n.toFixed(0)).join(', ')}`);

  // ------------------------------------------------------------------ join
  const hex = detectHexOverlay(raw.features);
  if (hex) {
    console.log(`  hex overlay   stripping ${hex.key} (found in ${hex.count}/${raw.features.length} features)`);
  } else {
    console.log('  hex overlay   none detected');
  }

  // ------------------------------------------------------ official results
  // House of Commons Library verified declarations. These carry the vote data
  // the Wikipedia table lacks entirely: electorate, turnout, per-party votes,
  // majority and swing. Where the two sources overlap, HoC wins; Wikipedia is
  // kept for MP portraits and article prose that HoC does not publish.
  const hocSeats = loadConstituencyResults(HOC_CONSTITUENCY);
  const hocCandidates = loadCandidateResults(HOC_CANDIDATE);
  const national = nationalTotals(hocCandidates);
  const hocByKey = new Map(hocSeats.map((s) => [normaliseName(s.name), s]));
  console.log(`  hoc seats     ${hocSeats.length} rows, ${national.parties.length} parties`);
  console.log(`  hoc candidates ${hocCandidates.size} seats covered (${[...hocCandidates.values()].reduce((n, l) => n + l.length, 0)} candidates)`);

  const byKey = new Map(mps.map((m) => [m.key, m]));
  const unmatched = [];
  const missingHoc = [];
  const seen = new Set();
  const features = [];
  const seatRecords = [];
  let hexStripped = 0;

  for (const f of raw.features) {
    const p = f.properties;
    const key = normaliseName(p.Name);
    const mp = byKey.get(key);
    if (!mp) { unmatched.push(p.Name); continue; }
    if (seen.has(key)) { unmatched.push(`${p.Name} (duplicate)`); continue; }
    seen.add(key);

    const hoc = hocByKey.get(key);
    if (!hoc) missingHoc.push(p.Name);

    const before = f.geometry?.coordinates?.length ?? 0;
    const cleaned = stripHexOverlay(f, hex);
    if (hex && cleaned && (cleaned.coordinates?.length ?? 0) < before) hexStripped += 1;

    const geometry = simplifyGeometry(reprojectGeometry(cleaned), SIMPLIFY);
    if (!geometry) continue; // entirely sub-pixel seat: nothing to draw

    const partyGroup = mp.partyGroup;
    const colour = mp.colour || PARTY_COLOURS[partyGroup] || '#7A7A7A';

    // CTR_REG only covers the English regions in the source; the 107 Scottish,
    // Welsh and Northern Irish seats come through blank. Country is the level
    // those are conventionally reported at, so use it as the fallback. HoC
    // names all four nations consistently, so prefer it where available.
    const region = hoc?.region || p.CTR_REG || p.Country || null;

    // Share of the vote for the winning party, and the gap to the runner-up.
    const votes = hoc?.votes ?? null;
    const winnerVotes = hoc ? (votes[hoc.firstParty] ?? null) : null;
    const winnerShare = hoc && hoc.validTotal && winnerVotes
      ? winnerVotes / hoc.validTotal
      : null;

    const record = {
      id: key,
      name: p.Name,
      region,
      regionCode: p.CRCODE || null,
      country: hoc?.country || p.Country,
      gss: p.GSScode,
      type: p.Type,
      // Electorate: HoC is the declared figure and differs slightly from the
      // ONS register snapshot in the boundary file.
      electorate: hoc?.electorate ?? p.Electorate,
      member: hoc?.member || mp.member,
      memberGender: hoc?.memberGender ?? null,
      memberWiki: mp.memberWiki,
      memberSort: mp.memberSort,
      party: mp.party,
      partyGroup,
      colour,
      photo: null, // filled in during the photo pass
      notes: mp.notes,
      // --- results, from HoC ---
      result: hoc?.result ?? null,
      resultType: hoc?.resultType ?? null,
      firstParty: hoc ? partyName(hoc.firstParty) : partyGroup,
      firstPartyAbbrev: hoc?.firstParty ?? null,
      secondParty: hoc ? partyName(hoc.secondParty) : null,
      secondPartyAbbrev: hoc?.secondParty ?? null,
      gainedFrom: hoc?.lost ? partyName(abbrevToHoC(hoc.lost)) : null,
      majority: hoc?.majority ?? null,
      majorityShare: hoc && hoc.validTotal ? (hoc.majority ?? 0) / hoc.validTotal : null,
      validVotes: hoc?.validVotes ?? null,
      invalidVotes: hoc?.invalidVotes ?? null,
      turnout: hoc?.turnout ?? null,
      winnerVotes,
      winnerShare,
      votes: votes ?? undefined,
      declarationTime: hoc?.declarationTime ?? null,
      candidates: (hocCandidates.get(p.Name) ?? []).map((c) => ({
        name: c.name,
        party: c.party,
        abbrev: c.abbrev,
        gender: c.gender,
        votes: c.votes,
        share: c.share,
        change: c.change,
        sittingMp: c.sittingMp,
        formerMp: c.formerMp,
      })),
    };

    seatRecords.push(record);

    features.push({
      type: 'Feature',
      id: p.fid,
      properties: {
        id: key,
        name: p.Name,
        region,
        regionCode: p.CRCODE || null,
        country: record.country,
        gss: p.GSScode,
        type: p.Type,
        electorate: record.electorate,
        member: record.member,
        memberWiki: mp.memberWiki,
        memberSort: mp.memberSort,
        party: mp.party,
        partyGroup,
        colour,
        // Second colour used by the swing map: the party that lost the seat.
        swingFrom: record.gainedFrom,
        swingColour: record.gainedFrom ? (SWING_COLOURS[record.gainedFrom] ?? '#7A7A7A') : null,
        resultType: record.resultType,
        winnerShare: record.winnerShare,
        majority: record.majority,
        turnout: record.turnout,
        photo: null, // filled in during the photo pass
        notes: mp.notes,
      },
      geometry,
    });
  }

  const orphanMps = mps.filter((m) => !seen.has(m.key));
  console.log(`  joined        ${features.length}/${raw.features.length} seats matched`);
  if (hex) console.log(`  hex removed   from ${hexStripped} features`);
  if (unmatched.length) {
    console.warn(`  ! geojson seats with no MP row: ${unmatched.join(', ')}`);
  }
  if (missingHoc.length) {
    console.warn(`  ! seats with no HoC results row: ${missingHoc.join(', ')}`);
  }
  if (orphanMps.length) {
    console.warn(`  ! MP rows with no geojson seat: ${orphanMps.map((m) => m.constituency).join(', ')}`);
  }

  // ----------------------------------------------------------------- photos
  rmSync(OUT_PHOTOS, { recursive: true, force: true });
  mkdirSync(OUT_PHOTOS, { recursive: true });
  const usedSlugs = new Map();
  let copied = 0;
  let missing = 0;

  for (const f of features) {
    const mp = mps.find((m) => m.key === f.properties.id);
    if (!mp || !mp.photoFile) continue;
    const src = join(WIKI_PHOTOS, mp.photoFile);
    if (!existsSync(src)) { missing += 1; continue; }

    let slug = slugify(f.properties.member || mp.photoFile.replace(/\.jpg$/i, ''));
    // Two distinct MPs can share a name after slugification; disambiguate.
    if (usedSlugs.has(slug)) {
      const n = usedSlugs.get(slug) + 1;
      usedSlugs.set(slug, n);
      slug = `${slug}-${n}`;
    } else {
      usedSlugs.set(slug, 1);
    }

    copyFileSync(src, join(OUT_PHOTOS, `${slug}.jpg`));
    f.properties.photo = `photos/${slug}.jpg`;
    copied += 1;
  }
  console.log(`  photos        ${copied} copied, ${missing} source files missing`);

  // ------------------------------------------------------------------ write
  mkdirSync(OUT_DIR, { recursive: true });

  const boundaries = { type: 'FeatureCollection', features };
  const outBounds = boundsOf(boundaries);
  const boundaryJson = JSON.stringify(boundaries);
  writeFileSync(join(OUT_DIR, 'boundaries.geojson'), boundaryJson);

  // The companion index carries no geometry, so the app can load a modest file
  // for lists, search, filtering and charts, and pull boundaries.geojson only
  // when the map needs it.
  const indexJson = JSON.stringify(seatRecords);
  writeFileSync(join(OUT_DIR, 'constituencies.json'), indexJson);

  // --- summary: seat counts, vote shares, regions, swing, marginals --------
  const seats = {};
  for (const s of seatRecords) {
    const g = s.partyGroup;
    if (!seats[g]) {
      seats[g] = { party: g, seats: 0, gains: 0, holds: 0, colour: s.colour };
    }
    seats[g].seats += 1;
    if (s.resultType === 'gain') seats[g].gains += 1;
    else seats[g].holds += 1;
  }
  const parties = Object.values(seats).sort((a, b) => b.seats - a.seats);

  // Nationwide vote share, which is a different ordering from seats: Reform UK
  // won 5 seats on 14.3% of the vote, the Lib Dems 72 on 12.2%.
  const voteShare = national.parties.map((p) => ({
    abbrev: p.abbrev,
    party: p.name,
    votes: p.votes,
    share: p.share,
    seats: seats[p.name]?.seats ?? 0,
    colour: PARTY_COLOURS[p.name] ?? '#7A7A7A',
  }));

  const regionRows = new Map();
  for (const s of seatRecords) {
    const r = s.region || 'Unknown';
    if (!regionRows.has(r)) {
      regionRows.set(r, { region: r, country: s.country, seats: 0, electorate: 0, validVotes: 0, parties: {} });
    }
    const row = regionRows.get(r);
    row.seats += 1;
    row.electorate += s.electorate ?? 0;
    row.validVotes += s.validVotes ?? 0;
    row.parties[s.partyGroup] = (row.parties[s.partyGroup] ?? 0) + 1;
  }
  const regions = [...regionRows.values()]
    .map((r) => ({
      ...r,
      turnout: r.electorate ? r.validVotes / r.electorate : null,
    }))
    .sort((a, b) => b.seats - a.seats);

  // Seat-to-seat movement: which parties took seats from whom.
  const swingMatrix = {};
  for (const s of seatRecords) {
    if (s.resultType !== 'gain' || !s.gainedFrom) continue;
    const key = `${s.partyGroup}<-${s.gainedFrom}`;
    swingMatrix[key] = (swingMatrix[key] ?? 0) + 1;
  }
  const swings = Object.entries(swingMatrix)
    .map(([key, count]) => {
      const [won, lost] = key.split('<-');
      return { from: lost, to: won, count };
    })
    .sort((a, b) => b.count - a.count);

  // Marginals: closest races, ranked by the winner's margin over the runner-up.
  const marginals = seatRecords
    .filter((s) => Number.isFinite(s.majority))
    .sort((a, b) => a.majority - b.majority)
    .slice(0, 50)
    .map((s) => ({
      id: s.id, name: s.name, region: s.region,
      majority: s.majority, majorityShare: s.majorityShare,
      party: s.partyGroup, colour: s.colour, member: s.member,
    }));

  // Distribution of majorities as a share of votes cast, for the histogram.
  const majorityBands = [
    { label: '0-1k', min: 0, max: 1000 },
    { label: '1-2k', min: 1000, max: 2000 },
    { label: '2-5k', min: 2000, max: 5000 },
    { label: '5-10k', min: 5000, max: 10000 },
    { label: '10-15k', min: 10000, max: 15000 },
    { label: '15k+', min: 15000, max: Infinity },
  ].map((b) => ({
    ...b,
    max: Number.isFinite(b.max) ? b.max : null,
    seats: seatRecords.filter((s) => Number.isFinite(s.majority) && s.majority >= b.min && s.majority < b.max).length,
  }));

  const summary = {
    total: seatRecords.length,
    generated: '2024 general election, 4 July',
    source: 'House of Commons Library, CBP-10009',
    totals: {
      electorate: seatRecords.reduce((n, s) => n + (s.electorate ?? 0), 0),
      validVotes: national.votes,
      invalidVotes: seatRecords.reduce((n, s) => n + (s.invalidVotes ?? 0), 0),
      candidates: [...hocCandidates.values()].reduce((n, l) => n + l.length, 0),
      turnout: national.votes / seatRecords.reduce((n, s) => n + (s.electorate ?? 0), 0),
    },
    parties,
    voteShare,
    regions,
    swings,
    marginals,
    majorityBands,
    // Incumbency: how many winners were sitting MPs, first-timers, etc.
    memberStats: {
      reelected: seatRecords.filter((s) => s.resultType === 'hold').length,
      newMPs: [...hocCandidates.values()]
        .filter((l) => l[0] && !l[0].formerMp)
        .length,
      byGender: seatRecords.reduce((acc, s) => {
        const g = s.memberGender || 'Unknown';
        acc[g] = (acc[g] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };

  const summaryJson = JSON.stringify(summary, null, 1);
  writeFileSync(join(OUT_DIR, 'parties.json'), summaryJson);

  // ----------------------------------------------------------------- report
  const outCoords = features.reduce((n, f) => n + countCoords(f.geometry), 0);
  const outRings = features.reduce((n, f) => n + countRings(f.geometry), 0);
  const boundaryBytes = Buffer.byteLength(boundaryJson);
  const indexBytes = Buffer.byteLength(indexJson);

  const summaryBytes = Buffer.byteLength(summaryJson);
  console.log('\n  output');
  console.log(`    boundaries.geojson    ${mb(boundaryBytes).padStart(9)}  ${pct(boundaryBytes, rawBytes)} vs source`);
  console.log(`    constituencies.json   ${mb(indexBytes).padStart(9)}  ${seatRecords.length} seats + candidates, no geometry`);
  console.log(`    parties.json          ${mb(summaryBytes).padStart(9)}  totals, vote shares, regions, swing, marginals`);
  console.log(`\n  coordinates  ${rawCoords.toLocaleString()} -> ${outCoords.toLocaleString()} (${pct(outCoords, rawCoords)})`);
  console.log(`  rings        ${rawRings.toLocaleString()} -> ${outRings.toLocaleString()}`);
  console.log(`  wgs84 bounds ${outBounds.map((n) => n.toFixed(3)).join(', ')}`);
  console.log(`  combined payload ${mb(boundaryBytes + indexBytes + summaryBytes)} (was ${mb(rawBytes)})`);
  console.log(`\n  turnout      ${(summary.totals.turnout * 100).toFixed(1)}% of ${summary.totals.electorate.toLocaleString()} electors`);
  console.log(`  seats        ${parties.filter((p) => p.seats > 0).length} parties, ${swings.length} distinct seat flows`);
  console.log(`  marginals    ${summary.majorityBands.map((b) => `${b.label}:${b.seats}`).join('  ')}\n`);

  // A reprojection mistake is silent and catastrophic (a map that renders in the
  // ocean), so assert the UK actually lands where the UK is.
  const [w, s, e, n] = outBounds;
  if (w < -11 || e > 3 || s < 49 || n > 61) {
    throw new Error(
      `Reprojection looks wrong: bounds ${outBounds.join(', ')} are not the UK`,
    );
  }

  // --- assertions -----------------------------------------------------------
  // Everything below has bitten in practice: a silent regression here produces
  // a map that looks plausible but is wrong.

  const totalSeats = parties.reduce((n, p) => n + p.seats, 0);
  if (totalSeats !== seatRecords.length) {
    throw new Error(`Party seat counts sum to ${totalSeats}, expected ${seatRecords.length}`);
  }
  if (seatRecords.length !== 650) {
    throw new Error(`Expected 650 seats, got ${seatRecords.length}`);
  }

  // Published totals for the 2024 general election. If these drift, the source
  // files changed shape and the parse needs revisiting.
  const EXPECTED = {
    electorate: 48224212,
    validVotes: 28809340,
  };
  if (summary.totals.electorate !== EXPECTED.electorate) {
    throw new Error(
      `Electorate ${summary.totals.electorate.toLocaleString()} != published ${EXPECTED.electorate.toLocaleString()}`,
    );
  }
  if (national.votes !== EXPECTED.validVotes) {
    throw new Error(
      `Valid votes ${national.votes.toLocaleString()} != published ${EXPECTED.validVotes.toLocaleString()}`,
    );
  }

  // The declared seat counts, so a party-mapping mistake cannot pass silently.
  const EXPECTED_SEATS = {
    Labour: 411, Conservative: 121, 'Liberal Democrats': 72, 'Scottish National': 9,
    'Sinn Féin': 7, Independent: 6, 'Reform UK': 5, 'Democratic Unionist': 5,
    Green: 4, 'Plaid Cymru': 4, 'Social Democratic and Labour': 2, Speaker: 1,
    Alliance: 1, 'Traditional Unionist Voice': 1, 'Ulster Unionist': 1,
  };
  for (const [party, expected] of Object.entries(EXPECTED_SEATS)) {
    const actual = parties.find((p) => p.party === party)?.seats ?? 0;
    if (actual !== expected) {
      throw new Error(`${party}: ${actual} seats, expected ${expected}`);
    }
  }

  // Per-seat vote arithmetic: the winner's votes must exceed the majority, and
  // the majority must not exceed the votes cast.
  let badArithmetic = 0;
  for (const s of seatRecords) {
    if (!Number.isFinite(s.majority) || !Number.isFinite(s.validVotes)) continue;
    if (s.majority > s.validVotes || s.winnerVotes < s.majority) badArithmetic += 1;
  }
  if (badArithmetic) {
    throw new Error(`${badArithmetic} seat(s) have inconsistent vote arithmetic`);
  }

  // Every seat should carry at least two candidates, so a "majority" is defined.
  const thin = seatRecords.filter((s) => (s.candidates?.length ?? 0) < 2);
  if (thin.length) {
    console.warn(`  ! ${thin.length} seat(s) have fewer than 2 candidates`);
  }

  console.log('  checks        650 seats, published totals and seat counts all match\n');
}

main();
