// Geometry simplification for web-friendly GeoJSON.
// No external dependencies: Douglas-Peucker on lon/lat, plus ring pruning.

const RING_MIN_POINTS = 4;

/** Squared distance from point p to the segment ab (2D). */
function sqSegDist(px, py, ax, ay, bx, by) {
  let dx = bx - ax;
  let dy = by - ay;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      ax = bx;
      ay = by;
    } else if (t > 0) {
      ax += dx * t;
      ay += dy * t;
    }
  }
  dx = px - ax;
  dy = py - ay;
  return dx * dx + dy * dy;
}

/**
 * Iterative Douglas-Peucker. Iterative (not recursive) so that dense
 * coastline rings with 100k+ points cannot blow the JS stack.
 */
function douglasPeucker(points, tolerance) {
  const n = points.length;
  if (n <= 2) return points.slice();

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const tolSq = tolerance * tolerance;
  const stack = [[0, n - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(
        points[i][0], points[i][1],
        points[first][0], points[first][1],
        points[last][0], points[last][1],
      );
      if (sq > maxSq) {
        maxSq = sq;
        index = i;
      }
    }
    if (maxSq > tolSq && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Shoelace area in square degrees. Used only for relative comparison. */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return Math.abs(a / 2);
}

/** True if the ring is a closed, renderable loop of at least 3 distinct points. */
function isValidRing(ring) {
  if (!ring || ring.length < RING_MIN_POINTS) return false;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) return false;
  // Reject a ring whose closing segment collapses to nothing.
  for (let i = 1; i < ring.length; i++) {
    if (ring[i][0] !== a[0] || ring[i][1] !== a[1]) return true;
  }
  return false;
}

function roundCoord(v, decimals) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * Simplify one ring: DP tolerance, then rounding, then dedupe of
 * coincident points produced by rounding.
 */
function simplifyRing(coords, tolerance, decimals) {
  let pts = coords;
  if (tolerance > 0) pts = douglasPeucker(pts, tolerance);

  const out = [];
  for (const [lon, lat] of pts) {
    const p = [roundCoord(lon, decimals), roundCoord(lat, decimals)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }

  // Close the ring: first point must equal last.
  if (out.length >= 3) {
    const f = out[0];
    const l = out[out.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
  }
  return out;
}

/**
 * Simplify a Polygon/MultiPolygon geometry (coordinates must already be WGS84
 * degrees).
 *
 * Each element of a MultiPolygon is one island/landmass, so whole landmasses are
 * filtered on their own outer-ring area. Nothing is merged or split, which keeps
 * the output topologically sane: ring 0 stays the outer boundary of its polygon
 * and ring n stays a hole in that same polygon.
 *
 * @param {object} geometry  GeoJSON Polygon or MultiPolygon
 * @param {object} opts
 * @param {number} opts.tolerance    Douglas-Peucker tolerance in degrees
 * @param {number} opts.decimals     coordinate decimal places
 * @param {number} opts.minRingArea  drop landmasses/rings below this (deg^2)
 * @param {number} opts.maxPolygons  keep at most this many landmasses per seat
 */
export function simplifyGeometry(geometry, opts = {}) {
  const {
    tolerance = 0.001,
    decimals = 5,
    minRingArea = 0,
    maxPolygons = 60,
  } = opts;

  if (!geometry) return null;

  // Normalise both shapes to a list of polygons, where polygon = [ring, ...].
  const inputPolygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.coordinates;

  const kept = [];

  for (const poly of inputPolygons) {
    const outer = simplifyRing(poly[0], tolerance, decimals);
    if (!isValidRing(outer)) continue;
    if (minRingArea > 0 && ringArea(outer) < minRingArea) continue;

    const rings = [outer];

    // Holes (enclaves belonging to this landmass).
    for (let r = 1; r < poly.length; r++) {
      const hole = simplifyRing(poly[r], tolerance, decimals);
      if (!isValidRing(hole)) continue;
      if (minRingArea > 0 && ringArea(hole) < minRingArea) continue;
      rings.push(hole);
    }

    kept.push(rings);
  }

  const limited = kept.slice(0, maxPolygons);
  if (!limited.length) return null;

  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: limited[0] };
  }
  return { type: 'MultiPolygon', coordinates: limited };
}

/** Count every coordinate pair in a geometry, for reporting. */
export function countCoords(geometry) {
  if (!geometry) return 0;
  // Polygon:  coordinates = [ring, ring, ...]
  // MultiPolygon: coordinates = [[ring, ring, ...], ...]
  // Unwrap to a list of rings first, so both shapes are counted identically.
  const rings = geometry.type === 'Polygon'
    ? geometry.coordinates
    : geometry.coordinates.flat();
  let n = 0;
  for (const ring of rings) {
    // A ring is [[lon,lat], ...]; guard against being handed a coordinate.
    n += Array.isArray(ring[0]) ? ring.length : 1;
  }
  return n;
}

/** Count every ring (outer boundary or hole) in a geometry. */
export function countRings(geometry) {
  if (!geometry) return 0;
  const rings = geometry.type === 'Polygon'
    ? geometry.coordinates
    : geometry.coordinates.flat();
  return rings.length;
}
