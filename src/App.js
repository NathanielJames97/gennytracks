import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

const DATA_BASE = `${process.env.PUBLIC_URL || ''}/data`;

// Bounds of Great Britain and Northern Ireland, padded.
const HOME_BOUNDS = [[49.7, -9.2], [61.2, 2.2]];

/** Load JSON once, reporting loading and error state. */
function useJson(path) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((data) => { if (!cancelled) setState({ status: 'ready', data, error: null }); })
      .catch((error) => { if (!cancelled) setState({ status: 'error', data: null, error }); });
    return () => { cancelled = true; };
  }, [path]);

  return state;
}

/**
 * Fit the map to the whole of the UK on load. Without this Leaflet centres on
 * [0,0], which is in the Atlantic.
 */
function FitBounds() {
  const map = useMap();
  useEffect(() => { map.fitBounds(HOME_BOUNDS); }, [map]);
  return null;
}

function PartyKey({ parties, active, onToggle }) {
  if (!parties) return null;
  return (
    <ul className="parties">
      {parties.map((p) => (
        <li key={p.party}>
          <button
            type="button"
            className={active === p.party ? 'swatch on' : 'swatch'}
            onClick={() => onToggle(active === p.party ? null : p.party)}
            aria-pressed={active === p.party}
          >
            <span className="dot" style={{ background: p.colour }} aria-hidden="true" />
            {p.party}
            <span className="count">{p.seats}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SeatDetails({ seat, onClose }) {
  if (!seat) return null;
  return (
    <aside className="details" aria-live="polite">
      <button type="button" className="close" onClick={onClose} aria-label="Close">×</button>
      <h2>{seat.name}</h2>
      <p className="meta">
        {seat.region}
        {seat.electorate ? ` · electorate ${seat.electorate.toLocaleString()}` : ''}
      </p>
      <div className="mp">
        {seat.photo && <img src={`${process.env.PUBLIC_URL || ''}/${seat.photo}`} alt="" />}
        <div>
          <strong>{seat.member || 'No member recorded'}</strong>
          <span className="party" style={{ borderColor: seat.colour }}>
            {seat.party}
          </span>
        </div>
      </div>
      {seat.memberWiki && (
        <a href={seat.memberWiki} target="_blank" rel="noreferrer">
          Wikipedia ↗
        </a>
      )}
      {seat.notes && <p className="notes">{seat.notes}</p>}
    </aside>
  );
}

export default function App() {
  const index = useJson(`${DATA_BASE}/constituencies.json`);
  const summary = useJson(`${DATA_BASE}/parties.json`);
  const boundaries = useJson(`${DATA_BASE}/boundaries.geojson`);

  const [partyFilter, setPartyFilter] = useState(null);
  const [selected, setSelected] = useState(null);

  // react-leaflet's <GeoJSON> builds its L.GeoJSON internally and does not
  // forward a ref to it, so keep our own map of seat id -> Leaflet layer. That
  // lets selection and filtering restyle in place instead of re-parsing all
  // 650 polygons on every click.
  const layersRef = useRef(new Map());

  const seatsById = useMemo(() => {
    const map = new Map();
    if (index.status === 'ready') index.data.forEach((s) => map.set(s.id, s));
    return map;
  }, [index]);

  // Attach the seat colour onto each feature once, so the map and the seat
  // index can never disagree about who won a constituency.
  const styled = useMemo(() => {
    if (boundaries.status !== 'ready') return null;
    return {
      ...boundaries.data,
      features: boundaries.data.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: seatsById.get(f.properties.id)?.colour || '#8a8f98',
        },
      })),
    };
  }, [boundaries, seatsById]);

  /**
   * Selection and party filtering only change styling, so restyle the existing
   * Leaflet layers in place. Re-creating the GeoJSON layer would re-parse all
   * 650 polygons on every click.
   */
  useEffect(() => {
    layersRef.current.forEach((lyr, id) => {
      const seat = seatsById.get(id);
      const isSelected = selected?.id === id;
      const dimmed = partyFilter && seat?.partyGroup !== partyFilter;
      lyr.setStyle({
        fillColor: seat?.colour || '#8a8f98',
        fillOpacity: isSelected ? 0.95 : dimmed ? 0.12 : 0.68,
        weight: isSelected ? 2.5 : 1,
        color: isSelected ? '#ffffff' : '#c9cfdb',
      });
      if (isSelected) lyr.bringToFront();
    });
  }, [styled, selected, partyFilter, seatsById]);

  const onEachFeature = useCallback((feature, layer) => {
    const p = feature.properties;
    layersRef.current.set(p.id, layer);
    layer.bindTooltip(p.name, { sticky: true, direction: 'top' });
    layer.on({
      click: () => setSelected(p),
      mouseover: (e) => e.target.setStyle({ weight: 2 }),
      mouseout: (e) => e.target.setStyle({ weight: 1 }),
    });
  }, []);

  const baseStyle = useCallback(
    () => ({ weight: 1, color: '#c9cfdb', fillOpacity: 0.68 }),
    [],
  );

  if (index.status === 'error') {
    return (
      <div className="fallback">
        <h1>Data unavailable</h1>
        <p>
          Could not load <code>{DATA_BASE}/constituencies.json</code>. Run{' '}
          <code>npm run build:data</code> to generate it.
        </p>
        <p className="error">{index.error?.message}</p>
      </div>
    );
  }

  return (
    <div className="App">
      <header>
        <h1>Genny Tracks</h1>
        <p>
          Who represents each of the 650 UK constituencies elected in 2024
          {summary.status === 'ready' && (
            <span> · {summary.data.parties[0].party} won {summary.data.parties[0].seats}</span>
          )}
        </p>
      </header>

      <div className="panel">
        {summary.status === 'ready' && (
          <PartyKey
            parties={summary.data.parties}
            active={partyFilter}
            onToggle={setPartyFilter}
          />
        )}
        <SeatDetails seat={selected} onClose={() => setSelected(null)} />
      </div>

      <div className="map">
        <MapContainer
          bounds={HOME_BOUNDS}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds />
          {styled && (
            <GeoJSON
              data={styled}
              style={baseStyle}
              onEachFeature={onEachFeature}
            />
          )}
        </MapContainer>
        {boundaries.status === 'loading' && <div className="loading">Loading boundaries…</div>}
      </div>
    </div>
  );
}
