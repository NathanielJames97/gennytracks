import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import Overview from './Overview';

const SUMMARY = {
  totals: { validVotes: 1000, turnout: 0.6, candidates: 10 },
  parties: [{ party: 'Labour', seats: 1, colour: '#e4003b' }],
  voteShare: [{ party: 'Labour', share: 0.6, colour: '#e4003b' }],
  swings: [],
  regions: [{ region: 'East Midlands', seats: 47 }],
  majorityBands: [{ label: '0-1k', seats: 1 }, { label: '1-2k', seats: 0 }],
};

test('region chart buttons select by keyboard and expose the selected state', () => {
  const onSelectRegion = vi.fn();
  render(
    <Overview
      summary={SUMMARY}
      election={{ candidateDataGranularity: 'candidate' }}
      onSelectRegion={onSelectRegion}
    />,
  );

  const region = screen.getByRole('button', { name: /East Midlands/ });
  expect(region).toHaveAttribute('aria-pressed', 'false');

  region.focus();
  userEvent.keyboard('{Enter}');

  expect(onSelectRegion).toHaveBeenCalledWith('East Midlands');
});

test('region filter has its own clear action and keeps party selection separate', () => {
  const onSelectParty = vi.fn();
  const onSelectRegion = vi.fn();
  const onClearRegion = vi.fn();
  render(
    <Overview
      summary={SUMMARY}
      election={{ candidateDataGranularity: 'candidate' }}
      activeParty="Labour"
      onSelectParty={onSelectParty}
      activeRegion="East Midlands"
      onSelectRegion={onSelectRegion}
      onClearRegion={onClearRegion}
    />,
  );

  expect(screen.getByRole('button', { name: /East Midlands/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Clear region filter' }));
  expect(onClearRegion).toHaveBeenCalledOnce();
  expect(onSelectRegion).not.toHaveBeenCalled();

  fireEvent.click(screen.getAllByRole('button', { name: /Labour/ })[0]);
  expect(onSelectParty).toHaveBeenCalledWith(null);
});
