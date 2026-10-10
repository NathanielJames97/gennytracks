import { describe, expect, test } from 'vitest';
import { readShareState, seatsToCsv, writeShareState } from './share';

describe('scenario sharing and exports', () => {
  test('round-trips regional overview filters without changing comparison-area state', () => {
    window.history.replaceState({}, '', '/gennytracks/?unrelated=1');
    writeShareState({ election: '2024', view: 'overview', region: 'Scotland', compareCompatible: true, comparisonFilters: { area: 'North East' } });
    expect(readShareState()).toMatchObject({ election: '2024', region: 'Scotland', compareCompatible: '1' });
    expect(new URLSearchParams(window.location.search).get('compareArea')).toBe('North East');
    expect(new URLSearchParams(window.location.search).get('unrelated')).toBe('1');
  });

  test('round-trips the complete structured scenario object in project URLs', () => {
    window.history.replaceState({}, '', '/gennytracks/?unrelated=1');
    const scenario = {
      method: 'national-rake-v1',
      geography: 'GB',
      requestedShares: { Labour: 35.2, Conservative: 23.8 },
      source: { kind: 'manual', id: 'entry-1', label: 'Manual inputs', url: 'https://example.test/method' },
      assumptions: ['Declared candidate slate only', 'NI remains at baseline'],
    };
    writeShareState({ election: '2024', view: 'scenario', scenario });
    expect(readShareState().scenario).toEqual(scenario);
    expect(window.location.pathname).toBe('/gennytracks/');
    expect(new URLSearchParams(window.location.search).get('unrelated')).toBe('1');
  });

  test('round-trips legacy single-party swing and method/eligibility fields', () => {
    window.history.replaceState({}, '', '/gennytracks/?unrelated=1');
    writeShareState({
      election: '2024',
      view: 'scenario',
      scenario: {
        party: 'Labour', swing: 0,
        methodVersion: 'uniform-party-share-shift-v1',
        eligibilityPolicy: 'declared-slate',
      },
    });
    expect(readShareState()).toMatchObject({
      swingParty: 'Labour',
      scenarioMethod: 'uniform-party-share-shift-v1',
      scenarioEligibility: 'declared-slate',
    });
    expect(readShareState().scenario).toMatchObject({ party: 'Labour', swing: 0 });
    expect(readShareState().swing).toBeUndefined();
    expect(new URLSearchParams(window.location.search).get('unrelated')).toBe('1');
  });

  test('exports scenario inputs, baseline, geography, boundaries, exclusions, and source links', () => {
    const election = {
      id: '2024',
      label: '2024',
      boundarySetId: '2024',
      boundaryLabel: '2024 constituency boundaries',
      sourceUrl: 'https://example.test/source',
    };
    const seats = [{
      id: 'A', name: 'Example', gss: 'E00000001', country: 'England', region: 'East',
      member: 'Example MP', partyGroup: 'Labour', winnerVotes: 60, winnerShare: 0.6,
      majority: 20, validVotes: 100, electorate: 120, turnout: 0.83,
      simulated: true, simulatedTargetParty: 'Labour',
      scenarioTargetEligible: false, scenarioExclusion: 'Labour absent from declared candidate slate',
      scenarioMethodVersion: 'uniform-party-share-shift-v1',
      scenarioEligibilityPolicy: 'declared-slate',
    }];
    const scenario = {
      method: 'national-rake-v1', geography: 'GB',
      requestedShares: { Labour: 35.2, Conservative: 23.8 },
      assumptions: ['Declared slate only'],
      source: { kind: 'manual', id: 'manual-input', label: 'Manual inputs', url: 'https://example.test/method' },
    };
    const csv = seatsToCsv(seats, election, true, scenario);
    for (const heading of [
      'baseline_election_id', 'baseline_election', 'geography', 'boundary_set',
      'method_version', 'input_party', 'input_change_pp', 'requested_shares',
      'eligibility_policy', 'scenario_exclusions', 'scenario_assumptions',
      'scenario_source_kind', 'scenario_source_id', 'scenario_source_label',
      'scenario_source_url', 'scenario_json', 'source_links',
    ]) expect(csv).toContain('"' + heading + '"');
    expect(csv).toContain('"2024","2024","GB","2024 constituency boundaries"');
    expect(csv).toContain('"national-rake-v1"');
    expect(csv).toContain('"manual","manual-input","Manual inputs","https://example.test/method"');
    expect(csv).toContain('"Labour absent from declared candidate slate"');
    expect(csv).toContain('https://example.test/source');
  });

  test('ignores malformed scenario JSON without losing legacy URL state', () => {
    window.history.replaceState({}, '', '/?election=2024&scenario=%7Bbroken&swingParty=Labour');
    expect(readShareState()).toMatchObject({ election: '2024', swingParty: 'Labour' });
    expect(readShareState().scenario).toBeUndefined();
  });

  test('CSV quoting escapes quotes and protects spreadsheet formulas', () => {
    const csv = seatsToCsv([{
      id: 'A', name: '=HYPERLINK("https://example.test")', partyGroup: 'Labour',
    }], { id: '2024', sourceUrl: 'https://example.test' });
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain('""https://example.test""');
  });
});
