import { canonicalPartyName } from './parties.mjs';

export const SCENARIO_METHOD_VERSION = 'uniform-party-share-shift-v1';
export const SCENARIO_ELIGIBILITY_POLICY = 'declared-slate';

const PARTY_COLOURS = {
  Labour: '#E4003B', Conservative: '#0087DC', 'Liberal Democrats': '#FAA61A',
  'Scottish National': '#FDF38E', 'Scottish National Party': '#FDF38E',
  'Reform UK': '#12B6CF', 'Democratic Unionist': '#D46A4C',
  'Democratic Unionist Party': '#D46A4C', 'Sinn Féin': '#00654F',
  'Social Democratic and Labour': '#2AA82C', 'Social Democratic & Labour Party': '#2AA82C',
  'Plaid Cymru': '#005B54', Green: '#5EB646', 'Green Party': '#5EB646',
  Independent: '#7A7A7A', Speaker: '#9E9E9E', Alliance: '#F6CB2F',
  'Ulster Unionist': '#48A5EE', 'Traditional Unionist Voice': '#0C3A6A',
};

export function simulateUniformSwing(seats, targetParty, swingPoints) {
  const rawDelta = Number(swingPoints) / 100;
  const delta = Number.isFinite(rawDelta) ? rawDelta : 0;
  const target = canonicalPartyName(targetParty);

  return (seats || []).map((seat) => {
    // Candidate-level rows preserve separate independent contenders. Older
    // releases without candidates retain grouped party totals (including Other).
    const hasCandidates = Array.isArray(seat.candidates) && seat.candidates.length > 0;
    const sourceRows = hasCandidates ? seat.candidates : (seat.partyTotals || []);
    if (!sourceRows.length) {
      return {
        ...seat,
        simulated: true,
        simulatedTargetParty: target,
        scenarioMethodVersion: SCENARIO_METHOD_VERSION,
        scenarioEligibilityPolicy: SCENARIO_ELIGIBILITY_POLICY,
        scenarioTargetEligible: null,
        scenarioExclusion: target + ' eligibility unknown: result rows unavailable',
        simulatedCandidates: [],
      };
    }

    const hasInvalidVotes = sourceRows.some((row) => !row
      || typeof row.votes !== 'number' || !Number.isFinite(row.votes) || row.votes < 0);
    if (hasInvalidVotes) {
      const targetEligible = sourceRows.some((row) => row
        && canonicalPartyName(row.partyGroup || row.party || 'Unspecified') === target);
      return {
        ...seat,
        simulated: true,
        simulatedTargetParty: target,
        scenarioMethodVersion: SCENARIO_METHOD_VERSION,
        scenarioEligibilityPolicy: SCENARIO_ELIGIBILITY_POLICY,
        scenarioTargetEligible: targetEligible,
        scenarioExclusion: 'vote totals unavailable or invalid; baseline retained',
        simulatedCandidates: [],
      };
    }
    const contenders = sourceRows.map((row, index) => {
      const party = canonicalPartyName(row.partyGroup || row.party || 'Unspecified');
      const name = hasCandidates ? (row.name || null) : null;
      return {
        id: hasCandidates ? 'candidate:' + index + ':' + (name || party) : 'party:' + party,
        name,
        party,
        votes: row.votes,
        sourceIndex: index,
      };
    });
    const totalVotes = contenders.reduce((sum, row) => sum + row.votes, 0);
    if (!contenders.length || totalVotes <= 0) {
      return {
        ...seat,
        simulated: true,
        simulatedTargetParty: target,
        scenarioMethodVersion: SCENARIO_METHOD_VERSION,
        scenarioEligibilityPolicy: SCENARIO_ELIGIBILITY_POLICY,
        scenarioTargetEligible: contenders.some((row) => row.party === target),
        scenarioExclusion: 'valid vote total unavailable; baseline retained',
        simulatedCandidates: [],
      };
    }

    const eligibleRows = contenders.filter((row) => row.party === target);
    const targetEligible = eligibleRows.length > 0;
    const baseShares = contenders.map((row) => row.votes / totalVotes);
    const baselineTarget = eligibleRows.reduce((sum, row) => sum + row.votes, 0) / totalVotes;

    // An absent party has no declared local candidate to receive or lose support.
    // Its absence therefore leaves the local result unchanged.
    const otherShare = 1 - baselineTarget;
    const targetShare = targetEligible && otherShare > 0
      ? Math.max(0, Math.min(1, baselineTarget + delta))
      : baselineTarget;
    const scaleOthers = otherShare > 0 ? (1 - targetShare) / otherShare : 0;
    const targetCount = eligibleRows.length;
    const targetVotes = eligibleRows.reduce((sum, row) => sum + row.votes, 0);
    // Exact ties resolve by source candidate order for reproducibility.
    const projected = contenders.map((row, index) => {
      let share;
      if (!targetEligible) share = baseShares[index];
      else if (row.party === target) {
        // Preserve same-party candidate proportions; if all have zero votes,
        // split an explicitly eligible change evenly among those candidates.
        share = targetVotes > 0 ? targetShare * row.votes / targetVotes : targetShare / targetCount;
      } else share = baseShares[index] * scaleOthers;
      return { ...row, share };
    }).sort((a, b) => b.share - a.share || a.sourceIndex - b.sourceIndex);

    // A zero-point scenario is an identity operation on published results.
    // Keep the declared winner and share fields exactly as supplied, while still
    // carrying candidate-level eligibility and audit details for exports.
    if (delta === 0) {
      return {
        ...seat,
        simulated: true,
        simulatedTargetParty: target,
        scenarioMethodVersion: SCENARIO_METHOD_VERSION,
        scenarioEligibilityPolicy: SCENARIO_ELIGIBILITY_POLICY,
        scenarioTargetEligible: targetEligible,
        scenarioExclusion: targetEligible ? '' : target + ' absent from declared candidate slate',
        simulatedCandidates: projected,
      };
    }

    const winner = projected[0];
    const runnerUp = projected[1];
    const baselineWinner = canonicalPartyName(seat.partyGroup);
    const majorityShare = Math.max(0, winner.share - (runnerUp?.share || 0));
    const winnerChanged = winner.party !== baselineWinner;
    return {
      ...seat,
      party: winner.party,
      partyGroup: winner.party,
      member: winner.name || seat.member,
      colour: PARTY_COLOURS[winner.party] || '#7A7A7A',
      winnerVotes: Math.round(winner.share * totalVotes),
      winnerShare: winner.share,
      majorityShare,
      majority: Math.round(majorityShare * totalVotes),
      resultType: winnerChanged ? 'gain' : seat.resultType,
      gainedFrom: winnerChanged ? baselineWinner : seat.gainedFrom,
      simulated: true,
      simulatedTargetParty: target,
      scenarioMethodVersion: SCENARIO_METHOD_VERSION,
      scenarioEligibilityPolicy: SCENARIO_ELIGIBILITY_POLICY,
      scenarioTargetEligible: targetEligible,
      scenarioExclusion: targetEligible
        ? (otherShare === 0 ? 'no other declared contender for vote-share reallocation' : '')
        : target + ' absent from declared candidate slate',
      simulatedCandidates: projected,
    };
  });
}
