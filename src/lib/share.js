const SHARE_KEYS = ['election', 'mode', 'party', 'seat', 'view', 'compare', 'q', 'swingParty', 'swing', 'projection'];

export function readShareState() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(SHARE_KEYS.map((key) => [key, params.get(key)]).filter(([, value]) => value !== null));
}

export function writeShareState(state) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  SHARE_KEYS.forEach((key) => url.searchParams.delete(key));
  const values = {
    election: state.election,
    mode: state.mode === 'winner' ? null : state.mode,
    party: state.party,
    seat: state.seat,
    view: state.view === 'overview' ? null : state.view,
    compare: state.compare,
    q: state.query,
    swingParty: state.swingParty,
    swing: state.swing && Number(state.swing) !== 0 ? state.swing : null,
    projection: state.projection ? '1' : null,
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, value);
  });
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function seatsToCsv(seats, election, simulated = false) {
  const header = ['election', 'result_type', 'constituency', 'ons_code', 'country', 'region', 'winner', 'party', 'winner_votes', 'winner_share', 'majority', 'turnout', 'electorate'];
  const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = (seats || []).map((seat) => [
    election?.label || election?.year,
    simulated ? 'scenario illustration' : election?.isNotional ? 'notional' : 'declared result',
    seat.name, seat.gss || seat.areaCode || seat.id, seat.country, seat.region,
    simulated ? `Projected ${seat.partyGroup}` : seat.member,
    seat.partyGroup,
    simulated ? Math.round((seat.winnerShare || 0) * seat.validVotes) : seat.winnerVotes,
    seat.winnerShare, seat.majority,
    seat.turnout, seat.electorate,
  ]);
  return [header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
}

export function downloadCsv(seats, election, simulated = false) {
  const blob = new Blob([`\uFEFF${seatsToCsv(seats, election, simulated)}`], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `genny-tracks-${election?.id || 'election'}${simulated ? '-scenario' : ''}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
