#!/usr/bin/env node
/**
 * Prepare compact 2001 constituency boundaries from public source material.
 * The ONS archive is an ignored local preparation input; the reviewed output
 * is committed so ordinary builds need neither GIS tooling nor the archive.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { simplifyGeometry } from './lib/simplify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data', 'source', 'boundaries');
const ZIP_PATH = join(DIR, 'uk-parliament-2001-2005-gb.zip');
const WARDS_PATH = join(DIR, 'northern-ireland-wards-1993.geojson');
const ORDER_PATH = join(DIR, 'parliamentary-constituencies-ni-1995.xml');
const OUTPUT = join(DIR, 'constituencies-2001.geojson.gz');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function zipEntries(buffer, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const floor = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ONS archive has no ZIP directory record');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const found = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Malformed ONS ZIP directory');
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const key = name.toLowerCase();
    if (wanted.has(key)) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Malformed ZIP entry ' + name);
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(start, start + size);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) data = inflateRawSync(compressed);
      else throw new Error('Unsupported ZIP compression method ' + method + ' for ' + name);
      found.set(key, data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  for (const name of wanted) if (!found.has(name)) throw new Error('ONS archive is missing ' + name);
  return found;
}

function parseDbf(buffer) {
  const rowCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const decoder = new TextDecoder('windows-1252');
  const fields = [];
  for (let offset = 32; offset < headerLength && buffer[offset] !== 0x0d; offset += 32) {
    const descriptor = buffer.subarray(offset, offset + 32);
    const zero = descriptor.indexOf(0);
    fields.push({
      name: decoder.decode(descriptor.subarray(0, zero < 0 ? 11 : zero)).trim(),
      length: descriptor[16],
    });
  }
  const rows = [];
  for (let row = 0; row < rowCount; row++) {
    let offset = headerLength + row * recordLength;
    if (buffer[offset] === 0x2a) continue;
    offset += 1;
    const values = {};
    for (const field of fields) {
      values[field.name] = decoder.decode(buffer.subarray(offset, offset + field.length)).trim();
      offset += field.length;
    }
    rows.push(values);
  }
  return rows;
}

function signedArea(ring) {
  let value = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    value += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return value / 2;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if ((y1 > point[1]) !== (y2 > point[1])
      && point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function bngToWgs84([east, north]) {
  const a = 6377563.396;
  const b = 6356256.909;
  const f0 = 0.9996012717;
  const lat0 = 49 * Math.PI / 180;
  const lon0 = -2 * Math.PI / 180;
  const n0 = -100000;
  const e0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  let lat = lat0;
  let meridional = 0;
  let delta = north - n0 - meridional;
  while (Math.abs(delta) > 0.00001) {
    lat += delta / (a * f0);
    const d = lat - lat0;
    const p = lat + lat0;
    meridional = b * f0 * (
      (1 + n + 5 / 4 * n ** 2 + 5 / 4 * n ** 3) * d
      - (3 * n + 3 * n ** 2 + 21 / 8 * n ** 3) * Math.sin(d) * Math.cos(p)
      + (15 / 8 * n ** 2 + 15 / 8 * n ** 3) * Math.sin(2 * d) * Math.cos(2 * p)
      - 35 / 24 * n ** 3 * Math.sin(3 * d) * Math.cos(3 * p)
    );
    delta = north - n0 - meridional;
  }

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);
  const nu = a * f0 / Math.sqrt(1 - e2 * sinLat ** 2);
  const rho = a * f0 * (1 - e2) / (1 - e2 * sinLat ** 2) ** 1.5;
  const eta2 = nu / rho - 1;
  const de = east - e0;
  const vii = tanLat / (2 * rho * nu);
  const viii = tanLat / (24 * rho * nu ** 3) * (5 + 3 * tanLat ** 2 + eta2 - 9 * tanLat ** 2 * eta2);
  const ix = tanLat / (720 * rho * nu ** 5) * (61 + 90 * tanLat ** 2 + 45 * tanLat ** 4);
  const x = 1 / (cosLat * nu);
  const xi = 1 / (cosLat * 6 * nu ** 3) * (nu / rho + 2 * tanLat ** 2);
  const xii = 1 / (cosLat * 120 * nu ** 5) * (5 + 28 * tanLat ** 2 + 24 * tanLat ** 4);
  const xiiia = 1 / (cosLat * 5040 * nu ** 7) * (61 + 662 * tanLat ** 2 + 1320 * tanLat ** 4 + 720 * tanLat ** 6);
  const phi = lat - vii * de ** 2 + viii * de ** 4 - ix * de ** 6;
  const lambda = lon0 + x * de - xi * de ** 3 + xii * de ** 5 - xiiia * de ** 7;

  const eAiry = 1 - (b * b) / (a * a);
  const nuAiry = a / Math.sqrt(1 - eAiry * Math.sin(phi) ** 2);
  const X = nuAiry * Math.cos(phi) * Math.cos(lambda);
  const Y = nuAiry * Math.cos(phi) * Math.sin(lambda);
  const Z = nuAiry * (1 - eAiry) * Math.sin(phi);
  const arcsec = Math.PI / (180 * 3600);
  const rx = 0.1502 * arcsec;
  const ry = 0.2470 * arcsec;
  const rz = 0.8421 * arcsec;
  const scale = 1 - 20.4894e-6;
  const Xw = 446.448 + scale * X - rz * Y + ry * Z;
  const Yw = -125.157 + rz * X + scale * Y - rx * Z;
  const Zw = 542.060 - ry * X + rx * Y + scale * Z;
  const wa = 6378137;
  const wb = 6356752.3141;
  const we2 = 1 - (wb * wb) / (wa * wa);
  const wLon = Math.atan2(Yw, Xw);
  const horizontal = Math.hypot(Xw, Yw);
  let wLat = Math.atan2(Zw, horizontal * (1 - we2));
  for (let i = 0; i < 8; i++) {
    const wNu = wa / Math.sqrt(1 - we2 * Math.sin(wLat) ** 2);
    wLat = Math.atan2(Zw + we2 * wNu * Math.sin(wLat), horizontal);
  }
  return [wLon * 180 / Math.PI, wLat * 180 / Math.PI];
}

function geometryFromRings(rings, label) {
  const sorted = rings.map((ring) => ({ ring, area: Math.abs(signedArea(ring)) }))
    .sort((left, right) => right.area - left.area);
  const processed = [];
  const polygons = [];
  for (const item of sorted) {
    const parents = processed.filter((candidate) => candidate.area > item.area
      && pointInRing(item.ring[0], candidate.ring))
      .sort((left, right) => left.area - right.area);
    const parent = parents[0] || null;
    const depth = parent ? parent.depth + 1 : 0;
    const ccw = (ring) => (Math.sign(signedArea(ring)) > 0 ? ring : ring.slice().reverse());
    const cw = (ring) => (Math.sign(signedArea(ring)) < 0 ? ring : ring.slice().reverse());
    const node = { ring: item.ring, area: item.area, depth, polygonRoot: null };
    if (depth % 2 === 0) {
      node.polygonRoot = node;
      node.polygon = [ccw(item.ring)];
      polygons.push(node.polygon);
    } else {
      node.polygonRoot = parent.polygonRoot;
      if (!node.polygonRoot?.polygon) throw new Error(label + ' has an uncontained hole');
      node.polygonRoot.polygon.push(cw(item.ring));
    }
    processed.push(node);
  }
  if (!polygons.length) throw new Error(label + ' contains no outer rings');
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function geometryFromShapeRecord(record, label) {
  const type = record.readInt32LE(0);
  if (type !== 5) throw new Error(label + ' has unsupported polygon type ' + type);
  const partCount = record.readInt32LE(36);
  const pointCount = record.readInt32LE(40);
  const partOffset = 44;
  const pointOffset = partOffset + partCount * 4;
  const starts = Array.from({ length: partCount }, (_, i) => record.readInt32LE(partOffset + i * 4));
  const points = Array.from({ length: pointCount }, (_, i) => bngToWgs84([
    record.readDoubleLE(pointOffset + i * 16),
    record.readDoubleLE(pointOffset + i * 16 + 8),
  ]));
  const rings = starts.map((start, i) => points.slice(start, starts[i + 1] ?? pointCount));
  for (const ring of rings) {
    if (ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) {
      throw new Error(label + ' contains an open shapefile ring');
    }
  }
  return geometryFromRings(rings, label);
}

function readGbFeatures(zip) {
  const prefix = 'pcon_dec_2001_gb_bfe';
  const files = zipEntries(zip, [prefix + '.shp', prefix + '.dbf']);
  const shp = files.get(prefix + '.shp');
  const rows = parseDbf(files.get(prefix + '.dbf'));
  if (rows.length !== 641) throw new Error('ONS layer has ' + rows.length + ' rows, expected 641');
  const features = [];
  let offset = 100;
  let row = 0;
  while (offset < shp.length) {
    const size = shp.readInt32BE(offset + 4) * 2;
    const start = offset + 8;
    const record = shp.subarray(start, start + size);
    const data = rows[row];
    if (!data) throw new Error('ONS shapefile has extra shapes at row ' + (row + 1));
    const sourceCode = data.PCON01CD;
    const name = data.PCON01NM;
    if (!sourceCode || !name) throw new Error('ONS DBF row ' + (row + 1) + ' has no code/name');
    const geometry = simplifyGeometry(geometryFromShapeRecord(record, name), {
      tolerance: 0.001, decimals: 5, minRingArea: 0.00008, maxPolygons: 80,
    });
    if (!geometry) throw new Error('No simplified geometry for ' + name);
    const id = 'PCON01-' + sourceCode;
    features.push({
      type: 'Feature', id,
      properties: { id, name, gss: null, country: null, region: null, type: 'constituency', sourceCode },
      geometry,
    });
    row += 1;
    offset = start + size;
  }
  if (row !== rows.length || new Set(features.map((feature) => feature.properties.sourceCode)).size !== 641) {
    throw new Error('ONS 2001 shapes and unique codes do not match 641 DBF rows');
  }
  return features;
}

function xmlText(value) {
  return value.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&apos;|&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

function norm(value) {
  return xmlText(String(value)).normalize('NFKD').replace(/\p{Diacritic}/gu, '')
    .replace(/['\u2018\u2019]/g, '').replace(/[^\p{L}\p{N},;]+/gu, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function splitWardList(raw, district) {
  let remaining = norm(raw).replace(/;\s*and\s*$/i, '').replace(/[.;]$/g, '').trim();
  const names = district.map((feature) => norm(feature.properties.WARDS));
  const aliases = new Map();
  if (norm(district[0]?.properties.LGD) === 'lisburn') aliases.set('lisnagarvey', 'lisnagarvy');
  const candidates = [...new Set([...names, ...aliases.keys()])].sort((a, b) => b.length - a.length);
  const selected = [];
  while (remaining) {
    remaining = remaining.trim();
    const found = candidates.find((candidate) => remaining === candidate
      || remaining.startsWith(candidate + ', ') || remaining.startsWith(candidate + ' and '));
    if (!found) throw new Error('Unmatched statutory ward list item: ' + remaining);
    selected.push(aliases.get(found) || found);
    remaining = remaining.slice(found.length).trim();
    if (remaining.startsWith(',')) remaining = remaining.slice(1).trim();
    else if (remaining.startsWith('and ')) remaining = remaining.slice(4).trim();
    else if (remaining) throw new Error('Unexpected statutory text after ward ' + found + ': ' + remaining);
  }
  return selected;
}

function dissolveWards(features) {
  const edges = new Map();
  const seen = new Map();
  const coords = new Map();
  const keyOf = ([x, y]) => String(x) + ',' + String(y);
  for (const feature of features) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      const from = keyOf(ring[i - 1]);
      const to = keyOf(ring[i]);
      coords.set(from, ring[i - 1]);
      coords.set(to, ring[i]);
      const undirected = from < to ? from + '|' + to : to + '|' + from;
      const count = (seen.get(undirected) || 0) + 1;
      seen.set(undirected, count);
      if (count > 2) throw new Error('More than two wards share edge ' + undirected);
      const existing = edges.get(undirected);
      if (existing) {
        if (existing.from !== to || existing.to !== from) throw new Error('Overlapping same-direction ward edge ' + undirected);
        edges.delete(undirected);
      } else edges.set(undirected, { from, to });
    }
  }
  const outgoing = new Map();
  for (const edge of edges.values()) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }
  const edgeKey = (edge) => edge.from + '|' + edge.to;
  const visited = new Set();
  const rings = [];
  for (const first of edges.values()) {
    if (visited.has(edgeKey(first))) continue;
    let edge = first;
    const ring = [];
    for (let count = 0; count <= edges.size; count++) {
      if (visited.has(edgeKey(edge))) {
        if (edge.from !== first.from) throw new Error('Dissolved NI boundaries joined separate rings');
        break;
      }
      visited.add(edgeKey(edge));
      ring.push(coords.get(edge.from));
      if (edge.to === first.from) {
        ring.push(coords.get(first.from));
        break;
      }
      const next = (outgoing.get(edge.to) || []).filter((candidate) => !visited.has(edgeKey(candidate)));
      if (!next.length) throw new Error('Open dissolved NI boundary at ' + edge.to);
      const incoming = coords.get(edge.to);
      const prior = coords.get(edge.from);
      const incomingAngle = Math.atan2(incoming[1] - prior[1], incoming[0] - prior[0]);
      next.sort((left, right) => {
        const score = (candidate) => {
          const target = coords.get(candidate.to);
          const angle = Math.atan2(target[1] - incoming[1], target[0] - incoming[0]);
          return (angle - incomingAngle + 2 * Math.PI) % (2 * Math.PI);
        };
        return score(left) - score(right);
      });
      edge = next[0];
    }
    if (ring.length < 4 || keyOf(ring[0]) !== keyOf(ring.at(-1))) throw new Error('Invalid dissolved NI ring');
    rings.push(ring);
  }
  if (visited.size !== edges.size) throw new Error('Not all NI boundary edges were dissolved');
  return geometryFromRings(rings, 'Dissolved NI');
}

function readNiFeatures() {
  const wardBytes = readFileSync(WARDS_PATH);
  const orderBytes = readFileSync(ORDER_PATH);
  const wards = JSON.parse(wardBytes.toString('utf8')).features;
  const xml = orderBytes.toString('utf8');
  const byDistrict = new Map();
  for (const ward of wards) {
    const key = norm(ward.properties.LGD);
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key).push(ward);
  }
  const rows = [...xml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const assignments = [];
  const features = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 2 || !/(following wards|local government district)/i.test(cells[1])) continue;
    const name = xmlText(cells[0]).replace(/\s*\([^)]*\)\s*$/g, '').replace(/\s+/g, ' ').trim();
    let paragraphs = [...cells[1].matchAll(/<Text>([\s\S]*?)<\/Text>/gi)].map((match) => match[1]);
    if (!paragraphs.length) paragraphs = [cells[1]];
    const assigned = [];
    for (const raw of paragraphs) {
      const text = norm(raw).replace(/;\s*and\s*$/i, '').trim();
      const whole = text.match(/^the local government district of (.+?)[.;]?$/i);
      if (whole) {
        const district = byDistrict.get(norm(whole[1].replace(/[.;]$/g, '')));
        if (!district) throw new Error('Order names missing LGD ' + whole[1]);
        assigned.push(...district);
        continue;
      }
      const group = text.match(/^the following wards of the local government district of (.+?),\s*namely,?\s*(.+?)[.;]?$/i);
      if (!group) throw new Error('Cannot parse order constituency text: ' + text);
      const district = byDistrict.get(norm(group[1]));
      if (!district) throw new Error('Order names missing ward district ' + group[1]);
      const byName = new Map(district.map((ward) => [norm(ward.properties.WARDS), ward]));
      assigned.push(...splitWardList(group[2], district).map((ward) => {
        const feature = byName.get(ward);
        if (!feature) throw new Error('Order ward not found: ' + ward);
        return feature;
      }));
    }
    const wardIds = assigned.map((ward) => ward.properties.WARD93_ID);
    if (!wardIds.length || new Set(wardIds).size !== wardIds.length) throw new Error('Empty or duplicate ward assignment for ' + name);
    assignments.push({ name, wardIds });
    const geometry = simplifyGeometry(dissolveWards(assigned), {
      tolerance: 0.001, decimals: 5, minRingArea: 0.00008, maxPolygons: 80,
    });
    if (!geometry) throw new Error('No NI geometry produced for ' + name);
    const id = 'NI1995-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    features.push({
      type: 'Feature', id,
      properties: { id, name, gss: null, country: 'Northern Ireland', region: 'Northern Ireland', type: 'constituency', sourceCode: id },
      geometry,
    });
  }
  const counts = new Map();
  for (const item of assignments) for (const id of item.wardIds) counts.set(id, (counts.get(id) || 0) + 1);
  const expected = new Set(wards.map((ward) => ward.properties.WARD93_ID));
  const missing = [...expected].filter((id) => !counts.has(id));
  const duplicates = [...counts].filter(([, count]) => count !== 1);
  if (features.length !== 18 || expected.size !== 582 || counts.size !== 582 || missing.length || duplicates.length) {
    throw new Error('1995 order coverage failed: seats=' + features.length + ', wards=' + wards.length
      + ', assigned=' + [...counts.values()].reduce((a, b) => a + b, 0)
      + ', missing=' + missing.length + ', duplicate=' + duplicates.length);
  }
  return {
    features,
    wardCount: wards.length,
    orderHash: sha256(orderBytes),
    wardHash: sha256(wardBytes),
  };
}

function main() {
  const zip = readFileSync(ZIP_PATH);
  const control = bngToWgs84([651409.903, 313177.270]);
  if (Math.abs(control[0] - 1.71605) > 0.005 || Math.abs(control[1] - 52.65798) > 0.005) {
    throw new Error('OSGB36 conversion control point failed: ' + control.join(', '));
  }
  const gb = readGbFeatures(zip);
  const ni = readNiFeatures();
  const features = [...gb, ...ni.features];
  if (features.length !== 659 || new Set(features.map((feature) => feature.id)).size !== 659) {
    throw new Error('2001 boundary build did not produce 659 unique seats');
  }
  const collection = {
    schemaVersion: 1,
    type: 'FeatureCollection',
    provenance: {
      boundarySource: 'ONS 2001 Great Britain constituency polygons plus the Northern Ireland 1995 Order applied to OSNI 1993 wards',
      sourceArchiveSha256: sha256(zip),
      northernIrelandOrderSha256: ni.orderHash,
      northernIrelandWardGeoJsonSha256: ni.wardHash,
      coordinateReference: 'OSGB36 / British National Grid to WGS84 for Great Britain; Northern Ireland source is WGS84',
      northernIrelandMethod: 'Legal ward/district union; all 582 ward polygons assigned exactly once across 18 seats',
      limitations: [
        'The ONS catalogue record has no dataset-specific licence label; the catalogue page applies the Open Government Licence by default.',
        'The Northern Ireland source is mid-scale 1:50,000 geometry and the 1995 Order references local boundaries as at 1 June 1994.',
      ],
    },
    features,
  };
  writeFileSync(OUTPUT, gzipSync(Buffer.from(JSON.stringify(collection)), { level: 9 }));
  console.log('Prepared 659 constituencies: 641 Great Britain and 18 Northern Ireland.');
  console.log('ONS archive SHA-256: ' + collection.provenance.sourceArchiveSha256);
  console.log('NI statutory mapping: 582 of 582 wards assigned once.');
  console.log('Output: ' + OUTPUT);
}

main();
