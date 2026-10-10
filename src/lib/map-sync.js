// Leaflet may clamp a requested view to maxBounds. Suppress the reciprocal
// moveend while applying a synchronized view, even when the centers differ.
export function syncMapView(source, target, lock) {
  if (!target || lock.syncing) return;
  const center = source.getCenter();
  const otherCenter = target.getCenter();
  const zoom = source.getZoom();
  if (Math.abs(center.lat - otherCenter.lat) < .00001
    && Math.abs(center.lng - otherCenter.lng) < .00001
    && zoom === target.getZoom()) return;
  lock.syncing = true;
  try { target.setView(center, zoom, { animate: false }); }
  finally { lock.syncing = false; }
}
