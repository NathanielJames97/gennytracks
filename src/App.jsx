import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import SeatList from './components/SeatList';
import SeatPanel from './components/SeatPanel';
import Overview from './components/Overview';
import Correlate from './components/Correlate';
import { CensusOverview } from './components/CensusPanel';
import { resultRows, useDataFile, useDataFiles, useDataset } from './hooks/useData';
import { MAP_MODES, colourFor, BANDS, NO_DATA, HELD, pct } from './lib/analysis';
import { readShareState, writeShareState, downloadCsv } from './lib/share';
import HistoryPanel from './components/HistoryPanel';
import ComparePanel from './components/ComparePanel';
import ComparisonMaps from './components/ComparisonMaps';
import { UK_IRELAND_BOUNDS } from './lib/map-bounds';
import ScenarioLab from './components/ScenarioLab';
import PollingPanel from './components/PollingPanel';
import BacktestPanel from './components/BacktestPanel';
import { calculateBaselineShares, PARTY_SCENARIO_METHOD, simulatePartyShareScenario, isCompleteShareVector } from './lib/multi-party-scenario';
import { canonicalPartyName } from './lib/parties.mjs';
import { buildComparison, filterComparisonPairs, DEFAULT_COMPARISON_FILTERS, COMPARISON_SORTS, comparisonAreas, downloadComparisonCsv } from './lib/comparison';
import { filterComparisonChoices, resolveComparisonChoice } from './lib/comparison-compatibility';
import './App.css';



/** Fit the map to the UK and Ireland, rather than defaulting to [0,0] in the Atlantic. */
function FitBounds({ electionId }) {
  const map = useMap();
  useEffect(() => { map.fitBounds(UK_IRELAND_BOUNDS); }, [map, electionId]);
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

function censusCoverageLabel(metric, summary) {
  const countryCoverage = summary?.census?.countryCoverage;
  if (!countryCoverage || !Object.keys(countryCoverage).length) return 'Coverage varies by country.';
  const parts = Object.entries(countryCoverage).map(([country, seats]) => (
    `${country}: ${metric.coverageByCountry?.[country] || 0}/${seats} seats`
  ));
  return `Coverage — ${parts.join(' · ')}.`;
}

/**
 * Swing mode is categorical: each colour is a party that lost seats, so the
 * legend lists them with counts rather than showing a value ramp.
 */
function SwingLegend({ summary }) {
  if (summary?.isNotional) {
    return <p className="legend-note">Swing is unavailable for notional party totals.</p>;
  }
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

function ModeLegend({ mode, summary, election }) {
  if (mode === 'majority' && election?.marginDataAvailable === false) return <p className="legend-note">Winning margins are not available for this source.</p>;
  if (mode === 'winner' && election?.candidateDataGranularity === 'party-aggregate') return <p className="legend-note">Colour shows the leading reported party group; smaller parties are grouped together.</p>;
  if (mode === 'swing' && election?.candidateDataGranularity === 'party-aggregate' && !summary?.isNotional) return <p className="legend-note">Seat gains are not included in this party-group source.</p>;
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
        <p className="legend-note">{metric.hint}. {censusCoverageLabel(metric, summary)}</p>
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
  const [routeState] = useState(readShareState);
  const [requestedElectionId, setRequestedElectionId] = useState(routeState.election || '2024');
  const { manifest, election, electionId, seats, summary, boundaries, status, error } = useDataset(requestedElectionId);
  const [mode, setMode] = useState(routeState.mode || 'winner');
  const [partyFilter, setPartyFilter] = useState(routeState.party || null);
  const [regionFilter, setRegionFilter] = useState(routeState.region || null);
  const [selectedId, setSelectedId] = useState(routeState.seat || null);
  const [query, setQuery] = useState(routeState.q || '');
  const [tab, setTab] = useState([
    'overview', 'census', 'correlate', 'seat', 'history', 'compare', 'scenario', 'polling', 'backtest', 'list',
  ].includes(routeState.view) ? routeState.view : 'overview');
  const [compareId, setCompareId] = useState(routeState.compare || '2019-notional-2024');
  const [compatibleComparisonsOnly, setCompatibleComparisonsOnly] = useState(routeState.compareCompatible === '1');
  const [comparisonFilters, setComparisonFilters] = useState({
    ...DEFAULT_COMPARISON_FILTERS, area: routeState.compareArea || '',
    changesOnly: routeState.compareChanges !== '0', query: routeState.compareQuery || '',
    sort: COMPARISON_SORTS[routeState.compareSort] ? routeState.compareSort : 'name',
  });
  const [scenario, setScenario] = useState(() => routeState.scenario || {
    method: 'uniform-party-delta-v1',
    geography: 'GB',
    requestedShares: null,
    source: { kind: 'manual', id: 'manual', label: 'Manual scenario' },
    assumptions: [
      'National share changes are applied as equal percentage-point deltas wherever each party stood.',
      'Local shares are clipped at zero and rescaled across declared candidates; no candidate entrants, tactical shifts, turnout changes or local evidence are modelled.',
      'Northern Ireland is held at baseline and excluded from this GB scenario.',
    ],
    ...((routeState.swing !== undefined || routeState.swingParty) ? {
      party: routeState.swingParty || 'Labour',
      swing: Math.max(-15, Math.min(15, Number(routeState.swing) || 0)),
    } : {}),
  });
  const legacyScenarioConverted = useRef(Boolean(routeState.scenario?.requestedShares));
  const [projection, setProjection] = useState(routeState.projection === '1');
  const regionFilterRef = useRef(regionFilter);
  const partyFilterRef = useRef(partyFilter);
  const queryRef = useRef(query);
  const projectionAvailableRef = useRef(false);
  const seatsByIdRef = useRef(new Map());
  const scenarioSeatsByIdRef = useRef(new Map());
  regionFilterRef.current = regionFilter;
  partyFilterRef.current = partyFilter;
  queryRef.current = query;
  const [shareStatus, setShareStatus] = useState('');
  const scenarioDescriptor = manifest?.elections?.find((item) => item.id === '2024') || null;
  const scenarioFile = useDataFile((['scenario', 'polling'].includes(tab) && electionId !== '2024') ? scenarioDescriptor?.resultsFile : null);
  const scenarioBaseSeats = electionId === '2024' ? seats : resultRows(scenarioFile.data);
  const scenarioBaselineSet = useMemo(() => {
    const seatsForScenario = scenarioBaseSeats || [];
    const byGeography = Object.fromEntries(['GB', 'UK', 'NI'].map((geography) => [
      geography, calculateBaselineShares(seatsForScenario, { geography }),
    ]));
    const regional = Object.fromEntries(['England', 'Scotland', 'Wales'].map((region) => {
      const result = calculateBaselineShares(seatsForScenario, { geography: 'GB', region });
      return [region, {
        ...result,
        shares: Object.fromEntries(Object.keys(byGeography.GB.shares).map((party) => [party, result.shares[party] || 0])),
      }];
    }));
    return { byGeography, regional };
  }, [scenarioBaseSeats]);
  const scenarioGeography = scenario.geography || 'GB';
  const scenarioBaseline = scenarioBaselineSet.byGeography[scenarioGeography] || scenarioBaselineSet.byGeography.GB;
  const pollsFile = useDataFile(['polling', 'backtest'].includes(tab) ? 'polls.json' : null);
  const backtestIds = ['2010', '2015', '2017', '2019', '2019-notional-2024', '2024'];
  const backtestRequests = tab === 'backtest' ? backtestIds.map((id) => {
    const item = manifest?.elections?.find((row) => row.id === id);
    return item ? { id, path: item.resultsFile } : null;
  }).filter(Boolean) : [];
  const backtestFiles = useDataFiles(backtestRequests);
  const scenarioShares = scenario.requestedShares || scenarioBaseline.shares;
  const scenarioComplete = isCompleteShareVector(scenarioShares, Object.keys(scenarioBaseline.shares));
  const scenarioProjection = useMemo(() => {
    try {
      return {
        seats: simulatePartyShareScenario(scenarioBaseSeats || [], {
          requestedShares: scenarioShares,
          baselineShares: scenarioBaseline,
          geography: scenarioGeography,
          regionalShares: scenario.regionalShares || {},
          regionalBaselineShares: scenarioBaselineSet.regional,
          method: scenario.method || PARTY_SCENARIO_METHOD,
        }),
        error: '',
      };
    } catch (error) {
      return { seats: [], error: error.message || 'The selected allocation method could not fit these inputs.' };
    }
  }, [scenarioBaseSeats, scenarioShares, scenarioBaseline, scenarioGeography, scenario.regionalShares, scenario.method, scenarioBaselineSet.regional]);
  const scenarioSeats = scenarioProjection.seats;
  const scenarioError = scenarioProjection.error;
  const projectionAvailable = projection && !scenarioError;

  useEffect(() => {
    if (legacyScenarioConverted.current || !Object.keys(scenarioBaseline.shares || {}).length) return;
    legacyScenarioConverted.current = true;
    if (routeState.scenario || !Number(scenario.swing) || !scenario.party) return;
    const party = canonicalPartyName(scenario.party);
    const baselineShare = Number(scenarioBaseline.shares[party]);
    if (!Number.isFinite(baselineShare)) return;
    const targetShare = Math.max(0, Math.min(100, baselineShare + Number(scenario.swing)));
    const otherTotal = 100 - baselineShare;
    const remaining = 100 - targetShare;
    const requestedShares = Object.fromEntries(Object.entries(scenarioBaseline.shares).map(([name, value]) => [
      name, name === party ? targetShare : otherTotal > 0 ? value * remaining / otherTotal : value,
    ]));
    setScenario({
      method: 'uniform-party-delta-v1', geography: 'GB', requestedShares,
      source: { kind: 'legacy-link', id: 'uniform-swing', label: 'Converted legacy swing link' },
      assumptions: ['Legacy one-party swing link converted to a complete national share vector; other parties are rescaled proportionally.'],
    });
  }, [scenarioBaseline, routeState.scenario, scenario.swing, scenario.party]);

  const historyRequests = tab === 'history'
    ? (manifest?.elections || [])
      .filter((item) => item.boundarySetId === election?.boundarySetId && item.id !== electionId)
      .map((item) => ({ id: item.id, path: item.resultsFile }))
    : [];
  const historyFiles = useDataFiles(historyRequests);
  const crosswalkCatalog = manifest?.crosswalks || (manifest?.boundaryCrosswalkFile ? [{
    id: 'legacy-boundary-crosswalk', file: manifest.boundaryCrosswalkFile,
  }] : []);
  const historyCrosswalkDescriptors = tab === 'history'
    ? crosswalkCatalog.filter((item) => (
      (!item.fromBoundarySetId && !item.toBoundarySetId)
      || item.fromBoundarySetId === election?.boundarySetId
      || item.toBoundarySetId === election?.boundarySetId
    ))
    : [];
  const historyCrosswalkFiles = useDataFiles(historyCrosswalkDescriptors.map(({ id, file }) => ({ id, path: file })));
  const comparisonDescriptor = manifest?.elections?.find((item) => item.id === compareId) || null;
  const comparisonSeatsFile = useDataFile(tab === 'compare' ? comparisonDescriptor?.resultsFile : null);
  const comparisonBoundariesFile = useDataFile(
    tab === 'compare' && comparisonDescriptor?.boundarySetId !== election?.boundarySetId
      ? comparisonDescriptor?.boundariesFile : null,
  );
  const comparisonBoundaries = comparisonDescriptor?.boundarySetId === election?.boundarySetId
    ? boundaries : comparisonBoundariesFile.data;

  const comparisonSeats = resultRows(comparisonSeatsFile.data);
  const comparisonModel = useMemo(() => buildComparison(seats, comparisonSeats, election, comparisonDescriptor, comparisonFilters.area),
    [seats, comparisonSeats, election, comparisonDescriptor, comparisonFilters.area]);
  const comparisonPairs = useMemo(() => filterComparisonPairs(comparisonModel.pairs, comparisonFilters), [comparisonModel, comparisonFilters]);
  const comparisonVisibleIds = useMemo(() => new Set(comparisonPairs.map((pair) => pair.current.id)), [comparisonPairs]);
  const comparisonError = comparisonSeatsFile.error || comparisonBoundariesFile.error;
  useEffect(() => {
    if (comparisonSeats && comparisonFilters.area && !comparisonAreas(seats, comparisonSeats).includes(comparisonFilters.area)) {
      setComparisonFilters((value) => ({ ...value, area: '' }));
    }
  }, [seats, comparisonSeats, comparisonFilters.area]);

  const setSelected = useCallback((seat) => setSelectedId(seat?.id || null), []);

  /**
   * Census metrics become map modes too, declared in the generated summary so
   * the UI never hardcodes which ONS tables were loaded.
   */
  const censusModes = useMemo(() => [
    ...MAP_MODES,
    ...(summary?.census?.metrics ?? []).map((m) => ({
      id: `census:${m.seatKey}`,
      label: m.label,
      hint: `${m.hint}. ${censusCoverageLabel(m, summary)}`,
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
  const layerElectionRef = useRef(null);

  const seatsById = useMemo(() => {
    const map = new Map();
    if (seats) seats.forEach((s) => map.set(s.id, s));
    return map;
  }, [seats]);

  const selectedRecord = selectedId ? seatsById.get(selectedId) : null;
  seatsByIdRef.current = seatsById;

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
  const selected = useMemo(() => (
    selectedRecord ? { ...selectedRecord, centre: centres.get(selectedRecord.id) } : null
  ), [selectedRecord, centres]);

  const scenarioSeatsById = useMemo(() => new Map((scenarioSeats || []).map((seat) => [seat.id, seat])), [scenarioSeats]);
  scenarioSeatsByIdRef.current = scenarioSeatsById;
  projectionAvailableRef.current = projectionAvailable;

  useEffect(() => {
    if (electionId && electionId !== requestedElectionId) setRequestedElectionId(electionId);
    if (status !== 'ready') return;
    if (selectedId && !seatsById.has(selectedId)) setSelectedId(null);
    if (partyFilter && !summary?.parties?.some((party) => party.party === partyFilter)) setPartyFilter(null);
    if (regionFilter && !summary?.regions?.some((region) => region.region === regionFilter)) setRegionFilter(null);
    const supportedMode = MAP_MODES.some((item) => item.id === mode)
      || summary?.census?.metrics?.some((metric) => `census:${metric.seatKey}` === mode);
    if (!supportedMode) setMode('winner');
    if (['census', 'correlate'].includes(tab) && !summary?.census?.metrics?.length) setTab('overview');
    const nextComparison = resolveComparisonChoice(manifest?.elections || [], election, compareId, compatibleComparisonsOnly);
    if (compareId !== nextComparison) setCompareId(nextComparison);
  }, [electionId, requestedElectionId, status, selectedId, seatsById, partyFilter, regionFilter, summary, mode, tab, compareId, manifest, election, compatibleComparisonsOnly]);

  useEffect(() => {
    writeShareState({
      election: electionId || requestedElectionId, mode, party: partyFilter, seat: selectedId,
      region: regionFilter,
      view: tab, compare: tab === 'compare' ? compareId : null, query,
      compareCompatible: compatibleComparisonsOnly,
      swingParty: tab === 'scenario' || projection ? scenario.party : null,
      swing: tab === 'scenario' || projection ? scenario.swing : null,
      scenario: tab === 'scenario' || projection ? scenario : null,
      projection: projectionAvailable, comparisonFilters: tab === 'compare' ? comparisonFilters : null,
    });
  }, [electionId, requestedElectionId, mode, partyFilter, regionFilter, selectedId, tab, compareId, query, scenario, projectionAvailable, comparisonFilters, compatibleComparisonsOnly]);

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
      const baseSeat = seatsById.get(f.properties.id);
      if (!baseSeat) continue;
      const seat = projectionAvailable && electionId === '2024' ? (scenarioSeatsById.get(f.properties.id) || baseSeat) : baseSeat;
      // For census modes, the metric values live on the seat record, not the
      // boundary feature properties. Pass the seat so pickMetric can read them.
      const metricSource = seat;
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
  }, [seats, boundaries, seatsById, mode, activeCensus, projection, scenarioSeatsById]);

  // Restyle in place whenever the metric or filter changes.
  useEffect(() => {
    layersRef.current.forEach((layer, id) => {
      const seat = mapSeats.get(id);
      const outsideRegion = regionFilter && seat?.region !== regionFilter;
      const outsideParty = partyFilter && seat?.partyGroup !== partyFilter;
      const outsideQuery = regionFilter && !matchesSeatQuery(seat, query);
      const hiddenByScope = outsideRegion || (outsideParty && Boolean(regionFilter)) || outsideQuery;
      const isSelected = selected?.id === id;
      layer.setStyle({
        fillColor: colourFor(seat, mode),
        fillOpacity: hiddenByScope ? 0 : isSelected ? 0.95 : outsideParty ? 0.1 : 0.72,
        weight: hiddenByScope ? 0 : isSelected ? 2.5 : mode === 'winner' ? 1 : 0.5,
        color: hiddenByScope ? 'transparent' : isSelected ? '#ffffff' : mode === 'winner' ? '#c9cfdb' : '#0f1115',
      });
      if (isSelected) layer.bringToFront();
    });
  }, [mode, partyFilter, regionFilter, query, selected, mapSeats]);

  // Apply the initial style once features are first added.
  const onEachFeature = useCallback((feature, layer) => {
    if (layerElectionRef.current !== electionId) {
      layersRef.current.clear();
      layerElectionRef.current = electionId;
    }
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
        const baseSeat = seatsByIdRef.current.get(id) || seat;
        if (regionFilterRef.current && (baseSeat?.region !== regionFilterRef.current
          || partyFilterRef.current && baseSeat?.partyGroup !== partyFilterRef.current
          || !matchesSeatQuery(baseSeat, queryRef.current))) return;
        const s = projectionAvailableRef.current && electionId === '2024'
          ? (scenarioSeatsByIdRef.current.get(id) || baseSeat) : baseSeat;
        if (s) { setSelected({ ...s, centre: centres.get(s.id) }); setTab('seat'); }
      },
    });
  }, [mapSeats, seatsById, scenarioSeatsById, projectionAvailable, centres, mode, setSelected, electionId]);

  const allListSeats = useMemo(() => {
    if (!seats) return [];
    return seats.map((s) => ({ ...s, centre: centres.get(s.id) }));
  }, [seats, centres]);
  const listSeats = useMemo(() => allListSeats.filter((seat) => (
    (!regionFilter || seat.region === regionFilter)
    && (!partyFilter || seat.partyGroup === partyFilter)
  )), [allListSeats, regionFilter, partyFilter]);

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

  const counts = listSeats.length;
  const scopedCount = regionFilter ? listSeats.filter((seat) => matchesSeatQuery(seat, query)).length : counts;
  const historyElections = manifest?.elections || [];
  const comparisonChoices = filterComparisonChoices(historyElections, election, compatibleComparisonsOnly);
  const historyResultSets = historyElections.map((item) => (
    item.id === electionId ? seats : resultRows(historyFiles.data[item.id]) || []
  ));
  const historyCrosswalks = historyCrosswalkDescriptors.map((item) => {
    const data = historyCrosswalkFiles.data[item.id];
    return data ? { ...item, ...data } : null;
  }).filter(Boolean);
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus('Link copied');
    } catch (copyError) {
      setShareStatus('Copy unavailable in this browser');
    }
  };

  return (
    <div className={tab === 'compare' ? 'App comparison-app' : ['scenario', 'polling', 'backtest'].includes(tab) ? 'App scenario-app' : 'App'}>
      <header>
        <div className="title">
          <h1>Genny Tracks</h1>
          <p>
            {summary?.totals
              ? `UK general election ${election?.label || election?.year} · ${listSeats.length} constituencies · turnout ${(summary.totals.turnout * 100).toFixed(1)}%`
              : `UK general election ${election?.label || election?.year || ''}`}
          </p>
        </div>

        <div className="header-actions">
          <label className="election-picker">
            <span>Election</span>
            <select value={electionId || requestedElectionId} onChange={(event) => {
              setRequestedElectionId(event.target.value);
              setSelectedId(null);
              setPartyFilter(null);
              setProjection(false);
              setTab('overview');
            }}>
              {(manifest?.elections || []).map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="header-action" onClick={handleCopyLink}>Copy link</button>
          <button type="button" className="header-action" disabled={(tab === 'compare' && (!comparisonSeats || !comparisonDescriptor || Boolean(comparisonError))) || (tab === 'scenario' && (!scenarioComplete || Boolean(scenarioError)))} onClick={() => tab === 'compare'
            ? downloadComparisonCsv(comparisonModel, comparisonPairs, election, comparisonDescriptor, comparisonFilters)
            : downloadCsv((projectionAvailable || tab === 'scenario') ? scenarioSeats : listSeats, tab === 'scenario' ? scenarioDescriptor : election, projectionAvailable || tab === 'scenario', (projectionAvailable || tab === 'scenario') ? scenario : null)}>{tab === 'compare' ? 'Export comparison' : 'Export CSV'}</button>
        </div>

        {tab !== 'compare' && <nav className="modes" aria-label="Map shading">
          {censusModes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? 'mode on' : 'mode'}
              onClick={() => { setMode(m.id); if (m.id !== 'winner') setProjection(false); }}
              aria-pressed={mode === m.id}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </nav>}
        {shareStatus && <span className="share-status" role="status">{shareStatus}</span>}
      </header>

      <aside className="panel">
        <div className="tabs" role="tablist" aria-label="Side panel">
          {[
            ['overview', 'Overview'],
            ...(summary?.census?.metrics?.length ? [['census', 'Census'], ['correlate', 'Correlate']] : []),
            ['seat', selected ? selected.name : 'Seat'],
            ['history', 'History'],
            ['compare', 'Compare'],
            ['scenario', 'Scenario'],
            ['polling', 'Polling'],
            ['backtest', 'Backtest'],
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

        {(partyFilter || regionFilter) && tab !== 'compare' && (
          <div className="filter-banner">
            <span>{regionFilter ? `Showing ${scopedCount} ${regionFilter} seats` : `Showing ${counts} ${partyFilter} seats`}{regionFilter && partyFilter ? ` · ${partyFilter}` : ''}</span>
            {regionFilter && <button type="button" className="link" onClick={() => setRegionFilter(null)}>Clear region</button>}
            {partyFilter && <button type="button" className="link" onClick={() => setPartyFilter(null)}>Clear party</button>}
          </div>
        )}

        <div className="panel-body">
          {tab === 'overview' && (
            <Overview
              summary={summary}
              election={election}
              activeParty={partyFilter}
              onSelectParty={(p) => setPartyFilter((cur) => (cur === p ? null : p))}
              activeRegion={regionFilter}
              onSelectRegion={(region) => setRegionFilter(region)}
              onClearRegion={() => setRegionFilter(null)}
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
            <SeatPanel seat={selected} election={election} onClose={() => setSelected(null)} scenarioSeat={projectionAvailable && electionId === '2024' ? scenarioSeatsById.get(selected?.id) : null} />
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
          {tab === 'history' && (
            <HistoryPanel
              seat={selected}
              election={election}
              elections={historyElections}
              boundarySets={manifest?.boundarySets || []}
              resultSets={historyResultSets}
              crosswalks={historyCrosswalks}
              onSelectElection={(id) => { setRequestedElectionId(id); setTab('seat'); }}
              onSelectPlace={(id, boundarySetId) => {
                const linkedElection = historyElections
                  .filter((item) => item.boundarySetId === boundarySetId)
                  .sort((a, b) => b.year - a.year || Number(a.isNotional) - Number(b.isNotional))[0];
                if (!linkedElection) return;
                setSelectedId(id);
                setRequestedElectionId(linkedElection.id);
                setTab('history');
              }}
            />
          )}
          {tab === 'compare' && (
            <>
              <label className="compare-picker">
                <span>Compare with</span>
                <select aria-label="Compare with" value={compareId} onChange={(event) => setCompareId(event.target.value)}>
                  {!comparisonChoices.length && <option value="">No other compatible election</option>}
                  {comparisonChoices.map((item) => (
                  <option key={item.id} value={item.id}>{item.label} · {item.compatibilityLabel}</option>
                  ))}
                </select>
              </label>
              <label className="comparison-check compatible-comparisons-toggle">
                <input type="checkbox" checked={compatibleComparisonsOnly} onChange={(event) => setCompatibleComparisonsOnly(event.target.checked)} />
                Same boundary set only
              </label>
              <ComparePanel
                election={election}
                seats={seats}
                comparison={comparisonDescriptor}
                comparisonSeats={comparisonSeats}
                model={comparisonModel} pairs={comparisonPairs}
                filters={comparisonFilters} onFilters={setComparisonFilters}
                boundaries={boundaries} comparisonBoundaries={comparisonBoundaries}
                boundarySets={manifest?.boundarySets || []} sources={manifest?.sources || []}
                error={comparisonError}
                onSelectSeat={(seat, selectedElectionId = electionId) => {
                  setRequestedElectionId(selectedElectionId);
                  setSelectedId(seat?.id || null);
                  setTab('seat');
                }}
              />
            </>
          )}
          {tab === 'scenario' && (
            <ScenarioLab
              election={scenarioDescriptor}
              seats={scenarioBaseSeats || []}
              baseline={scenarioBaseline}
              regionBaselines={scenarioBaselineSet.regional}
              baselineByGeography={scenarioBaselineSet.byGeography}
              scenario={scenario}
              scenarioSeats={scenarioSeats}
              onChange={setScenario}
              onApply={(enabled) => { setProjection(enabled); if (enabled) setMode('winner'); }}
              applied={projectionAvailable}
              canApplyMap={electionId === '2024'}
              scenarioError={scenarioError}
              onSelectSeat={(seat) => { setSelectedId(seat?.id || null); setProjection(true); setMode('winner'); setTab('seat'); }}
            />
          )}
          {tab === 'polling' && <PollingPanel
            data={pollsFile.data}
            scenarioBaseline={scenarioBaselineSet.byGeography.GB}
            onUseScenario={(nextScenario) => { setScenario(nextScenario); setProjection(false); setTab('scenario'); }}
          />}
          {tab === 'backtest' && <BacktestPanel
            elections={historyElections}
            files={backtestFiles.data}
            polls={pollsFile.data}
          />}
        </div>
      </aside>

      <main className={tab === 'compare' ? 'map comparison-mode' : 'map'}>
        {tab === 'compare' ? (
          <ComparisonMaps
            election={election}
            comparison={comparisonDescriptor}
            boundaries={boundaries}
            comparisonBoundaries={comparisonBoundaries}
            seats={seats}
            comparisonSeats={comparisonSeats}
            area={comparisonFilters.area} visibleIds={comparisonVisibleIds}
            error={comparisonError}
            onSelectSeat={(seat, selectedElectionId) => {
              setRequestedElectionId(selectedElectionId);
              setSelectedId(seat?.id || null);
              setTab('seat');
            }}
          />
        ) : (
          <>
            <MapContainer bounds={UK_IRELAND_BOUNDS} maxBounds={UK_IRELAND_BOUNDS} maxBoundsViscosity={1} scrollWheelZoom className="leaflet-host">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                bounds={UK_IRELAND_BOUNDS}
                noWrap
                keepBuffer={1}
              />
              <FitBounds electionId={electionId} />
              <FlyToSeat seat={selected} />
              {boundaries && <GeoJSON key={electionId} data={boundaries} onEachFeature={onEachFeature} />}
            </MapContainer>
            <div className="map-overlay">
              <ModeLegend mode={mode} summary={summary} election={election} />
              {projectionAvailable && <p className="projection-flag">2024 {scenarioGeography === 'NI' ? 'Northern Ireland' : scenarioGeography === 'UK' ? 'UK-wide' : 'Great Britain'} scenario</p>}
            </div>
            {boundaryLoading(boundaries) && <div className="loading">Loading boundaries…</div>}
          </>
        )}
      </main>
    </div>
  );
}

function boundaryLoading(boundaries) {
  return !boundaries;
}

function matchesSeatQuery(seat, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [seat?.name, seat?.member, seat?.partyGroup, seat?.region]
    .some((value) => String(value || '').toLowerCase().includes(q));
}
