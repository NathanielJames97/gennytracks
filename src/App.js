import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import SeatList from './components/SeatList';
import SeatPanel from './components/SeatPanel';
import Overview from './components/Overview';
import Correlate from './components/Correlate';
import { CensusOverview } from './components/CensusPanel';
import { useDataset } from './hooks/useData';
import { MAP_MODES, colourFor, BANDS, NO_DATA, HELD, pct } from './lib/analysis';
import './App.css';

const HOME_BOUNDS = [[49.7, -9.2], [61.2, 2.2]];

/** Fit the map to the UK once, rather than defaulting to [0,0] in the Atlantic. */
function FitBounds() {
  const map = useMap();
  useEffect(() => { map.fitBounds(HOME_BOUNDS); }, [map]);
  return null;
}

/** Fly to a seat selected from the list or search. */
function FlyToSeat({ seat }) {
  const map = useMap();
  useEffect(() => {
    if (seat && Number.isFinite(seat.centre?.[0])) {
      map.flyTo(seat.centre, Math.max(map.getZoom(), 10), { duration: 0.6 });
    }
  }, [map, seat]);
  return null;
}

/**
 * The map's shading fields live on the boundary feature properties. Lift the
 * ones the active mode needs so colourFor() can treat every mode uniformly.
 */
function pickMetric(props, mode) {
  switch (mode) {
    case 'swing':
      return {
        resultType: props.resultType,
        swingColour: props.swingColour,
        swingFrom: props.swingFrom,
      };
    case 'share':
      return { winnerShare: props.winnerShare };
    case 'majority':
      return { majority: props.majority };
    case 'turnout':
      return { turnout: props.turnout };
    case 'census': {
      // Values live on props.census (seat sub-record) rather than top-level.
      const source = props.census || props;
      const { deprived, minority, degree, noReligion } = source;
      return { census: { deprived, minority, degree, noReligion } };
    }
    default:
      return {};
  }
}

/**
 * Swing mode is categorical: each colour is a party that lost seats, so the
 * legend lists them with counts rather than showing a value ramp.
 */
function SwingLegend({ summary }) {
  const rows = (summary?.swings ?? []).slice(0, 8);
  return (
    <div className="swing-legend">
      <p className="legend-note">Coloured by the party that lost the seat.</p>
      <ul className="legend">
        {rows.map((s) => {
          const colour = summary.parties.find((p) => p.party === s.from)?.colour;
          return (
            <li key={`${s.to}-${s.from}`}>
              <span className="swatch-chip" style={{ background: colour }} aria-hidden="true" />
              {s.from} → {s.to} <strong>{s.count}</strong>
            </li>
          );
        })}
        <li>
          <span className="swatch-chip" style={{ background: HELD }} aria-hidden="true" />
          Held
        </li>
      </ul>
    </div>
  );
}

function ModeLegend({ mode, summary }) {
  if (mode === 'winner') {
    return <p className="legend-note">Shaded by the party that won the seat.</p>;
  }
  if (mode === 'swing') {
    return <SwingLegend summary={summary} />;
  }
  if (mode?.startsWith('census:')) {
    const metric = summary?.census?.metrics?.find((m) => `census:${m.seatKey}` === mode);
    if (!metric) return null;
    return (
      <div>
        <p className="legend-note">{metric.hint}. England and Wales only.</p>
        <ul className="legend">
          {metric.domain.map((d, i) => {
            const lo = metric.domain[0] + ((metric.domain[1] - metric.domain[0]) * i) / 4;
            const hi = metric.domain[0] + ((metric.domain[1] - metric.domain[0]) * (i + 1)) / 4;
            return (
              <li key={i}>
                <span
                  className="swatch-chip"
                  style={{ background: colourFor({ census: { [metric.seatKey]: (lo + hi) / 2 }, censusMetric: metric.seatKey, censusDomain: metric.domain }, 'census') }}
                  aria-hidden="true"
                />
                {pct(lo, 0)}–{pct(hi, 0)}
              </li>
            );
          })}
          <li>
            <span className="swatch-chip" style={{ background: NO_DATA }} aria-hidden="true" />
            No census
          </li>
        </ul>
      </div>
    );
  }
  const bands = BANDS[mode] || [];
  const sample = mode === 'majority'
    ? [
      { label: '15', seat: { majority: 15 } },
      { label: '1,500', seat: { majority: 1500 } },
      { label: '5,000', seat: { majority: 5000 } },
      { label: '20,000', seat: { majority: 20000 } },
    ]
    : bands.map((b) => ({ label: b.label, seat: { [mode === 'share' ? 'winnerShare' : 'turnout']: (b.from + b.to) / 2 } }));

  return (
    <ul className="legend">
      {sample.map((s) => (
        <li key={s.label}>
          <span className="swatch-chip" style={{ background: colourFor(s.seat, mode) }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
      <li>
        <span className="swatch-chip" style={{ background: NO_DATA }} aria-hidden="true" />
        No data
      </li>
    </ul>
  );
}

export default function App() {
  const { seats, summary, boundaries, status, error } = useDataset();

  const [mode, setMode] = useState('winner');
  const [partyFilter, setPartyFilter] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('overview');

  /**
   * Census metrics become map modes too, declared in the generated summary so
   * the UI never hardcodes which ONS tables were loaded.
   */
  const censusModes = useMemo(() => [
    ...MAP_MODES,
    ...(summary?.census?.metrics ?? []).map((m) => ({
      id: `census:${m.seatKey}`,
      label: m.label,
      hint: `${m.hint}. England and Wales only.`,
      metric: m,
    })),
  ], [summary]);

  // Resolve a "census:deprived" mode id down to the seatKey and domain it needs.
  const activeCensus = useMemo(() => {
    if (!mode?.startsWith('census:')) return null;
    const seatKey = mode.slice('census:'.length);
    return summary?.census?.metrics?.find((m) => m.seatKey === seatKey) ?? null;
  }, [mode, summary]);

  // react-leaflet's <GeoJSON> creates its L.GeoJSON internally and does not
  // forward a ref to it, so keep our own id -> layer map. That lets mode and
  // filter changes restyle 650 polygons in place rather than re-parsing them.
  const layersRef = useRef(new Map());

  const seatsById = useMemo(() => {
    const map = new Map();
    if (seats) seats.forEach((s) => map.set(s.id, s));
    return map;
  }, [seats]);

  // Per-seat display centre, so selecting a seat from the list can fly the map
  // to it. Computed from the boundary geometry, which is already simplified.
  const centres = useMemo(() => {
    const map = new Map();
    if (!boundaries) return map;
    for (const f of boundaries.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let sx = 0; let sy = 0; let n = 0;
      for (const poly of polys) {
        for (const ring of poly) {
          for (const [lon, lat] of ring) { sx += lon; sy += lat; n += 1; }
        }
      }
      if (n) map.set(f.properties.id, [sy / n, sx / n]);
    }
    return map;
  }, [boundaries]);

  /**
   * The map's metric lives on the boundary feature properties, while the seat
   * index carries the detailed record. Merge them per seat so colourFor() has a
   * single source of truth regardless of which mode is active.
   */
  const mapSeats = useMemo(() => {
    const map = new Map();
    if (!seats || !boundaries) return map;
    const censusMode = activeCensus ? 'census' : null;
    for (const f of boundaries.features) {
      const seat = seatsById.get(f.properties.id);
      if (!seat) continue;
      // For census modes, the metric values live on the seat record, not the
      // boundary feature properties. Pass the seat so pickMetric can read them.
      const metricSource = censusMode ? seat : f.properties;
      const merged = { ...seat, ...pickMetric(metricSource, censusMode || mode) };
      if (censusMode && activeCensus) {
        // Census values are denormalised onto the feature; carry the metric key
        // and its display range so colourFor() can shade consistently.
        merged.censusMetric = activeCensus.seatKey;
        merged.censusDomain = activeCensus.domain;
      }
      map.set(f.properties.id, merged);
    }
    return map;
  }, [seats, boundaries, seatsById, mode, activeCensus]);

  // Restyle in place whenever the metric or filter changes.
  useEffect(() => {
    layersRef.current.forEach((layer, id) => {
      const seat = mapSeats.get(id);
      const dimmed = partyFilter && seat?.partyGroup !== partyFilter;
      const isSelected = selected?.id === id;
      layer.setStyle({
        fillColor: colourFor(seat, mode),
        fillOpacity: isSelected ? 0.95 : dimmed ? 0.1 : 0.72,
        weight: isSelected ? 2.5 : mode === 'winner' ? 1 : 0.5,
        color: isSelected ? '#ffffff' : mode === 'winner' ? '#c9cfdb' : '#0f1115',
      });
      if (isSelected) layer.bringToFront();
    });
  }, [mode, partyFilter, selected, mapSeats]);

  // Apply the initial style once features are first added.
  const onEachFeature = useCallback((feature, layer) => {
    const id = feature.properties.id;
    layersRef.current.set(id, layer);
    const seat = mapSeats.get(id) ?? seatsById.get(id);
    layer.setStyle({
      fillColor: colourFor(seat, mode),
      fillOpacity: 0.72,
      weight: 1,
      color: '#c9cfdb',
    });
    layer.bindTooltip(feature.properties.name, { sticky: true, direction: 'top' });
    layer.on({
      click: () => {
        const s = seatsById.get(id);
        if (s) { setSelected({ ...s, centre: centres.get(s.id) }); setTab('seat'); }
      },
    });
  }, [mapSeats, seatsById, centres, mode]);

  const listSeats = useMemo(() => {
    if (!seats) return [];
    return seats.map((s) => ({ ...s, centre: centres.get(s.id) }));
  }, [seats, centres]);

  if (status === 'error') {
    return (
      <div className="fallback">
        <h1>Data unavailable</h1>
        <p>
          The generated data layer could not be loaded. Run <code>npm run build:data</code>
          {' '}to create it, then <code>npm start</code>.
        </p>
        {error && <p className="error">{error.message}</p>}
      </div>
    );
  }

  if (status === 'loading') {
    return <div className="fallback"><h1>Loading results…</h1></div>;
  }

  const counts = partyFilter
    ? listSeats.filter((s) => s.partyGroup === partyFilter).length
    : listSeats.length;

  return (
    <div className="App">
      <header>
        <div className="title">
          <h1>Genny Tracks</h1>
          <p>
            {summary?.totals
              ? `UK general election 2024 · ${listSeats.length} constituencies · turnout ${(summary.totals.turnout * 100).toFixed(1)}%`
              : 'UK general election 2024'}
          </p>
        </div>

        <nav className="modes" aria-label="Map shading">
          {censusModes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? 'mode on' : 'mode'}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      <aside className="panel">
        <div className="tabs" role="tablist" aria-label="Side panel">
          {[
            ['overview', 'Overview'],
            ['census', 'Census'],
            ['correlate', 'Correlate'],
            ['seat', selected ? selected.name : 'Seat'],
            ['list', 'All seats'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'tab on' : 'tab'}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {partyFilter && (
          <div className="filter-banner">
            <span>Showing {counts} {partyFilter} seats</span>
            <button type="button" className="link" onClick={() => setPartyFilter(null)}>
              Clear
            </button>
          </div>
        )}

        <div className="panel-body">
          {tab === 'overview' && (
            <Overview
              summary={summary}
              activeParty={partyFilter}
              onSelectParty={(p) => setPartyFilter((cur) => (cur === p ? null : p))}
            />
          )}
          {tab === 'census' && (
            <CensusOverview summary={summary} seats={listSeats} />
          )}
          {tab === 'correlate' && (
            <Correlate
              seats={listSeats}
              summary={summary}
              selected={selected}
              onSelect={(s) => { if (s) { setSelected(s); setTab('seat'); } }}
            />
          )}
          {tab === 'seat' && (
            <SeatPanel seat={selected} onClose={() => setSelected(null)} />
          )}
          {tab === 'list' && (
            <SeatList
              seats={listSeats}
              query={query}
              onQuery={setQuery}
              selected={selected}
              onSelect={(s) => { setSelected(s); if (s) setTab('seat'); }}
            />
          )}
        </div>
      </aside>

      <main className="map">
        <MapContainer bounds={HOME_BOUNDS} scrollWheelZoom className="leaflet-host">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds />
          <FlyToSeat seat={selected} />
          {boundaries && <GeoJSON data={boundaries} onEachFeature={onEachFeature} />}
        </MapContainer>

        <div className="map-overlay">
          <ModeLegend mode={mode} summary={summary} />
        </div>

        {boundaryLoading(boundaries) && <div className="loading">Loading boundaries…</div>}
      </main>
    </div>
  );
}

function boundaryLoading(boundaries) {
  return !boundaries;
}
