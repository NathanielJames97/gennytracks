import { expect, test } from 'vitest';
import { canonicalPartyName } from './parties.mjs';
test('normalizes equivalent source names while preserving distinct parties', () => {
  expect(canonicalPartyName('Sinn Fein')).toBe('Sinn Féin');
  expect(canonicalPartyName('Social Democratic and Labour Party')).toBe('Social Democratic and Labour');
  expect(canonicalPartyName('Ulster Unionist Party')).toBe('Ulster Unionist');
  expect(canonicalPartyName('Brexit Party')).toBe('Brexit Party');
  expect(canonicalPartyName('Reform UK')).toBe('Reform UK');
  expect(canonicalPartyName('Scottish Green Party')).toBe('Scottish Green Party');
  expect(canonicalPartyName('Other')).toBe('Other');
});
