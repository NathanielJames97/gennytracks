import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { backtestAllocation, backtestPollToSeats } from './backtest';
import { NATIONAL_RAKE_SCENARIO_METHOD, PARTY_SCENARIO_METHOD } from './multi-party-scenario';

const electionA = [
  { id: 'one', country: 'England', partyGroup: 'Labour', validVotes: 100, majorityShare: 0.1, candidates: [
    { name: 'Lab', party: 'Labour', partyGroup: 'Labour', votes: 55 },
    { name: 'Con', party: 'Conservative', partyGroup: 'Conservative', votes: 45 },
  ] },
  { id: 'two', country: 'Wales', partyGroup: 'Conservative', validVotes: 100, majorityShare: 0.1, candidates: [
    { name: 'Con', party: 'Conservative', partyGroup: 'Conservative', votes: 55 },
    { name: 'Lab', party: 'Labour', partyGroup: 'Labour', votes: 45 },
  ] },
];
const electionB = [
  { id: 'one', country: 'England', partyGroup: 'Labour', validVotes: 100, majorityShare: 0.04, candidates: [
    { name: 'Lab', party: 'Labour', partyGroup: 'Labour', votes: 52 },
    { name: 'Con', party: 'Conservative', partyGroup: 'Conservative', votes: 48 },
  ] },
  { id: 'two', country: 'Wales', partyGroup: 'Labour', validVotes: 100, majorityShare: 0.02, candidates: [
    { name: 'Lab', party: 'Labour', partyGroup: 'Labour', votes: 51 },
    { name: 'Con', party: 'Conservative', partyGroup: 'Conservative', votes: 49 },
  ] },
];

describe('election backtests', () => {
  test('allocation-only score separates eventual national inputs from local allocation accuracy', () => {
    const result = backtestAllocation(electionA, electionB, { baselineElection: { id: 'A' }, targetElection: { id: 'B' } });
    expect(result.kind).toBe('allocation-only');
    expect(result.metrics.matchedSeats).toBe(2);
    expect(result.metrics.closeSeats).toBe(2);
    expect(result.metrics.winnerAccuracy).toBeGreaterThanOrEqual(0);
    expect(result.metrics.seatCounts.map((row) => row.party)).toContain('Labour');
  });

  test('poll-to-seat score records a dated input and completion assumptions', () => {
    const poll = { id: 'final', pollster: 'Pollster', date: '2024-07-01', geography: 'GB', type: 'voting-intention', shares: { Labour: 50, Conservative: 50 }, sourceUrl: 'https://example.test' };
    const result = backtestPollToSeats(electionA, electionB, poll);
    expect(result.kind).toBe('poll-to-seat');
    expect(result.metrics.matchedSeats).toBe(2);
    expect(result.scenario.source.id).toBe('final');
  });

  test('allocation backtests accept and report the calibrated method version', () => {
    const result = backtestAllocation(electionA, electionB, { method: NATIONAL_RAKE_SCENARIO_METHOD });
    expect(result.method).toBe(NATIONAL_RAKE_SCENARIO_METHOD);
    expect(result.metrics.matchedSeats).toBe(2);
    expect(result.scenarioInputShares.Labour + result.scenarioInputShares.Conservative).toBeCloseTo(100);
  });

  test('poll backtests preserve their selected allocation method', () => {
    const poll = { id: 'final', pollster: 'Pollster', date: '2024-07-01', geography: 'GB', type: 'voting-intention', shares: { Labour: 50, Conservative: 50 }, sourceUrl: 'https://example.test' };
    const result = backtestPollToSeats(electionA, electionB, poll, { method: NATIONAL_RAKE_SCENARIO_METHOD });
    expect(result.method).toBe(NATIONAL_RAKE_SCENARIO_METHOD);
    expect(result.metrics.matchedSeats).toBe(2);
  });

  test.skipIf(!existsSync('public/data/elections/2024.json'))('calibrated and poll-to-seat methods run across every bundled historical pair', () => {
    const electionIds = ['2010', '2015', '2017', '2019', '2019-notional-2024', '2024'];
    const elections = Object.fromEntries(electionIds.map((id) => {
      const bundle = JSON.parse(readFileSync('public/data/elections/' + id + '.json', 'utf8'));
      return [id, bundle.results || bundle];
    }));
    const pairs = [
      ['2010', '2015'], ['2015', '2017'], ['2017', '2019'], ['2019-notional-2024', '2024'],
    ];
    pairs.forEach(([baselineId, targetId]) => {
      [PARTY_SCENARIO_METHOD, NATIONAL_RAKE_SCENARIO_METHOD].forEach((method) => {
        const result = backtestAllocation(elections[baselineId], elections[targetId], { method });
        expect(result.metrics.matchedSeats, baselineId + ' to ' + targetId + ' · ' + method).toBeGreaterThan(0);
        expect(Number.isFinite(result.metrics.winnerAccuracy)).toBe(true);
      });
    });

    const pollData = JSON.parse(readFileSync('public/data/polls.json', 'utf8'));
    const pollResults = [];
    pollData.polls.filter((poll) => poll.backtest).forEach((poll) => {
      [PARTY_SCENARIO_METHOD, NATIONAL_RAKE_SCENARIO_METHOD].forEach((method) => {
        try {
          const result = backtestPollToSeats(
            elections[poll.backtest.baselineElectionId],
            elections[poll.backtest.targetElectionId],
            poll,
            { method },
          );
          expect(result.metrics.matchedSeats, poll.id + ' · ' + method).toBeGreaterThan(0);
          expect(Number.isFinite(result.metrics.winnerAccuracy), poll.id + ' · ' + method).toBe(true);
          pollResults.push({ id: poll.id, method, available: true });
        } catch (error) { pollResults.push({ id: poll.id, method, available: false, error: error.message }); }
      });
    });
    const unavailable = pollResults.filter((result) => !result.available);
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]).toMatchObject({ id: 'ipsos-2024-final', method: NATIONAL_RAKE_SCENARIO_METHOD });
    expect(unavailable[0].error).toMatch(/eligibility shortfall/);
  });
});
