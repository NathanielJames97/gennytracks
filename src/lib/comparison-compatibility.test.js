import { describe, expect, test } from 'vitest';
import {
  filterComparisonChoices,
  isBoundaryCompatible,
  resolveComparisonChoice,
} from './comparison-compatibility';

const elections = [
  { id: '2010', label: '2010', year: 2010, boundarySetId: '2010' },
  { id: '2015', label: '2015', year: 2015, boundarySetId: '2010' },
  { id: '2017', label: '2017', year: 2017, boundarySetId: '2010' },
  { id: '2019', label: '2019', year: 2019, boundarySetId: '2010' },
  { id: '2019-notional-2024', label: '2019 notional', year: 2019, boundarySetId: '2024', isNotional: true },
  { id: '2024', label: '2024', year: 2024, boundarySetId: '2024' },
  { id: '2001', label: '2001', year: 2001, boundarySetId: '2001' },
];

describe('comparison boundary compatibility', () => {
  test('allows same-boundary notional comparisons and labels boundary mismatches', () => {
    expect(isBoundaryCompatible(elections[5], elections[4])).toBe(true);
    expect(isBoundaryCompatible(elections[5], elections[3])).toBe(false);
  });

  test('requires both descriptors to name a nonempty boundary set', () => {
    expect(isBoundaryCompatible(elections[5], { id: 'unknown' })).toBe(false);
    expect(isBoundaryCompatible({ id: 'current', boundarySetId: ' ' }, elections[5])).toBe(false);
  });

  test('annotates all options, excludes the current election, and can filter to exact matches', () => {
    const all = filterComparisonChoices(elections, elections[5]);
    expect(all.map((item) => [item.id, item.boundaryCompatible, item.compatibilityLabel])).toEqual([
      ['2010', false, 'Different boundaries · seat changes unavailable'],
      ['2015', false, 'Different boundaries · seat changes unavailable'],
      ['2017', false, 'Different boundaries · seat changes unavailable'],
      ['2019', false, 'Different boundaries · seat changes unavailable'],
      ['2019-notional-2024', true, 'Same boundaries'],
      ['2001', false, 'Different boundaries · seat changes unavailable'],
    ]);
    expect(filterComparisonChoices(elections, elections[5], true).map((item) => item.id))
      .toEqual(['2019-notional-2024']);
  });

  test('preserves a visible selection and falls back to the preferred compatible option when filtered out', () => {
    expect(resolveComparisonChoice(elections, elections[5], '2019-notional-2024', true))
      .toBe('2019-notional-2024');
    expect(resolveComparisonChoice(elections, elections[5], '2019', true))
      .toBe('2019-notional-2024');
  });

  test('chooses the newest same-boundary election when the preferred baseline is ineligible', () => {
    expect(resolveComparisonChoice(elections, elections[3], 'invalid', true)).toBe('2017');
    expect(resolveComparisonChoice(elections, elections[3], 'invalid', false)).toBe('2017');
  });

  test('falls back to first available unrestricted option only when there are no same-boundary choices', () => {
    expect(resolveComparisonChoice(elections, elections[5], '', false)).toBe('2019-notional-2024');
    expect(resolveComparisonChoice(elections.slice(0, 4), elections[5], '', false)).toBe('2010');
    expect(resolveComparisonChoice(elections.slice(0, 4), elections[5], '', true)).toBe('');
    expect(filterComparisonChoices(null, elections[5])).toEqual([]);
  });
});
