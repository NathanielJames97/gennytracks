// Official House of Commons Library election results.
//
// Source: research brief CBP-10009, "General election 2024 results".
//   HoC-GE2024-results-by-constituency.csv   one row per seat
//   HoC-GE2024-results-by-candidate.csv     one row per candidate (4,515)
//
// These files are verified declarations from returning officers and supersede
// the Wikipedia table for anything involving votes. The Wikipedia-derived
// records remain useful only for MP portraits, which HoC does not carry.
//
// Published under the Open Parliament Licence.

import { readFileSync } from 'node:fs';
import { csvToObjects, toNumber } from './csv.mjs';

// Fixed vote columns in the by-constituency file, one per party. The two
// remaining blocs ("All other candidates" and "Of which other winner") are read
// separately because they are aggregates rather than parties.
const PARTY_COLUMNS = ['Con', 'Lab', 'LD', 'RUK', 'Green', 'SNP', 'PC', 'DUP', 'SF', 'SDLP', 'UUP', 'APNI'];

// Map the Library's abbreviations onto the display names already used by the
// Wikipedia-derived records, so the two can be joined and shown together.
export const PARTY_NAMES = {
  Con: 'Conservative',
  Lab: 'Labour',
  LD: 'Liberal Democrats',
  RUK: 'Reform UK',
  Green: 'Green',
  SNP: 'Scottish National',
  PC: 'Plaid Cymru',
  DUP: 'Democratic Unionist',
  SF: 'Sinn Féin',
  SDLP: 'Social Democratic and Labour',
  UUP: 'Ulster Unionist',
  APNI: 'Alliance',
  Ind: 'Independent',
  Spk: 'Speaker',
  TUV: 'Traditional Unionist Voice',
};

export function partyName(abbrev) {
  return PARTY_NAMES[abbrev] || abbrev || 'Unknown';
}

function classifyResult(result) {
  const s = String(result || '').trim();
  if (/hold/i.test(s)) return 'hold';
  if (/gain/i.test(s)) return 'gain';
  if (/from/i.test(s)) return 'gain';
  return 'other';
}

/**
 * Seats changing hands, with both parties named.
 * "Lab gain from Con" -> { won: 'Labour', lost: 'Conservative' }
 */
function parseSwing(result) {
  const m = /gain from (.+)$/i.exec(String(result || '').trim());
  if (!m) return { won: null, lost: null };
  const lost = m[1].trim();
  const won = /^([A-Za-z&]+)/.exec(String(result))?.[1]?.trim() || null;
  return { won, lost };
}

export function loadConstituencyResults(path) {
  const { rows } = csvToObjects(readFileSync(path, 'utf8'));

  return rows.map((r) => {
    const votes = {};
    let validTotal = 0;

    for (const col of PARTY_COLUMNS) {
      const v = toNumber(r[col]);
      votes[col] = v;
      validTotal += v || 0;
    }

    // Everything outside the twelve main party columns, split into the winner
    // (who is an Independent, Speaker or minor party) and the losing minor
    // candidates. "Of which other winner" is a subset of "All other
    // candidates", so the winner's votes must come out of the total, not be
    // added on top of it.
    const other = toNumber(r['All other candidates']) ?? 0;
    const otherWinner = toNumber(r['Of which other winner']) ?? 0;
    if (other) {
      votes.OTH = Math.max(other - otherWinner, 0);
      validTotal += other;
      // Attribute the winner's votes to whichever column they won under, so
      // votes[firstParty] is always the winning total.
      const winnerAbbrev = r['First party'] || 'OTH';
      if (!votes[winnerAbbrev]) votes[winnerAbbrev] = otherWinner;
      else votes[winnerAbbrev] += otherWinner;
    }

    const electorate = toNumber(r.Electorate);
    const validVotes = toNumber(r['Valid votes']);

    return {
      name: r['Constituency name'],
      gss: r['ONS ID'],
      regionId: r['ONS region ID'],
      county: r['County name'] || null,
      region: r['Region name'],
      country: r['Country name'],
      type: r['Constituency type'],
      declarationTime: r['Declaration time'] || null,
      member: [r['Member first name'], r['Member surname']].filter(Boolean).join(' ') || null,
      memberGender: r['Member gender'] || null,
      result: r.Result || null,
      resultType: classifyResult(r.Result),
      firstParty: r['First party'] || null,
      secondParty: r['Second party'] || null,
      electorate,
      validVotes,
      invalidVotes: toNumber(r['Invalid votes']),
      majority: toNumber(r.Majority),
      turnout: electorate && validVotes ? validVotes / electorate : null,
      votes,
      validTotal,
      ...parseSwing(r.Result),
    };
  });
}

export function loadCandidateResults(path) {
  const { rows } = csvToObjects(readFileSync(path, 'utf8'));

  const bySeat = new Map();
  for (const r of rows) {
    const seat = r['Constituency name'];
    if (!bySeat.has(seat)) bySeat.set(seat, []);
    bySeat.get(seat).push({
      name: [r['Candidate first name'], r['Candidate surname']].filter(Boolean).join(' '),
      party: r['Party name'] || null,
      abbrev: r['Party abbreviation'] || null,
      gender: r['Candidate gender'] || null,
      sittingMp: r['Sitting MP'] === 'Yes',
      formerMp: r['Former MP'] === 'Yes',
      votes: toNumber(r.Votes) ?? 0,
      share: toNumber(r.Share),
      change: toNumber(r.Change),
      ecPartyId: r['Electoral Commission party ID'] || null,
    });
  }

  // Highest vote first, so index 0 is the winner in every seat.
  for (const list of bySeat.values()) list.sort((a, b) => b.votes - a.votes);
  return bySeat;
}

/** National totals across all candidates, for the summary charts. */
export function nationalTotals(candidates) {
  const totals = new Map();
  let votes = 0;
  for (const list of candidates.values()) {
    for (const c of list) {
      const key = c.abbrev || 'OTH';
      totals.set(key, (totals.get(key) || 0) + c.votes);
      votes += c.votes;
    }
  }
  return {
    votes,
    parties: [...totals.entries()]
      .map(([abbrev, v]) => ({
        abbrev,
        name: partyName(abbrev),
        votes: v,
        share: votes ? v / votes : 0,
      }))
      .sort((a, b) => b.votes - a.votes),
  };
}
