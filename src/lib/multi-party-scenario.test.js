import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  calculateBaselineShares, calculateScenarioSeatCounts, calculateScenarioShares,
  isCompleteShareVector, NATIONAL_RAKE_SCENARIO_METHOD, simulatePartyShareScenario,
} from './multi-party-scenario';

const rows = [
  { id: 'gb-1', name: 'GB One', country: 'England', partyGroup: 'Labour', validVotes: 100, winnerVotes: 60, winnerShare: 0.6, majority: 20, majorityShare: 0.2, member: 'Lab candidate', candidates: [
    { name: 'Lab candidate', party: 'Labour', partyGroup: 'Labour', votes: 60 },
    { name: 'Con candidate', party: 'Conservative', partyGroup: 'Conservative', votes: 40 },
  ] },
  { id: 'gb-2', name: 'GB Two', country: 'Scotland', partyGroup: 'Conservative', validVotes: 900, winnerVotes: 900, winnerShare: 1, majority: 900, member: 'Con candidate', candidates: [
    { name: 'Con candidate', party: 'Conservative', partyGroup: 'Conservative', votes: 900 },
    { name: 'Green candidate', party: 'Green', partyGroup: 'Green', votes: 0 },
  ] },
  { id: 'ni-1', name: 'NI One', country: 'Northern Ireland', partyGroup: 'Independent', validVotes: 100, winnerVotes: 70, winnerShare: 0.7, majority: 40, member: 'Independent A', candidates: [
    { name: 'Independent A', party: 'Independent', partyGroup: 'Independent', votes: 60 },
    { name: 'Independent B', party: 'Independent', partyGroup: 'Independent', votes: 10 },
    { name: 'Lab candidate', party: 'Labour', partyGroup: 'Labour', votes: 30 },
  ] },
];

describe('multi-party scenario calculations', () => {
  test('baseline shares are weighted by valid votes and keep NI outside a GB total', () => {
    const baseline = calculateBaselineShares(rows, { geography: 'GB' });
    expect(baseline.includedSeats).toBe(2);
    expect(baseline.excludedSeats).toBe(1);
    expect(baseline.shares.Labour).toBeCloseTo(6);
    expect(baseline.shares.Conservative).toBeCloseTo(94);
    expect(Object.values(baseline.shares).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
  });

  test('a zero change preserves every declared winner, vote share and margin', () => {
    const baseline = calculateBaselineShares(rows, { geography: 'GB' });
    const result = simulatePartyShareScenario(rows, { requestedShares: baseline.shares, baselineShares: baseline });
    expect(result.map((seat) => [seat.partyGroup, seat.winnerShare, seat.majority]))
      .toEqual(rows.map((seat) => [seat.partyGroup, seat.winnerShare, seat.majority]));
    expect(result[2].scenarioHeldAtBaseline).toBe(true);
    expect(result[0].scenarioIsBaseline).toBe(true);
  });

  test('no hypothetical local candidates are added and same-party candidate identities remain separate', () => {
    const baseline = calculateBaselineShares(rows, { geography: 'GB' });
    const requested = { Labour: 10, Conservative: 80, Green: 10 };
    const result = simulatePartyShareScenario(rows, { requestedShares: requested, baselineShares: baseline });
    expect(result[0].simulatedCandidates).toHaveLength(2);
    expect(result[0].simulatedCandidates.map((candidate) => candidate.name).sort()).toEqual(['Con candidate', 'Lab candidate']);
    expect(result[2].simulatedCandidates.filter((candidate) => candidate.party === 'Independent')).toHaveLength(2);
    expect(result.every((seat) => Math.abs(seat.simulatedCandidates.reduce((sum, candidate) => sum + candidate.share, 0) - 1) < 1e-10)).toBe(true);
  });

  test('achieved national shares weight each seat by its valid vote count', () => {
    const baseline = calculateBaselineShares(rows, { geography: 'GB' });
    const result = simulatePartyShareScenario(rows, { requestedShares: baseline.shares, baselineShares: baseline });
    const achieved = calculateScenarioShares(result, { geography: 'GB' });
    expect(achieved.shares.Labour).toBeCloseTo(6);
    expect(achieved.shares.Conservative).toBeCloseTo(94);
    expect(achieved.includedSeats).toBe(2);
  });

  test('GB party seat totals exclude Northern Ireland and count projected winners', () => {
    const baseline = calculateBaselineShares(rows, { geography: 'GB' });
    const result = simulatePartyShareScenario(rows, { requestedShares: baseline.shares, baselineShares: baseline });
    expect(calculateScenarioSeatCounts(result, { geography: 'GB' })).toEqual({ Conservative: 1, Labour: 1 });
  });

  test('seat comparisons retain declared party counts after projected winners change', () => {
    const projection = simulatePartyShareScenario(rows.slice(0, 2), {
      baselineShares: { shares: { Labour: 70, Conservative: 30, Green: 0 } },
      requestedShares: { Labour: 0, Conservative: 100, Green: 0 },
    });
    expect(projection[0].projectedParty).toBe('Conservative');
    expect(projection[0].partyGroup).toBe('Conservative');
    expect(calculateScenarioSeatCounts(projection, { geography: 'GB', projected: false }))
      .toEqual({ Conservative: 1, Labour: 1 });
    expect(calculateScenarioSeatCounts(projection, { geography: 'GB' }))
      .toEqual({ Conservative: 2 });
  });

  test('share-vector validation rejects missing or blank categories', () => {
    expect(isCompleteShareVector({ Labour: 60, Conservative: 40 }, ['Labour', 'Conservative'])).toBe(true);
    expect(isCompleteShareVector({ Labour: 60, Conservative: '' }, ['Labour', 'Conservative'])).toBe(false);
    expect(isCompleteShareVector({ Labour: 60 }, ['Labour', 'Conservative'])).toBe(false);
  });

  test.skipIf(!existsSync('public/data/elections/2024.json'))('2024 zero-change scenario preserves all 650 declared winners and margins', () => {
    const bundle = JSON.parse(readFileSync('public/data/elections/2024.json', 'utf8'));
    const seats = bundle.results || bundle;
    const baseline = calculateBaselineShares(seats, { geography: 'GB' });
    for (const method of ['uniform-party-delta-v1', NATIONAL_RAKE_SCENARIO_METHOD]) {
      const result = simulatePartyShareScenario(seats, { requestedShares: baseline.shares, baselineShares: baseline, method });
      expect(result).toHaveLength(650);
      expect(result.map((seat) => [seat.partyGroup, seat.winnerShare, seat.majority]))
        .toEqual(seats.map((seat) => [seat.partyGroup, seat.winnerShare, seat.majority]));
    }
    expect(baseline.includedSeats).toBe(632);
    expect(baseline.excludedSeats).toBe(18);
  });
  test('NI, GB and UK scenarios use separate vote baselines and seat denominators', () => {
    const gb = calculateBaselineShares(rows, { geography: 'GB' });
    const ni = calculateBaselineShares(rows, { geography: 'NI' });
    const uk = calculateBaselineShares(rows, { geography: 'UK' });
    expect(gb.includedSeats).toBe(2);
    expect(ni.includedSeats).toBe(1);
    expect(uk.includedSeats).toBe(3);
    const niScenario = simulatePartyShareScenario(rows, {
      requestedShares: ni.shares, baselineShares: ni, geography: 'NI',
    });
    expect(niScenario[2].scenarioIsBaseline).toBe(true);
    expect(niScenario.slice(0, 2).every((seat) => seat.scenarioHeldAtBaseline)).toBe(true);
    expect(calculateScenarioSeatCounts(niScenario, { geography: 'NI' })).toEqual({ Independent: 1 });
  });

  test('a manual country override uses that country baseline and changes only its seats', () => {
    const gb = calculateBaselineShares(rows, { geography: 'GB' });
    const rawEngland = calculateBaselineShares(rows, { geography: 'GB', region: 'England' });
    const england = {
      ...rawEngland,
      shares: Object.fromEntries(Object.keys(gb.shares).map((party) => [party, rawEngland.shares[party] || 0])),
    };
    const requestedEngland = { Labour: 40, Conservative: 60, Green: 0 };
    const result = simulatePartyShareScenario(rows, {
      requestedShares: gb.shares,
      baselineShares: gb,
      geography: 'GB',
      regionalShares: { England: requestedEngland },
      regionalBaselineShares: { England: england },
    });
    expect(result[0].projectedParty).toBe('Conservative');
    expect(result[0].scenarioRegion).toBe('England');
    expect(result[1].projectedParty).toBe('Conservative');
    expect(result[1].scenarioRegion).toBe(null);
  });

  test('calibrated allocation exactly matches feasible national shares and keeps seat vote totals fixed', () => {
    const baseline = calculateBaselineShares(rows, { geography: 'GB' });
    const requestedShares = { Labour: 10, Conservative: 90, Green: 0 };
    const result = simulatePartyShareScenario(rows, {
      baselineShares: baseline,
      requestedShares,
      method: NATIONAL_RAKE_SCENARIO_METHOD,
    });
    const achieved = calculateScenarioShares(result, { geography: 'GB' });
    expect(Math.abs(achieved.shares.Labour - requestedShares.Labour)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(achieved.shares.Conservative - requestedShares.Conservative)).toBeLessThanOrEqual(0.01);
    expect(achieved.shares.Labour).toBeCloseTo(10, 1);
    expect(achieved.shares.Conservative).toBeCloseTo(90, 1);
    expect(achieved.shares.Green || 0).toBeCloseTo(0, 7);
    expect(result.slice(0, 2).map((seat) => seat.simulatedCandidates.reduce((sum, row) => sum + row.share, 0)))
      .toEqual([1, 1]);
    expect(result[0].scenarioMethodVersion).toBe(NATIONAL_RAKE_SCENARIO_METHOD);
  });

  test('calibrated allocation rejects targets that the declared candidate slate cannot meet', () => {
    const baseline = calculateBaselineShares(rows, { geography: 'GB' });
    expect(() => simulatePartyShareScenario(rows, {
      baselineShares: baseline,
      requestedShares: { Labour: 11, Conservative: 89, Green: 0 },
      method: NATIONAL_RAKE_SCENARIO_METHOD,
    })).toThrow(/eligibility shortfall/);
  });

  test('calibrated country overrides and Great Britain targets reconcile to exact totals', () => {
    const baseline = calculateBaselineShares(rows, { geography: 'GB' });
    const england = calculateBaselineShares(rows, { geography: 'GB', region: 'England' });
    const paddedEngland = {
      ...england,
      shares: Object.fromEntries(Object.keys(baseline.shares).map((party) => [party, england.shares[party] || 0])),
    };
    const result = simulatePartyShareScenario(rows, {
      baselineShares: baseline,
      requestedShares: { Labour: 4, Conservative: 96, Green: 0 },
      regionalShares: { England: { Labour: 40, Conservative: 60, Green: 0 } },
      regionalBaselineShares: { England: paddedEngland },
      method: NATIONAL_RAKE_SCENARIO_METHOD,
    });
    const achieved = calculateScenarioShares(result, { geography: 'GB' });
    expect(achieved.shares.Labour).toBeCloseTo(4, 7);
    expect(achieved.shares.Conservative).toBeCloseTo(96, 7);
    expect(result[0].simulatedPartyShares.Labour).toBeCloseTo(0.4, 7);
    expect(result[1].simulatedPartyShares.Conservative).toBeCloseTo(1, 7);
  });

});
