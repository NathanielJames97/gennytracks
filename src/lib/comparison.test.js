import { describe, expect, test } from 'vitest';
import { buildComparison, filterComparisonPairs, comparisonToCsv, DEFAULT_COMPARISON_FILTERS } from './comparison';
import { readShareState, writeShareState } from './share';
const election = { id: '2024', label: '2024', boundarySetId: 'new', sourceUrl: 'https://example.test/current' };
const baseline = { id: '2019-notional', label: '2019 notional', boundarySetId: 'new', isNotional: true, sourceUrl: 'https://example.test/baseline' };
const seat = (id, region, partyGroup, votes, extra = {}) => ({ id, name: id, region, partyGroup,
  validVotes: 100, majority: 10, turnout: .6, partyTotals: [{ party: 'Labour', votes }, { party: 'Conservative', votes: 100 - votes }], ...extra });
const selected = [seat('A', 'London', 'Labour', 60), seat('B', 'Eastern', 'Conservative', 20, { majority: null })];
const previous = [seat('A', 'London', 'Conservative', 40, { turnout: null }), seat('B', 'East of England', 'Conservative', 30, { majority: 20 })];
describe('boundary-aware comparison analysis', () => {
  test('aggregates regional votes and normalizes historical region names', () => {
    const model = buildComparison(selected, previous, election, baseline, 'East of England');
    expect(model.current).toHaveLength(1);
    expect(model.previous).toHaveLength(1);
    expect(model.pairs).toHaveLength(1);
    expect(model.parties.find((p) => p.party === 'Labour').selectedShare).toBe(.2);
    expect(model.parties.find((p) => p.party === 'Labour').shareDelta).toBeCloseTo(-.1);
  });
  test('excludes null measurements and reports the actual coverage', () => {
    const model = buildComparison(selected, previous, election, baseline);
    expect(model.majority).toEqual({ value: 0, count: 1 });
    expect(model.turnout).toEqual({ value: 0, count: 1 });
    expect(model.changed).toBe(1);
  });
  test('never joins seat identifiers across incompatible boundaries', () => {
    const model = buildComparison(selected, previous, election, { ...baseline, boundarySetId: 'old' });
    expect(model.sameBoundaries).toBe(false);
    expect(model.pairs).toHaveLength(0);
    expect(model.parties).toHaveLength(2);
    const csv = comparisonToCsv(model, [], election, baseline, DEFAULT_COMPARISON_FILTERS);
    expect(csv).toContain('selected_vote_share');
    expect(csv).not.toContain('winner_changed');
  });
  test('requires known boundary sets and preserves missing vote totals', () => {
    const model = buildComparison([{ ...selected[0], partyTotals: [], candidates: [] }], previous, {}, {});
    expect(model.sameBoundaries).toBe(false);
    expect(model.parties.every((p) => p.shareDelta === null)).toBe(true);
  });
  test('sums multiple candidates for a party and weights by votes, not mean shares', () => {
    const a = { ...selected[0], partyTotals: [], validVotes: 100, candidates: [{ partyGroup: 'Labour', votes: 30 }, { partyGroup: 'Labour', votes: 20 }, { partyGroup: 'Conservative', votes: 50 }] };
    const b = { ...selected[1], validVotes: 900, partyTotals: [{ party: 'Labour', votes: 90 }, { party: 'Conservative', votes: 810 }] };
    const model = buildComparison([a, b], previous, election, baseline);
    expect(model.parties.find((p) => p.party === 'Labour').selectedShare).toBe(.14);
  });
  test('search includes both parties and unchanged seats can be included', () => {
    const model = buildComparison(selected, previous, election, baseline);
    expect(filterComparisonPairs(model.pairs, DEFAULT_COMPARISON_FILTERS)).toHaveLength(1);
    expect(filterComparisonPairs(model.pairs, { changesOnly: false, query: 'conservative', sort: 'margin' })).toHaveLength(2);
    expect(filterComparisonPairs(model.pairs, { changesOnly: true, query: 'zzz' })).toHaveLength(0);
  });
  test('exports exact filtered rows with source and assumption metadata', () => {
    const model = buildComparison(selected, previous, election, baseline);
    const pairs = filterComparisonPairs(model.pairs, DEFAULT_COMPARISON_FILTERS);
    const csv = comparisonToCsv(model, pairs, election, baseline, DEFAULT_COMPARISON_FILTERS);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('https://example.test/baseline');
    expect(csv).toContain('"declared","notional"');
    expect(csv).toContain('"A","A","A"');
    expect(csv).not.toContain('"B","B","B"');
  });
  test('escapes quotes and neutralizes spreadsheet formulas in names', () => {
    const model = buildComparison([{ ...selected[0], name: '=A1+"x"' }], previous, election, baseline);
    expect(comparisonToCsv(model, model.pairs, election, baseline, DEFAULT_COMPARISON_FILTERS)).toContain(`"'=A1+""x"""`);
  });
  test('round-trips comparison filters in a project-subpath URL', () => {
    window.history.replaceState({}, '', '/gennytracks/?unrelated=1');
    writeShareState({ election: '2024', view: 'compare', compare: baseline.id,
      comparisonFilters: { area: 'London', changesOnly: false, query: 'Labour', sort: 'turnout' } });
    expect(readShareState()).toMatchObject({ compareArea: 'London', compareChanges: '0', compareQuery: 'Labour', compareSort: 'turnout' });
    expect(window.location.pathname).toBe('/gennytracks/');
    writeShareState({ election: '2024', view: 'overview' });
    expect(readShareState().compareArea).toBeUndefined();
    expect(new URLSearchParams(window.location.search).get('unrelated')).toBe('1');
  });
});

test('equivalent party spellings never create false gains or split vote shares', () => {
  const current = [seat('Bath', 'South West', 'Liberal Democrats', 60, { partyTotals: [{ party: 'Liberal Democrats', votes: 100 }] })];
  const old = [seat('Bath', 'South West', 'Liberal Democrat', 60, { partyTotals: [{ party: 'Liberal Democrat', votes: 100 }] })];
  const model = buildComparison(current, old, election, baseline);
  expect(model.changed).toBe(0);
  expect(model.parties).toHaveLength(1);
  expect(model.parties[0]).toMatchObject({ party: 'Liberal Democrats', selected: 1, previous: 1, shareDelta: 0 });
});
