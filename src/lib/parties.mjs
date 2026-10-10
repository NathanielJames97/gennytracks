// Equivalent source spellings only. Distinct parties and grouped Other totals
// retain separate identities; this does not model mergers or vote transfers.
const ALIASES = new Map([
  ['Labour and Co-operative', 'Labour'], ['Labour and Co-operative Party', 'Labour'],
  ['Conservative and Unionist Party', 'Conservative'],
  ['Liberal Democrat', 'Liberal Democrats'],
  ['Scottish National Party', 'Scottish National'],
  ['Democratic Unionist Party', 'Democratic Unionist'],
  ['Social Democratic & Labour Party', 'Social Democratic and Labour'],
  ['Social Democratic and Labour Party', 'Social Democratic and Labour'],
  ['Sinn Fein', 'Sinn Féin'],
  ['Ulster Unionist Party', 'Ulster Unionist'],
  ['Green Party', 'Green'], ['Green Party Northern Ireland', 'Green Party NI'],
  ['Alliance Party of Northern Ireland', 'Alliance'],
  ['Plaid Cymru - The Party of Wales', 'Plaid Cymru'],
  ['The Brexit Party', 'Brexit Party'],
]);
export function canonicalPartyName(name) {
  const value = name || 'Independent';
  return ALIASES.get(value) || value;
}
