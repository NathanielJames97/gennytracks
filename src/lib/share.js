import { SCENARIO_ELIGIBILITY_POLICY, SCENARIO_METHOD_VERSION } from './scenario';

const SHARE_KEYS = [
  'election', 'mode', 'party', 'region', 'seat', 'view', 'compare', 'q', 'swingParty',
  'swing', 'projection', 'scenario', 'scenarioMethod', 'scenarioEligibility',
  'compareArea', 'compareChanges', 'compareQuery', 'compareSort', 'compareCompatible',
];

export function readShareState() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const state = Object.fromEntries(SHARE_KEYS.filter((key) => key !== 'scenario')
    .map((key) => [key, params.get(key)]).filter(([, value]) => value !== null));
  const rawScenario = params.get('scenario');
  if (rawScenario !== null) {
    try {
      const scenario = JSON.parse(rawScenario);
      if (scenario && typeof scenario === 'object' && !Array.isArray(scenario)) state.scenario = scenario;
    } catch {
      // Ignore invalid structured state while preserving the legacy swing keys.
    }
  }
  return state;
}

export function writeShareState(state) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  SHARE_KEYS.forEach((key) => url.searchParams.delete(key));
  const scenarioSwing = state.swing ?? state.scenario?.swing;
  const values = {
    compareArea: state.comparisonFilters?.area,
    compareChanges: state.comparisonFilters?.changesOnly === false ? '0' : null,
    compareQuery: state.comparisonFilters?.query,
    compareSort: state.comparisonFilters?.sort === 'name' ? null : state.comparisonFilters?.sort,
    compareCompatible: state.compareCompatible ? '1' : null,
    election: state.election,
    mode: state.mode === 'winner' ? null : state.mode,
    party: state.party,
    region: state.region,
    seat: state.seat,
    view: state.view === 'overview' ? null : state.view,
    compare: state.compare,
    q: state.query,
    swingParty: state.swingParty ?? state.scenario?.party,
    swing: scenarioSwing && Number(scenarioSwing) !== 0 ? scenarioSwing : null,
    projection: state.projection ? '1' : null,
    scenario: state.scenario ? JSON.stringify(state.scenario) : null,
    scenarioMethod: state.scenarioMethod ?? state.scenario?.methodVersion,
    scenarioEligibility: state.scenarioEligibility ?? state.scenario?.eligibilityPolicy,
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, value);
  });
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function seatsToCsv(seats, election, simulated = false, scenario = null) {
  const scenarioInputs = scenario || {};
  const source = scenarioInputs.source || {};
  const targetParty = scenarioInputs.party ?? scenarioInputs.swingParty
    ?? (seats || []).find((seat) => seat.simulated)?.simulatedTargetParty ?? '';
  const shiftPoints = scenarioInputs.swing ?? scenarioInputs.shiftPoints
    ?? scenarioInputs.changePoints ?? scenarioInputs.deltaPoints ?? '';
  const methodVersion = scenarioInputs.method ?? scenarioInputs.methodVersion
    ?? (seats || []).find((seat) => seat.scenarioMethodVersion)?.scenarioMethodVersion
    ?? (simulated ? SCENARIO_METHOD_VERSION : '');
  const eligibilityPolicy = scenarioInputs.eligibilityPolicy ?? scenarioInputs.eligibility
    ?? (seats || []).find((seat) => seat.scenarioEligibilityPolicy)?.scenarioEligibilityPolicy
    ?? (simulated ? SCENARIO_ELIGIBILITY_POLICY : '');
  const excluded = (seats || []).filter((seat) => seat.scenarioExclusion)
    .map((seat) => String(seat.name || seat.id || '') + ': ' + seat.scenarioExclusion).join('; ');
  const requestedShares = scenarioInputs.requestedShares ?? scenarioInputs.inputs ?? '';
  const baseline = scenarioInputs.baseline ?? scenarioInputs.baselineElection
    ?? { id: election?.id, label: election?.label || election?.year };
  const geography = scenarioInputs.geography ?? election?.geography ?? 'UK constituencies';
  const boundarySet = election?.boundaryLabel ?? election?.boundarySetId ?? '';
  const header = [
    'election', 'result_type', 'constituency', 'ons_code', 'country', 'region',
    'winner', 'party', 'winner_votes', 'winner_share', 'majority', 'turnout', 'electorate',
    'baseline_election_id', 'baseline_election', 'geography', 'boundary_set',
    'method_version', 'input_party', 'input_change_pp', 'requested_shares',
    'eligibility_policy', 'scenario_target_eligible', 'scenario_exclusion',
    'scenario_exclusions', 'scenario_assumptions', 'scenario_source_kind',
    'scenario_source_id', 'scenario_source_label', 'scenario_source_url', 'scenario_json',
    'source_links',
  ];
  const rows = (seats || []).map((seat) => [
    election?.label || election?.year,
    simulated ? 'scenario illustration' : election?.isNotional ? 'notional' : 'declared result',
    seat.name, seat.gss || seat.areaCode || seat.id, seat.country, seat.region,
    simulated ? 'Projected ' + seat.partyGroup : seat.member,
    seat.partyGroup,
    simulated ? seat.winnerVotes ?? Math.round((seat.winnerShare || 0) * seat.validVotes) : seat.winnerVotes,
    seat.winnerShare, seat.majority,
    seat.turnout, seat.electorate,
    typeof baseline === 'object' ? baseline.id ?? baseline.electionId ?? '' : baseline,
    typeof baseline === 'object' ? baseline.label ?? baseline.name ?? '' : '',
    geography, boundarySet,
    methodVersion, targetParty, shiftPoints,
    requestedShares && typeof requestedShares === 'object' ? JSON.stringify(requestedShares) : requestedShares,
    eligibilityPolicy,
    simulated && seat.scenarioTargetEligible !== undefined ? seat.scenarioTargetEligible : '',
    simulated ? seat.scenarioExclusion : '',
    simulated ? excluded : '',
    scenarioInputs.assumptions && typeof scenarioInputs.assumptions === 'object'
      ? JSON.stringify(scenarioInputs.assumptions) : scenarioInputs.assumptions,
    source.kind, source.id, source.label, source.url,
    simulated ? JSON.stringify(scenarioInputs) : '',
    [election?.sourceUrl, source.url, seat.sourceUrl].filter(Boolean).join('; '),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(seats, election, simulated = false, scenario = null) {
  const blob = new Blob(['\uFEFF' + seatsToCsv(seats, election, simulated, scenario)], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = 'genny-tracks-' + (election?.id || 'election') + (simulated ? '-scenario' : '') + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
