// Reprojection helpers.
//
// The source dataset (public/constituency.geojson) declares
//   "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::3857" } }
// and its coordinates are Web Mercator metres (bbox -962913..1483606,
// 6422887..8593926). Leaflet, GeoJSON consumers and Douglas-Peucker tolerances
// all expect WGS84 longitude/latitude in degrees, so this must be converted
// before the geometry is useful or measurable.

export const R_MAJOR = 6378137.0;
const DEG = 180 / Math.PI;

/**
 * Web Mercator metres -> WGS84 degrees.
 * Inverse of the spherical Mercator projection used by EPSG:3857.
 */
export function mercatorToWgs84(x, y) {
  // Both inverses divide by R_MAJOR. Dividing the latitude term by the origin
  // shift (pi * R) instead puts a stray factor of pi in the exponent and puts
  // every latitude ~35 degrees too far south.
  const lon = (x / R_MAJOR) * DEG;
  const lat = DEG * (2 * Math.atan(Math.exp(y / R_MAJOR)) - Math.PI / 2);
  return [lon, lat];
}

/** WGS84 degrees -> Web Mercator metres. */
export function wgs84ToMercator(lon, lat) {
  const x = R_MAJOR * (lon / DEG);
  const y = R_MAJOR * Math.log(Math.tan(Math.PI / 4 + (lat / DEG) / 2));
  return [x, y];
}

/**
 * Reproject every coordinate of a Polygon/MultiPolygon geometry to WGS84.
 * Returns a new geometry; the input is not mutated.
 */
export function reprojectGeometry(geometry) {
  if (!geometry) return geometry;

  const convertRing = (ring) => ring.map((c) => mercatorToWgs84(c[0], c[1]));

  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(convertRing) };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly) => poly.map(convertRing)),
    };
  }
  // Point geometries pass through untouched.
  return geometry;
}

/** Axis-aligned bounds [minX, minY, maxX, maxY] of a FeatureCollection. */
export function boundsOf(fc) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of fc.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        for (const c of ring) {
          if (c[0] < minX) minX = c[0];
          if (c[0] > maxX) maxX = c[0];
          if (c[1] < minY) minY = c[1];
          if (c[1] > maxY) maxY = c[1];
        }
      }
    }
  }
  return [minX, minY, maxX, maxY];
}
