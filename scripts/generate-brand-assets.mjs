// Regenerates the committed brand assets: PWA icon PNGs, the iOS
// apple-touch-icon, and the 1200x630 social share card. The card's dot map
// plots every 2024 constituency at the mean vertex coordinate of its largest
// exterior boundary ring, coloured by the
// declared winner, so the shared image shows what the app actually maps.
// Pure Node (node:zlib + node:crypto); run `npm run brand:assets`.
// The 5x7 lettering deliberately matches the squared-off favicon "G".

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Canvas, drawText } from './lib/png.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const BG = '#0f1115';
const INK = '#f5f7fa';
const MUTED = '#9aa3b2';
const FAINT = '#6b7280';
const PROVENANCE = '#4b5563';
const ACCENT = '#e4003b';

// Favicon geometry, in the 64-unit viewBox of public/favicon.svg.
const G_PATH = [
  [15, 16], [49, 16], [49, 24], [23, 24], [23, 40], [42, 40], [42, 33],
  [33, 33], [33, 25], [50, 25], [50, 48], [15, 48],
];

function writePng(canvas, relativePath) {
  const out = join(ROOT, relativePath);
  mkdirSync(out.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  const png = canvas.toPng();
  writeFileSync(out, png);
  const hash = createHash('sha256').update(png).digest('hex').slice(0, 16);
  console.log(`wrote ${relativePath} (${canvas.width}x${canvas.height}) sha256:${hash}`);
}

/** Favicon lettering rendered at an arbitrary pixel size. */
function drawLettering(canvas, scale, offsetX, offsetY) {
  const pts = G_PATH.map(([x, y]) => [offsetX + x * scale, offsetY + y * scale]);
  canvas.fillPolygon(pts, INK);
  canvas.fillRect(offsetX + 42 * scale, offsetY + 32 * scale, 8 * scale, 8 * scale, ACCENT);
}

/** Rounded app icon (matches public/favicon.svg). */
function appIcon(size) {
  return Canvas.supersampled(4, size, size, BG, (c, f) => {
    c.fillRoundedRect(0, 0, size * f, size * f, 14 * (size * f) / 64, BG);
    drawLettering(c, (size * f) / 64, 0, 0);
  });
}

/** Maskable icon: full-bleed background, lettering inside the 80% safe zone. */
function maskableIcon(size) {
  return Canvas.supersampled(4, size, size, BG, (c, f) => {
    const inner = size * f * 0.66;
    drawLettering(c, inner / 64, (size * f - inner) / 2, (size * f - inner) / 2);
  });
}

/**
 * Dot map of a constituency result bundle: one dot per seat at the mean vertex
 * coordinate of its largest exterior boundary ring, coloured by the row's
 * declared colour.
 */
function dotMapCanvas(results, boundaries, region, dotRadius) {
  const features = new Map(boundaries.features.map((f) => [f.id ?? f.properties?.id, f]));
  const points = results.map((row) => {
    const feature = features.get(row.gss || row.areaCode || row.id);
    if (!feature) return null;
    const geom = feature.geometry;
    const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const ring = polygons.reduce((a, b) => (b[0].length > a[0].length ? b : a), polygons[0])[0];
    let lon = 0;
    let lat = 0;
    for (const [x, y] of ring) { lon += x; lat += y; }
    return { colour: /^#[0-9a-f]{6}$/i.test(row.colour || '') ? row.colour : '#6b7280', lon: lon / ring.length, lat: lat / ring.length };
  }).filter(Boolean);

  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const xScale = Math.cos((midLat * Math.PI) / 180);
  const dx = (p) => (p.lon - Math.min(...lons)) * xScale;
  const dy = (p) => Math.max(...lats) - p.lat;
  const spanX = Math.max(...points.map(dx));
  const spanY = Math.max(...points.map(dy));
  const scale = Math.min(region.width / spanX, region.height / spanY);
  const originX = region.x + (region.width - spanX * scale) / 2;
  const originY = region.y + (region.height - spanY * scale) / 2;

  return { points, project: (p) => [originX + dx(p) * scale, originY + dy(p) * scale] };
}

/** 1200x630 social card: wordmark on the left, 2024 dot map on the right. */
function shareCard(results, boundaries) {
  const width = 1200;
  const height = 630;
  return Canvas.supersampled(2, width, height, BG, (c, f) => {
    c.fillRect(0, 0, width * f, height * f, BG);
    drawText(c, 'GENNY', 72 * f, 92 * f, 13 * f, INK, 2 * f);
    drawText(c, 'TRACKS', 72 * f, 201 * f, 13 * f, INK, 2 * f);
    c.fillRect(742 * f, 270 * f, 22 * f, 22 * f, ACCENT);

    drawText(c, 'UK GENERAL ELECTIONS BY PLACE', 72 * f, 348 * f, 3 * f, MUTED);
    drawText(c, 'SEVEN ELECTIONS \u00b7 2001-2024 \u00b7 650 SEATS', 72 * f, 412 * f, 2 * f, FAINT);
    drawText(c, 'MAPS \u00b7 COMPARISONS \u00b7 SCENARIOS \u00b7 BACKTESTS', 72 * f, 444 * f, 2 * f, FAINT);
    drawText(c, 'RESULTS: HOUSE OF COMMONS LIBRARY \u00b7 ONS \u00b7 BRITPOLLS', 72 * f, 566 * f, 2 * f, PROVENANCE);

    const map = dotMapCanvas(results, boundaries, { x: 660, y: 50, width: 500, height: 530 }, 4.2);
    for (const point of map.points) {
      const [cx, cy] = map.project(point);
      c.fillCircle(cx * f, cy * f, 4.2 * f, point.colour);
    }
  });
}

const results = JSON.parse(readFileSync(join(ROOT, 'public/data/elections/2024.json'), 'utf8')).results;
const boundaries = JSON.parse(readFileSync(join(ROOT, 'public/data/boundaries.geojson'), 'utf8'));

writePng(appIcon(512), 'public/icons/icon-512.png');
writePng(appIcon(192), 'public/icons/icon-192.png');
writePng(maskableIcon(512), 'public/icons/icon-maskable-512.png');
writePng(appIcon(180), 'public/icons/apple-touch-icon.png');
writePng(shareCard(results, boundaries), 'public/og-card.png');
console.log(`plotted ${results.length} constituencies on the share card`);
