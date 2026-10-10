import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { averagePolls, buildScenarioFromPoll } from './polling';

const baseline = {
  Labour: 40,
  Conservative: 35,
  'Scottish National': 10,
  'Plaid Cymru': 5,
  Other: 10,
};

describe('polling aggregation and scenario conversion', () => {
  test('average uses only the latest verified non-MRP poll per pollster and never treats a missing share as zero', () => {
    const polls = [
      { id: 'a-old', pollster: 'A', date: '2026-09-01', geography: 'GB', type: 'voting-intention', shares: { Labour: 40, Conservative: 30 } },
      { id: 'a-new', pollster: 'A', date: '2026-09-20', geography: 'GB', type: 'voting-intention', shares: { Labour: 50 } },
      { id: 'b', pollster: 'B', date: '2026-09-18', geography: 'GB', type: 'voting-intention', shares: { Labour: 30, Conservative: 40 } },
      { id: 'mrp', pollster: 'C MRP', date: '2026-09-19', geography: 'GB', type: 'MRP', shares: { Labour: 99 } },
      { id: 'uk', pollster: 'D', date: '2026-09-19', geography: 'UK', type: 'voting-intention', shares: { Labour: 90 } },
      { id: 'unknown', pollster: 'E', date: '2026-09-19', geography: 'unverified', shares: { Labour: 90 } },
    ];
    const result = averagePolls(polls, { geography: 'GB', asOf: '2026-09-21', windowDays: 30 });
    expect(result.includedPolls.map((poll) => poll.id).sort()).toEqual(['a-new', 'b']);
    expect(result.shares.Labour).toEqual({ value: 40, pollCount: 2 });
    expect(result.shares.Conservative).toEqual({ value: 40, pollCount: 1 });
    expect(result.exclusions.some((item) => item.poll.id === 'mrp' && item.reason.includes('MRP'))).toBe(true);
    expect(result.exclusions.some((item) => item.poll.id === 'unknown' && item.reason.includes('unverified'))).toBe(true);
  });

  test('rounded and combined party categories become a complete, documented scenario vector', () => {
    const poll = {
      id: 'ipsos-final', pollster: 'Ipsos', date: '2024-07-03', geography: 'GB', type: 'voting-intention',
      shares: { Conservative: 19, Labour: 37, 'Liberal Democrats': 11, 'SNP/Plaid Cymru': 7, Green: 9, 'Reform UK': 15, Other: 3 },
      sourceUrl: 'https://example.test/poll',
    };
    const scenario = buildScenarioFromPoll(poll, baseline);
    expect(Object.values(scenario.requestedShares).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
    expect(scenario.requestedShares['Scottish National']).toBeCloseTo(7 * 10 / 15 * 100 / 101);
    expect(scenario.requestedShares['Plaid Cymru']).toBeCloseTo(7 * 5 / 15 * 100 / 101);
    expect(scenario.assumptions.some((item) => item.includes('normalised to 100%'))).toBe(true);
    expect(scenario.source.url).toBe(poll.sourceUrl);
  });

  test('poll completion carries source-specific qualifications into the scenario assumptions', () => {
    const poll = {
      id: 'ipsos-2015-final', pollster: 'Ipsos', geography: 'GB', type: 'voting-intention',
      shares: { Conservative: 36, Labour: 35, 'Liberal Democrats': 8, 'UK Independence Party': 11, Green: 5, 'Scottish National Party': 5 },
      scenarioNote: 'Other is reported only as less than 0.5%, with no point estimate.',
    };
    const scenario = buildScenarioFromPoll(poll, baseline, { baselineElection: { id: '2010', label: '2010' } });
    expect(scenario.assumptions.some((item) => item.includes('2010 ballot'))).toBe(true);
    expect(scenario.assumptions).toContain(poll.scenarioNote);
  });

  test('a poll with a different geography or an MRP cannot enter the scenario', () => {
    expect(() => buildScenarioFromPoll({ geography: 'UK', type: 'voting-intention', shares: { Labour: 50 } }, baseline, { geography: 'GB' })).toThrow(/geography/);
    expect(() => buildScenarioFromPoll({ geography: 'GB', type: 'MRP', shares: { Labour: 50 } }, baseline)).toThrow(/MRP/);
  });  test('the curated snapshot carries attribution and only verified matching non-MRP rows enter its average', () => {
    const data = JSON.parse(readFileSync('public/data/polls.json', 'utf8'));
    expect(data.provider.license).toBe('CC BY 4.0');
    expect(data.provider.sourceUrl).toContain('https://');
    expect(data.polls.length).toBeGreaterThan(0);
    expect(new Set(data.polls.map((poll) => poll.id)).size).toBe(data.polls.length);
    data.polls.forEach((poll) => Object.values(poll.shares || {}).forEach((value) => {
      expect(Number.isFinite(Number(value))).toBe(true);
      expect(Number(value)).toBeGreaterThanOrEqual(0);
      expect(Number(value)).toBeLessThanOrEqual(100);
    }));
    const average = averagePolls(data, { geography: 'GB', asOf: data.updatedAt, windowDays: 30 });
    expect(average.includedPolls.length).toBeGreaterThan(0);
    expect(average.includedPolls.every((poll) => poll.geography === 'GB' && !/MRP/i.test(poll.type || ''))).toBe(true);
    expect(average.exclusions.some(({ poll }) => /MRP/i.test(poll.type || ''))).toBe(true);
    expect(average.exclusions.some(({ poll }) => poll.geography === 'unverified')).toBe(true);
    const historical = data.polls.filter((poll) => poll.backtest);
    expect(historical.map((poll) => poll.backtest.targetElectionId).sort()).toEqual(['2015', '2017', '2019', '2024']);
    historical.forEach((poll) => {
      expect(poll.pollster).toBe('Ipsos');
      expect(poll.geography).toBe('GB');
      expect(poll.sourceUrl).toMatch(/^https:\/\//);
      expect(poll.fieldworkStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(poll.fieldworkEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

});
