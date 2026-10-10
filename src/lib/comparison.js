import { canonicalPartyName } from './parties.mjs';
export const DEFAULT_COMPARISON_FILTERS = { area: '', changesOnly: true, query: '', sort: 'name' };
export const COMPARISON_SORTS = { name: 'Seat name', margin: 'Closest selected margin', turnout: 'Largest turnout movement' };

export function regionName(seat) {
  const region = seat.region || seat.country || 'Unknown';
  if (region === 'Eastern') return 'East of England';
  if (region.toLowerCase() === 'yorkshire and the humber') return 'Yorkshire and The Humber';
  return region;
}
export function comparisonAreas(seats, otherSeats) {
  return [...new Set([...(seats || []), ...(otherSeats || [])].map(regionName))].sort();
}
export function scopeSeats(seats, area = '') {
  return (seats || []).filter((seat) => !area || regionName(seat) === area);
}
export function finiteDelta(current, previous, field) {
  return Number.isFinite(current?.[field]) && Number.isFinite(previous?.[field])
    ? current[field] - previous[field] : null;
}

function partyTotals(seats) {
  const parties = new Map();
  let totalVotes = 0;
  let complete = true;
  for (const seat of seats) {
    const ensure = (sourceParty) => {
      const party = canonicalPartyName(sourceParty);
      if (!parties.has(party)) parties.set(party, { seats: 0, votes: 0, colour: '#7A7A7A' });
      return parties.get(party);
    };
    const winner = ensure(seat.partyGroup);
    winner.seats += 1;
    winner.colour = seat.colour || winner.colour;
    const rows = seat.partyTotals?.length ? seat.partyTotals : seat.candidates;
    if (!rows?.length || !Number.isFinite(seat.validVotes) || rows.some((row) => !Number.isFinite(row.votes))) {
      complete = false;
      continue;
    }
    totalVotes += seat.validVotes;
    for (const row of rows) ensure(row.partyGroup || row.party).votes += row.votes;
  }
  return { parties, totalVotes, complete };
}

export function buildComparison(seats, otherSeats, election, comparison, area = '') {
  const current = scopeSeats(seats, area);
  const previous = scopeSeats(otherSeats, area);
  const sameBoundaries = Boolean(election?.boundarySetId && comparison?.boundarySetId
    && election.boundarySetId === comparison.boundarySetId);
  const old = new Map(previous.map((seat) => [seat.id, seat]));
  const pairs = sameBoundaries ? current.flatMap((seat) => {
    const before = old.get(seat.id);
    return before ? [{ current: seat, previous: before, changed: canonicalPartyName(seat.partyGroup) !== canonicalPartyName(before.partyGroup),
      majorityDelta: finiteDelta(seat, before, 'majority'), turnoutDelta: finiteDelta(seat, before, 'turnout') }] : [];
  }) : [];
  const average = (field) => {
    const values = pairs.map((pair) => pair[field]).filter(Number.isFinite);
    return { value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, count: values.length };
  };
  const a = partyTotals(current);
  const b = partyTotals(previous);
  const parties = [...new Set([...a.parties.keys(), ...b.parties.keys()])].map((party) => {
    const selected = a.parties.get(party);
    const baseline = b.parties.get(party);
    const selectedShare = a.complete && a.totalVotes > 0 ? (selected?.votes || 0) / a.totalVotes : null;
    const previousShare = b.complete && b.totalVotes > 0 ? (baseline?.votes || 0) / b.totalVotes : null;
    return { party, colour: selected?.colour !== '#7A7A7A' ? selected?.colour || baseline?.colour : baseline?.colour,
      selected: selected?.seats || 0, previous: baseline?.seats || 0, selectedShare, previousShare,
      shareDelta: selectedShare !== null && previousShare !== null ? selectedShare - previousShare : null };
  }).sort((x, y) => y.selected - x.selected || y.previous - x.previous || x.party.localeCompare(y.party));
  return { current, previous, sameBoundaries, pairs, parties, changed: pairs.filter((pair) => pair.changed).length,
    majority: average('majorityDelta'), turnout: average('turnoutDelta') };
}

export function filterComparisonPairs(pairs, filters) {
  const query = (filters.query || '').trim().toLowerCase();
  return pairs.filter((pair) => (!filters.changesOnly || pair.changed)
    && (!query || [pair.current.name, pair.previous.name, pair.current.partyGroup, pair.previous.partyGroup]
      .some((value) => value?.toLowerCase().includes(query))))
    .sort((a, b) => {
      let difference = 0;
      if (filters.sort === 'margin') difference = (a.current.majority ?? Infinity) - (b.current.majority ?? Infinity);
      if (filters.sort === 'turnout') difference = (b.turnoutDelta === null ? -1 : Math.abs(b.turnoutDelta))
        - (a.turnoutDelta === null ? -1 : Math.abs(a.turnoutDelta));
      return difference || a.current.name.localeCompare(b.current.name);
    });
}

const csv = (rows) => rows.map((row) => row.map((value) => {
  const text = String(value ?? '');
  // Keep imported names from being executed as spreadsheet formulas.
  const safe = /^[=+@\-\t\r]/.test(text) && typeof value !== 'number' ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}).join(',')).join('\r\n');

export function comparisonToCsv(model, pairs, election, comparison, filters) {
  const metadata = [election.label, comparison.label, election.isNotional ? 'notional' : 'declared',
    comparison.isNotional ? 'notional' : 'declared', election.boundarySetId, comparison.boundarySetId,
    filters.area || 'UK', election.sourceUrl, comparison.sourceUrl];
  const header = ['selected_election', 'baseline_election', 'selected_type', 'baseline_type',
    'selected_boundaries', 'baseline_boundaries', 'area', 'selected_source', 'baseline_source'];
  if (!model.sameBoundaries) return csv([[...header, 'party', 'selected_seats', 'baseline_seats', 'seat_delta',
    'selected_vote_share', 'baseline_vote_share', 'vote_share_delta_pp'], ...model.parties.map((row) =>
    [...metadata, row.party, row.selected, row.previous, row.selected - row.previous, row.selectedShare,
      row.previousShare, row.shareDelta === null ? null : row.shareDelta * 100])]);
  return csv([[...header, 'changes_only', 'search', 'sort', 'seat_id', 'constituency', 'baseline_constituency',
    'baseline_party', 'selected_party', 'winner_changed', 'selected_majority', 'baseline_majority',
    'majority_delta', 'selected_turnout', 'baseline_turnout', 'turnout_delta_pp'], ...pairs.map((pair) =>
    [...metadata, filters.changesOnly, filters.query, filters.sort, pair.current.id, pair.current.name,
      pair.previous.name, pair.previous.partyGroup, pair.current.partyGroup, pair.changed,
      pair.current.majority, pair.previous.majority, pair.majorityDelta, pair.current.turnout,
      pair.previous.turnout, pair.turnoutDelta === null ? null : pair.turnoutDelta * 100])]);
}
export function downloadComparisonCsv(model, pairs, election, comparison, filters) {
  const href = URL.createObjectURL(new Blob(['\uFEFF' + comparisonToCsv(model, pairs, election, comparison, filters)],
    { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = `genny-tracks-${election.id}-vs-${comparison.id}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
