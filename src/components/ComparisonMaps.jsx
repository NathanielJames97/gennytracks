import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import { canonicalPartyName } from '../lib/parties.mjs';
import { syncMapView } from '../lib/map-sync';
import { regionName } from '../lib/comparison';
import { UK_IRELAND_BOUNDS } from '../lib/map-bounds';


const NO_RESULT = '#596273';
const CHANGE_OUTLINE = '#FFE16B';
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function SyncMaps({ side, maps }) {
  const map = useMap();
  useEffect(() => {
    maps.current[side] = map;
    const otherSide = side === 'left' ? 'right' : 'left';
    const sync = () => syncMapView(map, maps.current[otherSide], maps.current);
    map.on('moveend', sync);
    return () => {
      map.off('moveend', sync);
      if (maps.current[side] === map) delete maps.current[side];
    };
  }, [map, maps, side]);
  return null;
}

function ComparisonViewport({ boundaries, seatById, area }) {
  const map = useMap();
  const extent = useMemo(() => {
    if (!area) return UK_IRELAND_BOUNDS;
    let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
    const visit = (coordinates) => {
      if (typeof coordinates[0] === 'number') {
        const [lng, lat] = coordinates;
        south = Math.min(south, lat); north = Math.max(north, lat);
        west = Math.min(west, lng); east = Math.max(east, lng);
      } else coordinates.forEach(visit);
    };
    for (const feature of boundaries.features) {
      const seat = seatById.get(feature.properties.id);
      if (seat && regionName(seat) === area) visit(feature.geometry.coordinates);
    }
    return Number.isFinite(south) ? [[south, west], [north, east]] : UK_IRELAND_BOUNDS;
  }, [boundaries, seatById, area]);
  useEffect(() => { map.fitBounds(extent, { padding: [20, 20], animate: false }); }, [map, extent]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    let frame;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { map.invalidateSize(); map.fitBounds(extent, { padding: [20, 20], animate: false }); });
    });
    observer.observe(map.getContainer());
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [map, extent]);
  return null;
}

function ComparisonMap({ side, election, boundaries, seatById, changedIds, maps, onSelectSeat, area, visibleIds, sameBoundaries }) {
  const onEachFeature = useCallback((feature, layer) => {
    const seat = seatById.get(feature.properties.id);
    layer.bindTooltip(feature.properties.name, { sticky: true, direction: 'top' });
    layer.on('click', () => { if (seat) onSelectSeat(seat, election.id); });
  }, [seatById, onSelectSeat, election.id]);
  const style = useCallback((feature) => {
    const id = feature.properties.id;
    const seat = seatById.get(id);
    const inScope = seat && (!area || regionName(seat) === area) && (!sameBoundaries || !visibleIds || visibleIds.has(id));
    const changed = changedIds.has(id) && inScope;
    return {
      fillColor: seat?.colour || NO_RESULT,
      fillOpacity: inScope ? 0.78 : 0.08,
      color: changed ? CHANGE_OUTLINE : '#c9cfdb',
      weight: changed ? 2.8 : 0.55,
    };
  }, [seatById, changedIds, area, visibleIds, sameBoundaries]);

  return (
    <section className="comparison-map-card" aria-label={`${election.label} map`}>
      <h3 className="comparison-map-title">{election.label}</h3>
      <MapContainer bounds={UK_IRELAND_BOUNDS} maxBounds={UK_IRELAND_BOUNDS} maxBoundsViscosity={1} scrollWheelZoom className="leaflet-host comparison-leaflet">
        <SyncMaps side={side} maps={maps} />
        <ComparisonViewport boundaries={boundaries} seatById={seatById} area={area} />
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} bounds={UK_IRELAND_BOUNDS} noWrap keepBuffer={1} />
        {boundaries && <GeoJSON key={`${election.id}-${election.boundarySetId}`} data={boundaries} style={style} onEachFeature={onEachFeature} />}
      </MapContainer>
    </section>
  );
}

export default function ComparisonMaps({
  election, comparison, boundaries, comparisonBoundaries, seats, comparisonSeats, onSelectSeat, area = '', visibleIds, error,
}) {
  const maps = useRef({});
  const sameBoundaries = Boolean(election?.boundarySetId && comparison?.boundarySetId && election.boundarySetId === comparison.boundarySetId);
  const groupedSource = election?.candidateDataGranularity === 'party-aggregate'
    || comparison?.candidateDataGranularity === 'party-aggregate';
  const changedIds = useMemo(() => {
    if (!sameBoundaries) return new Set();
    const old = new Map((comparisonSeats || []).map((seat) => [seat.id, seat]));
    return new Set((seats || []).filter((seat) => old.has(seat.id)
      && canonicalPartyName(old.get(seat.id).partyGroup) !== canonicalPartyName(seat.partyGroup)).map((seat) => seat.id));
  }, [sameBoundaries, seats, comparisonSeats]);
  const selectedById = useMemo(() => new Map((seats || []).map((seat) => [seat.id, seat])), [seats]);
  const comparisonById = useMemo(() => new Map((comparisonSeats || []).map((seat) => [seat.id, seat])), [comparisonSeats]);

  if (error) return <div className="comparison-map-loading" role="alert">Comparison maps could not be loaded. Choose another election or reload to retry.</div>;
  if (!boundaries || !comparisonBoundaries || !seats || !comparisonSeats) {
    return <div className="comparison-map-loading">Loading comparison maps…</div>;
  }

  return (
    <div className="comparison-map-workspace">
      <div className="comparison-map-pair">
        <ComparisonMap
          side="left" election={election} boundaries={boundaries}
          seatById={selectedById} changedIds={changedIds} maps={maps} onSelectSeat={onSelectSeat}
          area={area} visibleIds={visibleIds} sameBoundaries={sameBoundaries}
        />
        <ComparisonMap
          side="right" election={comparison} boundaries={comparisonBoundaries}
          seatById={comparisonById} changedIds={changedIds} maps={maps} onSelectSeat={onSelectSeat}
          area={area} visibleIds={visibleIds} sameBoundaries={sameBoundaries}
        />
      </div>
      <div className="comparison-map-caption">
        {area && <span>Area: {area}</span>}
        <span>{groupedSource ? 'Fill shows the leading reported party group; some source categories combine parties.' : 'Fill colour shows the winning party.'}</span>
        {sameBoundaries
          ? <span><i aria-hidden="true" /> Gold outlines mark seats where the winner changed. Dimmed seats are outside the active filters.</span>
          : <span>Boundary sets differ, so seat-by-seat winner changes are not mapped.</span>}
      </div>
    </div>
  );
}
