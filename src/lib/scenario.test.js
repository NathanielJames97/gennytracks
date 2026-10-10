import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';
import { simulateUniformSwing } from './scenario';

const bundled2024Path = 'build/data/elections/2024.json';

const bradfordWest = {
  id: 'E08000032', name: 'Bradford West', country: 'England', partyGroup: 'Labour',
  validVotes: 37081, winnerVotes: 11724, winnerShare: 11724 / 37081, majority: 707,
  candidates: [
    { name: 'Naz Shah', party: 'Labour', votes: 11724 },
    { name: 'Muhammed Islam', party: 'Independent', votes: 11017 },
    { name: 'Khalid Mahmood', party: 'Green', votes: 3690 },
    { name: 'Akeel Hussain', party: 'Independent', votes: 3547 },
    { name: 'Nigel Moxon', party: 'Conservative', votes: 3055 },
    { name: 'Jamie Hinton-Wardle', party: 'Reform UK', votes: 2958 },
    { name: 'Imad Ahmed', party: 'Liberal Democrat', votes: 756 },
    { name: 'Umar Ghafoor', party: 'Independent', votes: 334 },
  ],
  // This published convenience category deliberately groups the independents.
  partyTotals: [
    { party: 'Labour', votes: 11724 }, { party: 'Independent', votes: 14898 },
    { party: 'Green', votes: 3690 }, { party: 'Conservative', votes: 3055 },
    { party: 'Reform UK', votes: 2958 }, { party: 'Liberal Democrat', votes: 756 },
  ],
};

describe('uniform party vote-share change', () => {
  test('a zero-point Labour shift preserves the declared Bradford West winner and share', () => {
    const [seat] = simulateUniformSwing([bradfordWest], 'Labour', 0);
    expect(seat).toMatchObject({
      partyGroup: 'Labour',
      winnerVotes: 11724,
      winnerShare: bradfordWest.winnerShare,
      majority: 707,
      simulatedTargetParty: 'Labour',
      scenarioTargetEligible: true,
    });
    expect(seat.simulatedCandidates.filter((row) => row.party === 'Independent')).toHaveLength(3);
    expect(seat.simulatedCandidates.map((row) => row.id)).toHaveLength(8);
  });

  test('a small loss keeps independent candidates separate instead of pooling their votes', () => {
    const [seat] = simulateUniformSwing([bradfordWest], 'Labour', -2);
    expect(seat.partyGroup).toBe('Independent');
    expect(seat.member).toBe('Muhammed Islam');
    expect(seat.simulatedCandidates[0].name).toBe('Muhammed Islam');
    expect(seat.simulatedCandidates.filter((row) => row.party === 'Independent')).toHaveLength(3);
  });

  test.skipIf(!existsSync(bundled2024Path))('zero change preserves the declared winners and shares in all 650 current seats', () => {
    const seats = JSON.parse(readFileSync(bundled2024Path, 'utf8'));
    expect(seats).toHaveLength(650);
    const projected = simulateUniformSwing(seats, 'Labour', 0);
    expect(projected.map((seat) => seat.partyGroup)).toEqual(seats.map((seat) => seat.partyGroup));
    expect(projected.map((seat) => seat.winnerShare)).toEqual(seats.map((seat) => seat.winnerShare));
    expect(projected.map((seat) => seat.majority)).toEqual(seats.map((seat) => seat.majority));
    expect(projected.every((seat) => seat.scenarioTargetEligible !== undefined)).toBe(true);
  });

  test('missing vote totals keep the published baseline instead of treating missing votes as zero', () => {
    const seat = {
      id: 'missing', name: 'Missing data', partyGroup: 'Labour', winnerShare: 0.6, majority: 20,
      candidates: [
        { name: 'Labour candidate', party: 'Labour', votes: 60 },
        { name: 'Conservative candidate', party: 'Conservative', votes: null },
      ],
    };
    const [projected] = simulateUniformSwing([seat], 'Labour', 5);
    expect(projected).toMatchObject({
      partyGroup: 'Labour', winnerShare: 0.6, majority: 20,
      scenarioExclusion: 'vote totals unavailable or invalid; baseline retained',
    });
    expect(projected.simulatedCandidates).toEqual([]);
  });

  test('resolves an exact projected tie by the source candidate order', () => {
    const seat = {
      id: 'tie', name: 'Tie', partyGroup: 'Labour',
      candidates: [
        { name: 'Labour candidate', party: 'Labour', votes: 60 },
        { name: 'Conservative candidate', party: 'Conservative', votes: 40 },
      ],
    };
    const [projected] = simulateUniformSwing([seat], 'Labour', -10);
    expect(projected.simulatedCandidates[0].share).toBeCloseTo(0.5);
    expect(projected.simulatedCandidates[1].share).toBeCloseTo(0.5);
    expect(projected.partyGroup).toBe('Labour');
  });
  test('a one-contender seat retains 100 percent when no other candidate can receive a shift', () => {
    const seat = {
      id: 'unopposed', name: 'Unopposed', partyGroup: 'Labour', winnerShare: 1,
      candidates: [{ name: 'Labour candidate', party: 'Labour', votes: 100 }],
    };
    const [projected] = simulateUniformSwing([seat], 'Labour', -10);
    expect(projected.simulatedCandidates).toHaveLength(1);
    expect(projected.simulatedCandidates[0].share).toBe(1);
    expect(projected.simulatedCandidates.reduce((sum, row) => sum + row.share, 0)).toBe(1);
    expect(projected.scenarioExclusion).toBe('no other declared contender for vote-share reallocation');
  });
  test('an absent party is ineligible and the local shares remain at 100 percent', () => {
    const absentTargetSeat = {
      id: 'synthetic', name: 'Synthetic', partyGroup: 'Labour', validVotes: 100,
      candidates: [
        { name: 'Labour candidate', party: 'Labour', votes: 55 },
        { name: 'Conservative candidate', party: 'Conservative', votes: 45 },
      ],
    };
    const [seat] = simulateUniformSwing([absentTargetSeat], 'Reform UK', 15);
    expect(seat).toMatchObject({
      partyGroup: 'Labour',
      scenarioTargetEligible: false,
      scenarioExclusion: 'Reform UK absent from declared candidate slate',
    });
    expect(seat.simulatedCandidates.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
    expect(seat.simulatedCandidates.map((row) => row.share)).toEqual([0.55, 0.45]);
  });

  test('clips the target share and proportionally rescales only the other declared contenders', () => {
    const [over] = simulateUniformSwing([bradfordWest], 'Labour', 90);
    expect(over.simulatedCandidates[0].party).toBe('Labour');
    expect(over.simulatedCandidates[0].share).toBe(1);
    expect(over.simulatedCandidates.slice(1).every((row) => row.share === 0)).toBe(true);
    expect(over.simulatedCandidates.every((row) => row.share >= 0 && row.share <= 1)).toBe(true);
    expect(over.simulatedCandidates.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
  });

  test('uses canonical party names and preserves grouped historical Other without candidate identities', () => {
    const groupedSeat = {
      id: 'historical', name: 'Historical', partyGroup: 'Labour',
      partyTotals: [
        { party: 'Labour', votes: 40 },
        { party: 'Other', votes: 30 },
        { party: 'Conservative', votes: 30 },
      ],
    };
    const [seat] = simulateUniformSwing([groupedSeat], 'Liberal Democrat', 5);
    expect(seat.scenarioTargetEligible).toBe(false);
    expect(seat.simulatedCandidates.filter((row) => row.party === 'Other')).toHaveLength(1);
    expect(seat.simulatedCandidates.every((row) => row.name === null)).toBe(true);

    const [canonical] = simulateUniformSwing([{
      ...groupedSeat,
      partyTotals: [
        { party: 'Labour', votes: 40 },
        { party: 'Liberal Democrats', votes: 30 },
        { party: 'Conservative', votes: 30 },
      ],
    }], 'Liberal Democrat', 5);
    expect(canonical.simulatedCandidates.find((row) => row.party === 'Liberal Democrats').share).toBeCloseTo(0.35);
    expect(canonical.simulatedCandidates.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
  });
});



