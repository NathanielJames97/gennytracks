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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const WIKI_HTML = join(
  ROOT,
  'data',
  'List of MPs elected in the 2024 United Kingdom general election - Wikipedia.html',
);
const WIKI_PHOTOS = `${WIKI_HTML.replace(/\.html$/, '')}_files`;
const SOURCE_GEOJSON = join(ROOT, 'data', 'source', 'constituency.geojson');

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

// Canonical colours. Wikipedia supplies a swatch per row, but the Speaker has
// none, so every party also needs a fallback for records the article omits.
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

  const byKey = new Map(mps.map((m) => [m.key, m]));
  const unmatched = [];
  const seen = new Set();
  const features = [];
  let hexStripped = 0;

  for (const f of raw.features) {
    const p = f.properties;
    const key = normaliseName(p.Name);
    const mp = byKey.get(key);
    if (!mp) { unmatched.push(p.Name); continue; }
    if (seen.has(key)) { unmatched.push(`${p.Name} (duplicate)`); continue; }
    seen.add(key);

    const before = f.geometry?.coordinates?.length ?? 0;
    const cleaned = stripHexOverlay(f, hex);
    if (hex && cleaned && (cleaned.coordinates?.length ?? 0) < before) hexStripped += 1;

    const geometry = simplifyGeometry(reprojectGeometry(cleaned), SIMPLIFY);
    if (!geometry) continue; // entirely sub-pixel seat: nothing to draw

    const colour = mp.colour || PARTY_COLOURS[mp.partyGroup] || '#7A7A7A';

    // CTR_REG only covers the English regions in the source; the 107 Scottish,
    // Welsh and Northern Irish seats come through blank. Country is the level
    // those are conventionally reported at, so use it as the fallback.
    const region = p.CTR_REG || p.Country || null;

    features.push({
      type: 'Feature',
      id: p.fid,
      properties: {
        id: key,
        name: p.Name,
        region,
        regionCode: p.CRCODE || null,
        country: p.Country,
        gss: p.GSScode,
        type: p.Type,
        electorate: p.Electorate,
        member: mp.member,
        memberWiki: mp.memberWiki,
        memberSort: mp.memberSort,
        party: mp.party,
        partyGroup: mp.partyGroup,
        colour,
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

  // The companion index omits geometry entirely, so the app can load a small
  // file for lists/search/colouring and pull boundaries.geojson only for the map.
  const index = features.map((f) => f.properties);
  writeFileSync(join(OUT_DIR, 'constituencies.json'), JSON.stringify(index, null, 0));

  const seats = {};
  for (const p of index) {
    const g = p.partyGroup;
    if (!seats[g]) seats[g] = { party: g, seats: 0, colour: p.colour };
    seats[g].seats += 1;
  }
  const parties = Object.values(seats).sort((a, b) => b.seats - a.seats);

  const regionSeats = {};
  for (const p of index) {
    const r = p.region || 'Unknown';
    regionSeats[r] = (regionSeats[r] || 0) + 1;
  }
  const regions = Object.entries(regionSeats)
    .map(([region, n]) => ({ region, seats: n }))
    .sort((a, b) => b.seats - a.seats);

  writeFileSync(
    join(OUT_DIR, 'parties.json'),
    JSON.stringify({ total: index.length, parties, regions }, null, 2),
  );

  // ----------------------------------------------------------------- report
  const outCoords = features.reduce((n, f) => n + countCoords(f.geometry), 0);
  const outRings = features.reduce((n, f) => n + countRings(f.geometry), 0);
  const boundaryBytes = Buffer.byteLength(boundaryJson);
  const indexBytes = Buffer.byteLength(JSON.stringify(index));

  console.log('\n  output');
  console.log(`    boundaries.geojson    ${mb(boundaryBytes).padStart(9)}  ${pct(boundaryBytes, rawBytes)} vs source`);
  console.log(`    constituencies.json   ${mb(indexBytes).padStart(9)}  ${index.length} seats, no geometry`);
  console.log(`    parties.json          ${mb(Buffer.byteLength(JSON.stringify(parties))).padStart(9)}  ${parties.length} parties`);
  console.log(`\n  coordinates  ${rawCoords.toLocaleString()} -> ${outCoords.toLocaleString()} (${pct(outCoords, rawCoords)})`);
  console.log(`  rings        ${rawRings.toLocaleString()} -> ${outRings.toLocaleString()}`);
  console.log(`  wgs84 bounds ${outBounds.map((n) => n.toFixed(3)).join(', ')}`);
  console.log(`  combined payload ${mb(boundaryBytes + indexBytes)} (was ${mb(rawBytes)})\n`);

  // A reprojection mistake is silent and catastrophic (a map that renders in the
  // ocean), so assert the UK actually lands where the UK is.
  const [w, s, e, n] = outBounds;
  if (w < -11 || e > 3 || s < 49 || n > 61) {
    throw new Error(
      `Reprojection looks wrong: bounds ${outBounds.join(', ')} are not the UK`,
    );
  }

  const totalSeats = parties.reduce((n, p) => n + p.seats, 0);
  if (totalSeats !== index.length) {
    throw new Error(`Party seat counts sum to ${totalSeats}, expected ${index.length}`);
  }
  if (index.length !== 650) {
    console.warn(`  ! expected 650 seats, got ${index.length}`);
  }
}

main();
