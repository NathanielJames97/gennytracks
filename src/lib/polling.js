import { canonicalPartyName } from './parties.mjs';
import { PARTY_SCENARIO_METHOD } from './multi-party-scenario';

const MRP_TYPES = new Set(['mrp', 'multilevel-regression-and-poststratification']);
const SHARE_ALIASES = new Map([
  ['con', 'Conservative'], ['tory', 'Conservative'], ['tories', 'Conservative'],
  ['lab', 'Labour'], ['lib dem', 'Liberal Democrats'], ['lib dems', 'Liberal Democrats'],
  ['liberal democrat', 'Liberal Democrats'], ['liberal democrats', 'Liberal Democrats'],
  ['green party', 'Green'], ['greens', 'Green'], ['grn', 'Green'],
  ['reform', 'Reform UK'], ['reform uk', 'Reform UK'], ['snp', 'Scottish National'],
  ['plaid', 'Plaid Cymru'], ['snp/plaid cymru', 'SNP/Plaid Cymru'], ['other', 'Other'], ['others', 'Other'],
]);

export function canonicalPollParty(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SHARE_ALIASES.get(normalized) || canonicalPartyName(value || 'Other');
}

function pollEndDate(poll) {
  return poll?.fieldworkEnd || poll?.date || poll?.publishedDate || null;
}

export function isMrpPoll(poll) {
  return MRP_TYPES.has(String(poll?.type || '').toLowerCase())
    || /\bmrp\b/i.test(String(poll?.pollster || ''));
}

/**
 * Equal-weight average of each pollster's latest non-MRP poll in the date
 * window. It never fills an unreported party with zero or rescales rounded
 * percentages. Geography must match exactly.
 */
export function averagePolls(polls, {
  geography = 'GB',
  asOf = null,
  windowDays = 30,
} = {}) {
  const observations = Array.isArray(polls) ? polls : (polls?.polls || []);
  const validDates = observations.map((poll) => pollEndDate(poll)).filter(Boolean).sort();
  const end = asOf || validDates.at(-1) || new Date().toISOString().slice(0, 10);
  const endTime = Date.parse(end + 'T23:59:59Z');
  const startTime = Number.isFinite(Number(windowDays)) && Number(windowDays) < 9999
    ? endTime - Number(windowDays) * 86400000 : -Infinity;
  const exclusions = [];
  const eligible = [];
  observations.forEach((poll) => {
    const date = pollEndDate(poll);
    const time = Date.parse(date || '');
    let reason = '';
    if (isMrpPoll(poll)) reason = 'MRP model excluded from voting-intention average';
    else if (!date || !Number.isFinite(time)) reason = 'poll date unavailable';
    else if (time > endTime) reason = 'after selected as-of date';
    else if (time < startTime) reason = 'outside selected date window';
    else if (!poll.geography || poll.geography === 'unverified') reason = 'geography unverified';
    else if (poll.geography !== geography) reason = 'different geography';
    if (reason) exclusions.push({ poll, reason });
    else eligible.push(poll);
  });

  const latestByPollster = new Map();
  eligible.sort((a, b) => pollEndDate(b).localeCompare(pollEndDate(a)));
  eligible.forEach((poll) => {
    const key = String(poll.pollster || 'Unknown').trim();
    if (!latestByPollster.has(key)) latestByPollster.set(key, poll);
  });
  const includedPolls = [...latestByPollster.values()].sort((a, b) => pollEndDate(a).localeCompare(pollEndDate(b)));
  const parties = new Set(includedPolls.flatMap((poll) => Object.keys(poll.shares || {})).map(canonicalPollParty));
  const shares = Object.fromEntries([...parties].sort((a, b) => a.localeCompare(b, 'en-GB')).map((party) => {
    const values = includedPolls.map((poll) => {
      const entry = Object.entries(poll.shares || {}).find(([name]) => canonicalPollParty(name) === party);
      return entry && Number.isFinite(Number(entry[1])) ? Number(entry[1]) : null;
    }).filter((value) => value !== null);
    return [party, {
      value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      pollCount: values.length,
    }];
  }));
  return {
    geography,
    asOf: end,
    windowDays: Number.isFinite(Number(windowDays)) ? Number(windowDays) : 30,
    method: 'Latest observation per pollster, equal-weight arithmetic mean by party; missing figures are omitted, not set to zero.',
    includedPolls,
    pollsterCount: includedPolls.length,
    shares,
    exclusions,
    reportedAverageTotal: Object.values(shares).reduce((sum, row) => sum + (row.value ?? 0), 0),
  };
}

/**
 * Convert a poll's reported party shares into a complete scenario vector.
 * A source's Other value and any unreported remainder are allocated across
 * election parties omitted by that poll in proportion to their baseline shares.
 * This completion is recorded with the resulting scenario.
 */
export function buildScenarioFromPoll(poll, baseline, {
  geography = 'GB',
  baselineElection = { id: '2024', label: '2024 general election' },
} = {}) {
  if (!poll || isMrpPoll(poll)) throw new Error('Choose a voting-intention poll; MRP seat models are not scenario inputs.');
  if (poll.geography !== geography || !['GB', 'UK'].includes(geography)) {
    throw new Error('Poll geography must match the selected scenario geography.');
  }
  const baselineShares = baseline?.shares || baseline || {};
  const partyNames = Object.keys(baselineShares);
  const reported = new Map();
  let explicitOther = 0;
  Object.entries(poll.shares || {}).forEach(([name, raw]) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    const party = canonicalPollParty(name);
    if (party === 'Other') explicitOther += value;
    else if (party === 'SNP/Plaid Cymru') {
      const combinedParties = ['Scottish National', 'Plaid Cymru'].filter((item) => partyNames.includes(item));
      const combinedWeight = combinedParties.reduce((sum, item) => sum + Math.max(0, Number(baselineShares[item]) || 0), 0);
      if (combinedWeight > 0) combinedParties.forEach((item) => reported.set(item,
        (reported.get(item) || 0) + value * Math.max(0, Number(baselineShares[item]) || 0) / combinedWeight));
      else explicitOther += value;
    } else if (partyNames.includes(party)) reported.set(party, (reported.get(party) || 0) + value);
    else explicitOther += value;
  });
  const reportedTotal = Object.values(poll.shares || {}).reduce((sum, value) => (
    sum + (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0)
  ), 0);
  if (reportedTotal > 101.5) throw new Error('Poll shares exceed 100 percent by more than a plausible rounding difference and cannot be completed.');
  const unreportedRemainder = Math.max(0, 100 - reportedTotal);
  const residual = explicitOther + unreportedRemainder;
  const omittedParties = partyNames.filter((party) => !reported.has(party));
  const omittedWeight = omittedParties.reduce((sum, party) => sum + Math.max(0, Number(baselineShares[party]) || 0), 0);
  const requestedShares = Object.fromEntries(partyNames.map((party) => [
    party,
    reported.has(party) ? reported.get(party) : omittedWeight > 0
      ? residual * Math.max(0, Number(baselineShares[party]) || 0) / omittedWeight
      : 0,
  ]));
  const total = Object.values(requestedShares).reduce((sum, value) => sum + value, 0);
  if (!partyNames.length || total <= 0) throw new Error('Poll does not include any compatible party shares.');
  if (Math.abs(total - 100) > 0.05) {
    const factor = 100 / total;
    Object.keys(requestedShares).forEach((party) => { requestedShares[party] *= factor; });
  }
  const roundingAdjustment = reportedTotal > 100.05
    ? 'Source percentages sum to ' + reportedTotal.toFixed(1) + ' after rounding; the completed vector is proportionally normalised to 100% for allocation.'
    : '';
  const baselineLabel = baselineElection?.label || baselineElection?.id || 'the selected baseline election';
  return {
    method: PARTY_SCENARIO_METHOD,
    geography,
    baselineElection,
    requestedShares,
    source: {
      kind: 'poll',
      id: poll.id,
      label: poll.pollster + (poll.label ? ' · ' + poll.label : ''),
      url: poll.sourceUrl || poll.providerUrl || '',
      date: poll.date || '',
    },
    assumptions: [
      'National polling shares are mapped to the selected baseline party universe; only candidates on the ' + baselineLabel + ' ballot can receive votes.',
      roundingAdjustment,
      'The source did not report a complete vector for all baseline parties. Other/unreported support (' + residual.toFixed(1) + ' points) is allocated across omitted or unavailable parties in proportion to their ' + baselineLabel + ' shares.',
      'No new candidates or constituency-level polling estimates are added; seat allocation is controlled by the selected scenario method.',
      geography === 'GB' ? 'Northern Ireland seats are held at their selected baseline and excluded from the GB scenario total.' : 'The UK geography includes Northern Ireland.',
      poll.scenarioNote || '',
    ].filter(Boolean),
  };
}

export function pollDisplayDate(poll) {
  return pollEndDate(poll);
}
