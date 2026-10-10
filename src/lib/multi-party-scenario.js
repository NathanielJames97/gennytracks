import { canonicalPartyName } from './parties.mjs';

export const PARTY_SCENARIO_METHOD = 'uniform-party-delta-v1';
export const NATIONAL_RAKE_SCENARIO_METHOD = 'national-rake-v1';
export const NATIONAL_RAKE_TOLERANCE_PP = 0.01;
export const PARTY_SCENARIO_METHODS = [
  {
    id: PARTY_SCENARIO_METHOD,
    label: 'Uniform local percentage-point change',
    description: 'Applies each party’s national change as the same point change in every constituency where it stood, then rescales each seat.',
  },
  {
    id: NATIONAL_RAKE_SCENARIO_METHOD,
    label: 'Calibrate to requested shares',
    description: 'Rakes eligible constituency vote shares to within 0.01 percentage points of the requested vote-weighted totals while preserving each seat’s valid-vote total.',
  },
];
export const SCENARIO_GEOGRAPHIES = ['GB', 'NI', 'UK'];

const PARTY_COLOURS = {
  Labour: '#E4003B', Conservative: '#0087DC', 'Liberal Democrats': '#FAA61A',
  'Scottish National': '#FDF38E', 'Reform UK': '#12B6CF', 'Democratic Unionist': '#D46A4C',
  'Sinn Féin': '#00654F', 'Social Democratic and Labour': '#2AA82C', 'Plaid Cymru': '#005B54',
  Green: '#5EB646', Independent: '#7A7A7A', Speaker: '#9E9E9E', Alliance: '#F6CB2F',
  'Ulster Unionist': '#48A5EE', 'Traditional Unionist Voice': '#0C3A6A',
};

function isNorthernIreland(seat) {
  return seat?.country === 'Northern Ireland' || seat?.countryCode === 'NI';
}

function inGeography(seat, geography) {
  if (geography === 'UK') return true;
  if (geography === 'NI') return isNorthernIreland(seat);
  return !isNorthernIreland(seat);
}

function rowsForSeat(seat) {
  const candidates = Array.isArray(seat?.candidates) ? seat.candidates : [];
  const source = candidates.length ? candidates : (seat?.partyTotals || []);
  return source.map((row, index) => ({
    source: row,
    index,
    party: canonicalPartyName(row.partyGroup || row.partyOfficial || row.party || 'Other'),
    name: candidates.length ? (row.name || null) : null,
    votes: Number(row.votes),
  })).filter((row) => Number.isFinite(row.votes) && row.votes >= 0);
}

function partyVotesForSeat(seat) {
  const rows = rowsForSeat(seat);
  const valid = rows.reduce((sum, row) => sum + row.votes, 0);
  const totals = new Map();
  if (!valid) return { rows, valid, shares: totals };
  rows.forEach((row) => totals.set(row.party, (totals.get(row.party) || 0) + row.votes / valid));
  return { rows, valid, shares: totals };
}

const FLOW_EPSILON = 1e-7;

function addFlowEdge(graph, from, to, capacity) {
  const forward = { to, reverse: graph[to].length, capacity };
  const reverse = { to: from, reverse: graph[from].length, capacity: 0 };
  graph[from].push(forward);
  graph[to].push(reverse);
}

function maximumFlow(graph, source, sink) {
  let flow = 0;
  while (true) {
    const level = Array(graph.length).fill(-1);
    const queue = [source];
    level[source] = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      graph[node].forEach((edge) => {
        if (edge.capacity > FLOW_EPSILON && level[edge.to] < 0) {
          level[edge.to] = level[node] + 1;
          queue.push(edge.to);
        }
      });
    }
    if (level[sink] < 0) return flow;
    const next = Array(graph.length).fill(0);
    const send = (node, amount) => {
      if (node === sink) return amount;
      for (; next[node] < graph[node].length; next[node] += 1) {
        const edge = graph[node][next[node]];
        if (edge.capacity <= FLOW_EPSILON || level[edge.to] !== level[node] + 1) continue;
        const pushed = send(edge.to, Math.min(amount, edge.capacity));
        if (pushed > FLOW_EPSILON) {
          edge.capacity -= pushed;
          graph[edge.to][edge.reverse].capacity += pushed;
          return pushed;
        }
      }
      return 0;
    };
    while (true) {
      const pushed = send(source, Infinity);
      if (pushed <= FLOW_EPSILON) break;
      flow += pushed;
    }
  }
}

function rakeSeatsToPartyShares(seats, requestedShares, parties, scopeLabel) {
  const rows = (seats || []).map((seat) => {
    const { rows: candidates, valid } = partyVotesForSeat(seat);
    const groups = new Map();
    candidates.forEach((candidate) => {
      groups.set(candidate.party, (groups.get(candidate.party) || 0) + candidate.votes);
    });
    return { seat, valid, groups };
  }).filter((row) => row.valid > 0 && row.groups.size > 0);
  const totalVotes = rows.reduce((sum, row) => sum + row.valid, 0);
  if (!totalVotes) return { bySeat: new Map(), partyTotals: new Map() };

  const shareTotal = shareVectorTotal(requestedShares);
  if (!isCompleteShareVector(requestedShares, parties) || shareTotal <= 0) {
    throw new Error('The calibrated method needs a complete vote-share vector that sums to 100%.');
  }
  const normalizedShares = Object.fromEntries(parties.map((party) => [
    party, Math.max(0, Number(requestedShares[party]) || 0) / shareTotal * 100,
  ]));
  const targetVotes = new Map(parties.map((party) => [party, totalVotes * normalizedShares[party] / 100]));
  const tolerance = Math.max(1e-4, totalVotes * NATIONAL_RAKE_TOLERANCE_PP / 100);

  // Check transportation feasibility before fitting. Each constituency must
  // retain its valid-vote total, and a party can receive votes only where its
  // candidate slate contains that party.
  const source = 0;
  const firstSeat = 1;
  const firstParty = firstSeat + rows.length;
  const sink = firstParty + parties.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  rows.forEach((row, index) => {
    addFlowEdge(graph, source, firstSeat + index, row.valid);
    parties.forEach((party, partyIndex) => {
      if (row.groups.has(party)) addFlowEdge(graph, firstSeat + index, firstParty + partyIndex, row.valid);
    });
  });
  parties.forEach((party, index) => addFlowEdge(graph, firstParty + index, sink, targetVotes.get(party) || 0));
  const flow = maximumFlow(graph, source, sink);
  if (totalVotes - flow > tolerance) {
    throw new Error(scopeLabel + ' requested shares cannot be met with the declared candidate slate (eligibility shortfall ' + (totalVotes - flow).toFixed(0) + ' votes). Reduce unsupported party targets or choose the uniform-change method.');
  }

  const baselineShares = calculateBaselineShares(rows.map((row) => row.seat), { geography: 'UK' }).shares;
  const matchesBaseline = parties.every((party) => Math.abs(
    (normalizedShares[party] || 0) - (baselineShares[party] || 0),
  ) < 1e-9);
  if (matchesBaseline) {
    return {
      bySeat: new Map(rows.map((row) => [row.seat.id, new Map(row.groups.size
        ? [...row.groups.entries()].map(([party, votes]) => [party, votes / row.valid]) : [])])),
      partyTotals: new Map(parties.map((party) => [party, totalVotes * normalizedShares[party] / 100])),
    };
  }

  const partyIndices = new Map(parties.map((party, index) => [party, index]));
  const cells = rows.map((row) => [...row.groups.entries()].map(([party, votes]) => ({
    party,
    index: partyIndices.get(party),
    // A candidate who received no votes remains eligible. A small prior lets
    // calibration award support without inventing a candidate or a vote source.
    value: Math.max(votes, 1),
  })));
  const byParty = parties.map((party) => []);
  cells.forEach((seatCells, seatIndex) => seatCells.forEach((cell, cellIndex) => {
    byParty[cell.index].push({ seatIndex, cellIndex });
  }));

  const maxIterations = 3000;
  let converged = false;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    cells.forEach((seatCells, seatIndex) => {
      const current = seatCells.reduce((sum, cell) => sum + cell.value, 0);
      const factor = rows[seatIndex].valid / current;
      seatCells.forEach((cell) => { cell.value *= factor; });
    });
    parties.forEach((party, partyIndex) => {
      const targets = targetVotes.get(party) || 0;
      const current = byParty[partyIndex].reduce((sum, position) => (
        sum + cells[position.seatIndex][position.cellIndex].value
      ), 0);
      if (targets === 0) {
        byParty[partyIndex].forEach((position) => { cells[position.seatIndex][position.cellIndex].value = 0; });
      } else if (current > 0) {
        const factor = targets / current;
        byParty[partyIndex].forEach((position) => { cells[position.seatIndex][position.cellIndex].value *= factor; });
      }
    });
    // The map output is row-normalised, so measure column error against that
    // exact output rather than using the temporarily unbalanced IPF matrix.
    const outputColumnTotals = parties.map(() => 0);
    cells.forEach((seatCells, seatIndex) => {
      const seatTotal = seatCells.reduce((sum, cell) => sum + cell.value, 0);
      seatCells.forEach((cell) => {
        outputColumnTotals[cell.index] += cell.value / seatTotal * rows[seatIndex].valid;
      });
    });
    const outputColumnError = parties.reduce((max, party, index) => Math.max(max, Math.abs(
      outputColumnTotals[index] - (targetVotes.get(party) || 0),
    )), 0);
    if (outputColumnError <= tolerance) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    throw new Error(scopeLabel + ' shares pass the eligibility check but did not converge to the requested margins. Try a less extreme vector or the uniform-change method.');
  }

  const bySeat = new Map();
  const partyTotals = new Map(parties.map((party) => [party, 0]));
  rows.forEach((row, seatIndex) => {
    const local = new Map();
    const seatTotal = cells[seatIndex].reduce((sum, cell) => sum + cell.value, 0);
    cells[seatIndex].forEach((cell) => {
      const share = cell.value / seatTotal;
      local.set(cell.party, share);
      partyTotals.set(cell.party, (partyTotals.get(cell.party) || 0) + share * row.valid);
    });
    bySeat.set(row.seat.id, local);
  });
  return { bySeat, partyTotals, totalVotes };
}

function rakeScenarioShares(seats, requestedShares, parties, geography, regionalShares, regionalBaselineShares) {
  const activeSeats = (seats || []).filter((seat) => inGeography(seat, geography));
  if (geography !== 'GB') return rakeSeatsToPartyShares(activeSeats, requestedShares, parties, geography);

  const activeRegions = Object.entries(regionalShares || {}).filter(([country, shares]) => (
    regionalBaselineShares?.[country]?.shares
    && isCompleteShareVector(shares, parties)
  ));
  if (!activeRegions.length) return rakeSeatsToPartyShares(activeSeats, requestedShares, parties, 'Great Britain');

  const bySeat = new Map();
  const regionTargets = new Map();
  const overrideCountries = new Set();
  activeRegions.forEach(([country, shares]) => {
    const countrySeats = activeSeats.filter((seat) => seat.country === country);
    const result = rakeSeatsToPartyShares(countrySeats, shares, parties, country);
    result.bySeat.forEach((value, id) => bySeat.set(id, value));
    result.partyTotals.forEach((value, party) => regionTargets.set(party, (regionTargets.get(party) || 0) + value));
    overrideCountries.add(country);
  });

  const remainingSeats = activeSeats.filter((seat) => !overrideCountries.has(seat.country));
  const totalVotes = activeSeats.reduce((sum, seat) => sum + partyVotesForSeat(seat).valid, 0);
  const remainingVotes = remainingSeats.reduce((sum, seat) => sum + partyVotesForSeat(seat).valid, 0);
  const shareTotal = shareVectorTotal(requestedShares);
  const residualVotes = new Map(parties.map((party) => [
    party,
    totalVotes * (Number(requestedShares[party]) || 0) / shareTotal - (regionTargets.get(party) || 0),
  ]));
  const tolerance = Math.max(1e-4, totalVotes * 1e-10);
  const negativeTarget = [...residualVotes.values()].some((value) => value < -tolerance);
  if (negativeTarget) {
    throw new Error('Country overrides require more support from at least one party than the Great Britain total allows. Adjust the national or country shares.');
  }
  const residualTotal = [...residualVotes.values()].reduce((sum, value) => sum + Math.max(0, value), 0);
  if (Math.abs(residualTotal - remainingVotes) > tolerance) {
    throw new Error('Country overrides and Great Britain shares leave an inconsistent vote total. Adjust the national or country shares.');
  }
  if (remainingVotes > tolerance) {
    const residualShares = Object.fromEntries(parties.map((party) => [
      party, Math.max(0, residualVotes.get(party) || 0) / remainingVotes * 100,
    ]));
    const result = rakeSeatsToPartyShares(remainingSeats, residualShares, parties, 'Remaining Great Britain seats');
    result.bySeat.forEach((value, id) => bySeat.set(id, value));
  } else if (residualTotal > tolerance) {
    throw new Error('Country overrides leave a Great Britain vote target with no remaining constituencies.');
  }
  return { bySeat };
}

export function calculateBaselineShares(seats, { geography = 'GB', region = null } = {}) {
  const totals = new Map();
  let validVotes = 0;
  let includedSeats = 0;
  let excludedSeats = 0;
  (seats || []).forEach((seat) => {
    if (!inGeography(seat, geography) || (region && seat.country !== region)) {
      excludedSeats += 1;
      return;
    }
    const { rows, valid } = partyVotesForSeat(seat);
    if (!valid || !rows.length) return;
    includedSeats += 1;
    validVotes += valid;
    rows.forEach((row) => totals.set(row.party, (totals.get(row.party) || 0) + row.votes));
  });
  const shares = Object.fromEntries([...totals.entries()]
    .map(([party, votes]) => [party, validVotes ? votes / validVotes * 100 : 0])
    .sort((a, b) => a[0].localeCompare(b[0], 'en-GB')));
  return { geography, region, shares, validVotes, includedSeats, excludedSeats };
}

export function shareVectorTotal(shares) {
  return Object.values(shares || {}).reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
}

export function isCompleteShareVector(shares, parties, tolerance = 0.05) {
  if (!shares || !parties?.length || parties.some((party) => (
    shares[party] === null || shares[party] === undefined
    || (typeof shares[party] === 'string' && !shares[party].trim())
    || !Number.isFinite(Number(shares[party])) || Number(shares[party]) < 0
  ))) return false;
  return Math.abs(shareVectorTotal(shares) - 100) <= tolerance;
}

export function calculateScenarioShares(seats, { geography = 'GB' } = {}) {
  const totals = new Map();
  let validVotes = 0;
  let includedSeats = 0;
  (seats || []).forEach((seat) => {
    if (!inGeography(seat, geography)) return;
    const rows = Array.isArray(seat?.simulatedCandidates) && seat.simulatedCandidates.length
      ? seat.simulatedCandidates
      : rowsForSeat(seat).map((row) => ({ ...row, share: row.votes }));
    const denominator = rows.reduce((sum, row) => sum + (Number(row.share) || 0), 0);
    if (!denominator) return;
    const weight = Number(seat.validVotes) > 0 ? Number(seat.validVotes)
      : rows.reduce((sum, row) => sum + (Number(row.votes) || 0), 0);
    if (!(weight > 0)) return;
    includedSeats += 1;
    validVotes += weight;
    rows.forEach((row) => {
      const party = canonicalPartyName(row.party || row.partyGroup || 'Other');
      totals.set(party, (totals.get(party) || 0) + Number(row.share || 0) / denominator * weight);
    });
  });
  const shares = Object.fromEntries([...totals.entries()]
    .map(([party, votes]) => [party, validVotes ? votes / validVotes * 100 : 0])
    .sort((a, b) => a[0].localeCompare(b[0], 'en-GB')));
  return { geography, shares, validVotes, includedSeats };
}

export function calculateScenarioSeatCounts(seats, { geography = 'GB', projected = true } = {}) {
  const counts = new Map();
  (seats || []).forEach((seat) => {
    if (!inGeography(seat, geography)) return;
    const party = projected ? (seat.projectedParty || seat.partyGroup) : (seat.scenarioBaselineParty || seat.partyGroup);
    counts.set(canonicalPartyName(party || 'Other'), (counts.get(canonicalPartyName(party || 'Other')) || 0) + 1);
  });
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en-GB')));
}

export function compareScenarioSeatCounts(seats, { geography = 'GB' } = {}) {
  const baseline = calculateScenarioSeatCounts(seats, { geography, projected: false });
  const projected = calculateScenarioSeatCounts(seats, { geography, projected: true });
  const parties = new Set([...Object.keys(baseline), ...Object.keys(projected)]);
  return [...parties].map((party) => ({
    party,
    baseline: baseline[party] || 0,
    projected: projected[party] || 0,
    change: (projected[party] || 0) - (baseline[party] || 0),
  })).sort((a, b) => b.projected - a.projected || a.party.localeCompare(b.party, 'en-GB'));
}

/**
 * Apply additive national percentage-point changes to each party's local 2024
 * share wherever that party stood. Local shares are clipped at zero, then
 * rescaled to 100 within each constituency. No new candidate is created.
 */
export function simulatePartyShareScenario(seats, {
  requestedShares,
  baselineShares,
  geography = 'GB',
  regionalShares = {},
  regionalBaselineShares = {},
  method = PARTY_SCENARIO_METHOD,
} = {}) {
  if (![PARTY_SCENARIO_METHOD, NATIONAL_RAKE_SCENARIO_METHOD].includes(method)) {
    throw new Error('Unknown party-share allocation method: ' + method);
  }
  const baseline = baselineShares || calculateBaselineShares(seats, { geography });
  const completeParties = Object.keys(baseline.shares || {});
  const requested = isCompleteShareVector(requestedShares, completeParties)
    ? Object.fromEntries(completeParties.map((party) => [party, Number(requestedShares[party])]))
    : { ...baseline.shares };
  const raked = method === NATIONAL_RAKE_SCENARIO_METHOD
    ? rakeScenarioShares(seats, requested, completeParties, geography, regionalShares, regionalBaselineShares)
    : null;

  return (seats || []).map((seat) => {
    const { rows, valid, shares: localShares } = partyVotesForSeat(seat);
    if (!valid || !rows.length) {
      return {
        ...seat,
        projectedParty: seat.partyGroup,
        scenarioMethodVersion: method,
        scenarioExclusion: 'vote totals unavailable; declared result retained',
        simulatedCandidates: [],
      };
    }

    const heldAtBaseline = !inGeography(seat, geography);
    const regionBase = geography === 'GB' ? regionalBaselineShares?.[seat.country]?.shares : null;
    const regionTarget = geography === 'GB' ? regionalShares?.[seat.country] : null;
    const useRegional = Boolean(regionBase && regionTarget
      && isCompleteShareVector(regionTarget, completeParties));
    const activeBaseline = useRegional ? regionBase : baseline.shares;
    const activeRequested = useRegional ? regionTarget : requested;
    const additiveZeroChange = completeParties.every((party) => Math.abs(
      Number(activeRequested[party] || 0) - Number(activeBaseline[party] || 0),
    ) < 1e-10);
    const groups = new Map();
    rows.forEach((row) => {
      const group = groups.get(row.party) || [];
      group.push(row);
      groups.set(row.party, group);
    });
    const projectedGroups = new Map();
    let projectedGroupTotal = 0;
    if (method === NATIONAL_RAKE_SCENARIO_METHOD && !heldAtBaseline) {
      const fittedShares = raked.bySeat.get(seat.id);
      if (!fittedShares) throw new Error('The calibrated method could not allocate constituency ' + (seat.name || seat.id || '') + '.');
      groups.forEach((partyRows, party) => {
        const value = Math.max(0, Number(fittedShares.get(party)) || 0);
        projectedGroups.set(party, value);
        projectedGroupTotal += value;
      });
    } else {
      groups.forEach((partyRows, party) => {
        const baselineLocalShare = localShares.get(party) || 0;
        const delta = heldAtBaseline || additiveZeroChange ? 0 : ((activeRequested[party] ?? activeBaseline[party] ?? 0) - (activeBaseline[party] ?? 0)) / 100;
        const adjusted = Math.max(0, baselineLocalShare + delta);
        projectedGroups.set(party, adjusted);
        projectedGroupTotal += adjusted;
      });
    }
    if (!(projectedGroupTotal > 0)) {
      groups.forEach((partyRows, party) => projectedGroups.set(party, localShares.get(party) || 0));
      projectedGroupTotal = 1;
    }
    const fittedMatchesBaseline = method === NATIONAL_RAKE_SCENARIO_METHOD && completeParties.every((party) => (
      Math.abs((projectedGroups.get(party) || 0) / projectedGroupTotal - (localShares.get(party) || 0)) < 1e-10
    ));
    const localZeroChange = method === NATIONAL_RAKE_SCENARIO_METHOD ? fittedMatchesBaseline : additiveZeroChange;

    const projectedCandidates = rows.map((row) => {
      const groupVotes = groups.get(row.party).reduce((sum, item) => sum + item.votes, 0);
      const partyShare = (projectedGroups.get(row.party) || 0) / projectedGroupTotal;
      const share = groupVotes > 0 ? partyShare * row.votes / groupVotes : partyShare / groups.get(row.party).length;
      return {
        id: row.name ? 'candidate:' + row.index + ':' + row.name : 'group:' + row.index + ':' + row.party,
        name: row.name,
        party: row.party,
        votes: row.votes,
        share,
        sourceIndex: row.index,
      };
    }).sort((a, b) => b.share - a.share || a.sourceIndex - b.sourceIndex);

    const winner = projectedCandidates[0];
    const runnerUp = projectedCandidates[1];
    const projectedParty = localZeroChange || heldAtBaseline ? seat.partyGroup : winner.party;
    const winnerShare = localZeroChange || heldAtBaseline ? seat.winnerShare : winner.share;
    const majorityShare = Math.max(0, winner.share - (runnerUp?.share || 0));
    const majority = localZeroChange || heldAtBaseline
      ? seat.majority
      : Math.round(majorityShare * valid);
    const changed = !localZeroChange && !heldAtBaseline && projectedParty !== seat.partyGroup;
    return {
      ...seat,
      ...(changed || (!localZeroChange && !heldAtBaseline) ? {
        party: projectedParty,
        partyGroup: projectedParty,
        member: winner.name || null,
        colour: PARTY_COLOURS[winner.party] || seat.colour,
        winnerVotes: Math.round(winner.share * valid),
        winnerShare,
        majority,
        majorityShare: localZeroChange || heldAtBaseline ? seat.majorityShare : majorityShare,
        resultType: changed ? 'gain' : seat.resultType,
        gainedFrom: changed ? seat.partyGroup : seat.gainedFrom,
      } : {}),
      projectedParty,
      scenarioIsBaseline: localZeroChange,
      scenarioBaselineParty: seat.partyGroup,
      scenarioWinnerChanged: changed,
      scenarioHeldAtBaseline: heldAtBaseline,
      scenarioMethodVersion: method,
      scenarioGeography: geography,
      scenarioRegion: useRegional ? seat.country : null,
      scenarioExcludedParties: heldAtBaseline ? ['GB-only scenario: constituency held at baseline'] : [],
      simulatedCandidates: projectedCandidates,
      simulatedPartyShares: Object.fromEntries([...groups.keys()].map((party) => [
        party, (projectedGroups.get(party) || 0) / projectedGroupTotal,
      ])),
    };
  });
}
