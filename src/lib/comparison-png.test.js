import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildComparison, filterComparisonPairs } from './comparison';
import { buildComparisonPngLayout, renderComparisonPng } from './comparison-png';

const election = {
  id: '2024', label: '2024', boundarySetId: 'new', boundaryLabel: '2024 constituency boundaries',
  sourceName: 'Election results', sourceUrl: 'https://example.test/results/2024',
};
const comparison = {
  id: '2019-notional-2024', label: '2019 notional', boundarySetId: 'new', isNotional: true,
  boundaryLabel: '2024 constituency boundaries', sourceName: 'Election results',
  sourceUrl: 'https://example.test/results/notional',
};
const boundarySets = [
  { id: 'new', label: '2024 election boundaries', sourceId: 'geometry-2024' },
  { id: 'old', label: '2010 election boundaries', sourceId: 'geometry-2010' },
];
const sources = [
  { id: 'geometry-2024', name: 'Boundary data 2024', attribution: 'Map source 2024', url: 'https://example.test/geo/2024', license: 'OGL' },
  { id: 'geometry-2010', name: 'Boundary data 2010', attribution: 'Map source 2010', url: 'https://example.test/geo/2010', license: 'OGL' },
];
const seat = (id, name, partyGroup, extra = {}) => ({
  id, name, region: 'London', partyGroup, colour: partyGroup === 'Labour' ? '#cc0000' : '#0087dc',
  majority: 123, turnout: 0.6, validVotes: 100,
  partyTotals: [{ party: partyGroup, votes: 100 }],
  ...extra,
});
const feature = (id) => ({ type: 'Feature', properties: { id, name: id }, geometry: {
  type: 'Polygon', coordinates: [[[-1, 51], [0, 51], [0, 52], [-1, 52], [-1, 51]]],
} });
const collection = (ids) => ({ type: 'FeatureCollection', features: ids.map(feature) });
const seats = Array.from({ length: 31 }, (_, index) => seat(`seat-${index}`, `Seat ${String(index).padStart(2, '0')}`, 'Labour'));
const priorSeats = seats.map((item) => seat(item.id, item.name, 'Conservative'));
const model = buildComparison(seats, priorSeats, election, comparison);
const pairs = filterComparisonPairs(model.pairs, { changesOnly: true, query: '', sort: 'name' });

const makeContext = (calls) => new Proxy({
  measureText: (value) => ({ width: String(value).length * 7 }),
}, {
  get(target, property) {
    if (property in target) return target[property];
    return (...args) => { if (property === 'fillText') calls.push(args); };
  },
  set(target, property, value) { target[property] = value; return true; },
});

afterEach(() => vi.restoreAllMocks());

describe('comparison PNG layout and rendering', () => {
  test('includes both maps and every active filtered matched row beyond the visible seat page', () => {
    const layout = buildComparisonPngLayout({
      election, comparison, model, pairs, filters: { area: 'London', changesOnly: true, query: '', sort: 'name' },
      boundaries: collection(seats.map((item) => item.id)), comparisonBoundaries: collection(priorSeats.map((item) => item.id)),
      boundarySets, sources,
    });

    expect(layout.maps).toHaveLength(2);
    expect(layout.maps.map((map) => map.features)).toHaveLength(2);
    expect(layout.filteredPairCount).toBe(31);
    expect(layout.seatRows).toHaveLength(31);
    expect(layout.resultRowCount).toBe(16);
    expect(layout.maps[0].coverage).toMatchObject({ seats: 31, mappedSeats: 31, completeVoteSeats: 31 });
    expect(layout.citations[0].citation).toContain('https://example.test/geo/2024');
    expect(layout.citations[0].citation).toContain('2024 election boundaries');
    expect(layout.filterDescription).toContain('London');
  });

  test('renders the last filtered result row into the PNG canvas', () => {
    const calls = [];
    const context = makeContext(calls);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const { canvas, layout } = renderComparisonPng({
      election, comparison, model, pairs, filters: { area: '', changesOnly: true, query: '', sort: 'name' },
      boundaries: collection(seats.map((item) => item.id)), comparisonBoundaries: collection(priorSeats.map((item) => item.id)),
      boundarySets, sources,
    });

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(layout.height);
    expect(calls.some(([value]) => value === 'Seat 30')).toBe(true);
  });

  test('uses separate maps and complete area party totals for cross-boundary comparisons', () => {
    const older = priorSeats.map((item, index) => seat(`old-${index}`, item.name, 'Conservative'));
    const crossBoundaryComparison = { ...comparison, id: '2019', label: '2019', boundarySetId: 'old', isNotional: false };
    const crossBoundaryModel = buildComparison(seats, older, election, crossBoundaryComparison, 'London');
    const layout = buildComparisonPngLayout({
      election, comparison: crossBoundaryComparison, model: crossBoundaryModel, pairs: [],
      filters: { area: 'London', changesOnly: true, query: 'irrelevant', sort: 'name' },
      boundaries: collection(seats.map((item) => item.id)), comparisonBoundaries: collection(older.slice(0, 12).map((item) => item.id)),
      boundarySets, sources,
    });

    expect(layout.sameBoundaries).toBe(false);
    expect(layout.areaPartyTotals).toBe(true);
    expect(layout.seatRows).toEqual([]);
    expect(layout.partyRows).toHaveLength(crossBoundaryModel.parties.length);
    expect(layout.maps.map((map) => map.features)).toHaveLength(2);
    expect(layout.maps[0].coverage.mappedSeats).toBe(31);
    expect(layout.maps[1].coverage).toMatchObject({ seats: 31, mappedSeats: 12 });
    expect(layout.citations[1].citation).toContain('https://example.test/geo/2010');
  });

  test('reports missing map and party-vote coverage instead of assuming complete inputs', () => {
    const partialSeats = [
      seat('a', 'A', 'Labour'),
      seat('b', 'B', 'Conservative', { validVotes: null, partyTotals: [] }),
    ];
    const partialComparisonSeats = partialSeats.map((item) => ({ ...item, id: `old-${item.id}` }));
    const partialElection = { ...election, boundarySetId: 'new' };
    const partialComparison = { ...comparison, boundarySetId: 'old' };
    const partialModel = buildComparison(partialSeats, partialComparisonSeats, partialElection, partialComparison);
    const layout = buildComparisonPngLayout({
      election: partialElection, comparison: partialComparison, model: partialModel, pairs: [],
      boundaries: collection(['a']), comparisonBoundaries: null, boundarySets, sources,
    });

    expect(layout.maps[0].coverage).toMatchObject({ seats: 2, mappedSeats: 1, completeVoteSeats: 1, featureCollectionPresent: true });
    expect(layout.maps[1].coverage).toMatchObject({ seats: 2, mappedSeats: 0, completeVoteSeats: 1, featureCollectionPresent: false });
  });
});
