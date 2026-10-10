import {
  calculateBaselineShares, PARTY_SCENARIO_METHOD, simulatePartyShareScenario,
} from './multi-party-scenario';
import { buildScenarioFromPoll } from './polling';
import { canonicalPartyName } from './parties.mjs';

function eligibleSeats(seats, geography) {
  return (seats || []).filter((seat) => geography === 'UK'
    || (seat.country !== 'Northern Ireland' && seat.countryCode !== 'NI'));
}

function getLocalShares(seat) {
  const source = Array.isArray(seat.candidates) && seat.candidates.length
    ? seat.candidates : (seat.partyTotals || []);
  const rows = source.map((row) => ({
    party: canonicalPartyName(row.partyGroup || row.partyOfficial || row.party || 'Other'),
    votes: Number(row.votes),
  })).filter((row) => Number.isFinite(row.votes) && row.votes >= 0);
  const total = rows.reduce((sum, row) => sum + row.votes, 0);
  const shares = new Map();
  if (total > 0) rows.forEach((row) => shares.set(row.party, (shares.get(row.party) || 0) + row.votes / total));
  return shares;
}

function winnerGapShare(seat) {
  if (Number.isFinite(seat.majorityShare)) return Math.abs(seat.majorityShare);
  if (Number.isFinite(seat.majority) && Number(seat.validVotes) > 0) return Math.abs(seat.majority) / Number(seat.validVotes);
  return null;
}

function scoreProjection(baseSeats, targetSeats, projection, { geography = 'GB' } = {}) {
  const actualById = new Map(eligibleSeats(targetSeats, geography).map((seat) => [seat.id, seat]));
  const pairs = eligibleSeats(baseSeats, geography)
    .filter((seat) => actualById.has(seat.id))
    .map((base) => ({ projected: projection.find((seat) => seat.id === base.id), actual: actualById.get(base.id) }))
    .filter((pair) => pair.projected);
  const parties = new Set();
  pairs.forEach(({ actual, projected }) => {
    getLocalShares(actual).forEach((_, party) => parties.add(party));
    getLocalShares(projected).forEach((_, party) => parties.add(party));
  });
  const partyList = [...parties];
  let shareError = 0;
  let shareObservations = 0;
  const targetCounts = new Map();
  const projectedCounts = new Map();
  let winnersCorrect = 0;
  let closeSeats = 0;
  let closeWinnersCorrect = 0;
  pairs.forEach(({ projected, actual }) => {
    const actualShares = getLocalShares(actual);
    const projectedShares = projected.simulatedPartyShares
      ? new Map(Object.entries(projected.simulatedPartyShares))
      : getLocalShares(projected);
    partyList.forEach((party) => {
      shareError += Math.abs((projectedShares.get(party) || 0) - (actualShares.get(party) || 0));
      shareObservations += 1;
    });
    const actualParty = canonicalPartyName(actual.partyGroup || actual.party);
    const predictedParty = canonicalPartyName(projected.projectedParty || projected.partyGroup || projected.party);
    if (actualParty === predictedParty) winnersCorrect += 1;
    targetCounts.set(actualParty, (targetCounts.get(actualParty) || 0) + 1);
    projectedCounts.set(predictedParty, (projectedCounts.get(predictedParty) || 0) + 1);
    const gap = winnerGapShare(actual);
    if (gap !== null && gap <= 0.05) {
      closeSeats += 1;
      if (actualParty === predictedParty) closeWinnersCorrect += 1;
    }
  });
  const seatErrors = partyList.map((party) => Math.abs((projectedCounts.get(party) || 0) - (targetCounts.get(party) || 0)));
  return {
    matchedSeats: pairs.length,
    parties: partyList.length,
    winnerAccuracy: pairs.length ? winnersCorrect / pairs.length : null,
    winnerCorrect: winnersCorrect,
    closeSeats,
    closeWinnerAccuracy: closeSeats ? closeWinnersCorrect / closeSeats : null,
    closeWinnerCorrect: closeWinnersCorrect,
    meanAbsoluteLocalPartyShareError: shareObservations ? shareError / shareObservations : null,
    meanAbsolutePartySeatError: seatErrors.length ? seatErrors.reduce((sum, value) => sum + value, 0) / seatErrors.length : null,
    totalAbsolutePartySeatError: seatErrors.reduce((sum, value) => sum + value, 0),
    seatCounts: partyList.map((party) => ({
      party,
      projected: projectedCounts.get(party) || 0,
      actual: targetCounts.get(party) || 0,
      error: (projectedCounts.get(party) || 0) - (targetCounts.get(party) || 0),
    })).sort((a, b) => Math.abs(b.error) - Math.abs(a.error) || a.party.localeCompare(b.party)),
  };
}

/** Allocation-only test: eventual target-election national shares are supplied. */
export function backtestAllocation(baseSeats, targetSeats, {
  geography = 'GB',
  baselineElection = null,
  targetElection = null,
  method = PARTY_SCENARIO_METHOD,
} = {}) {
  const baseline = calculateBaselineShares(baseSeats, { geography });
  const targetShares = calculateBaselineShares(targetSeats, { geography });
  const partyUniverse = Object.keys(baseline.shares);
  const rawInput = Object.fromEntries(partyUniverse.map((party) => [party, Number(targetShares.shares[party]) || 0]));
  const representedTotal = Object.values(rawInput).reduce((sum, value) => sum + value, 0);
  const excludedParties = Object.entries(targetShares.shares)
    .filter(([party]) => !partyUniverse.includes(party))
    .map(([party, share]) => ({ party, share }));
  const excludedShare = excludedParties.reduce((sum, row) => sum + row.share, 0);
  const requestedShares = representedTotal > 0
    ? Object.fromEntries(Object.entries(rawInput).map(([party, share]) => [party, share / representedTotal * 100]))
    : { ...baseline.shares };
  const projected = simulatePartyShareScenario(baseSeats, {
    baselineShares: baseline,
    requestedShares,
    geography,
    method,
  });
  const assumptions = excludedShare > 0.05 || Math.abs(representedTotal - 100) > 0.05
    ? ['Parties not represented in the baseline party universe account for ' + excludedShare.toFixed(2) + ' points in the target. Those shares cannot be allocated to a party with no baseline candidate; represented target shares are proportionally rescaled to 100%.']
    : [];
  return {
    kind: 'allocation-only',
    method,
    geography,
    baselineElection,
    targetElection,
    baselineShares: baseline.shares,
    targetShares: targetShares.shares,
    scenarioInputShares: requestedShares,
    assumptions,
    metrics: scoreProjection(baseSeats, targetSeats, projected, { geography }),
  };
}

/** Poll-to-seat test: poll snapshot is run from the prior same-boundary baseline. */
export function backtestPollToSeats(baseSeats, targetSeats, poll, {
  geography = 'GB',
  baselineElection = null,
  targetElection = null,
  method = PARTY_SCENARIO_METHOD,
} = {}) {
  const baseline = calculateBaselineShares(baseSeats, { geography });
  const scenario = buildScenarioFromPoll(poll, baseline, {
    geography,
    baselineElection: baselineElection || undefined,
  });
  const projected = simulatePartyShareScenario(baseSeats, {
    baselineShares: baseline,
    requestedShares: scenario.requestedShares,
    geography,
    method,
  });
  return {
    kind: 'poll-to-seat',
    method,
    geography,
    baselineElection,
    targetElection,
    poll,
    scenario,
    metrics: scoreProjection(baseSeats, targetSeats, projected, { geography }),
  };
}
