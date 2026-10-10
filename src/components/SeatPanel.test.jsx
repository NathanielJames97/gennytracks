import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import SeatPanel from './SeatPanel';

const declared = {
  id: 'test-seat', name: 'Test seat', region: 'England', party: 'Conservative',
  partyGroup: 'Conservative', colour: '#0087dc', winnerShare: 0.41, majority: 120,
  majorityShare: 0.002, turnout: 0.6, electorate: 10000, validVotes: 6000,
  candidates: [
    { name: 'Candidate C', party: 'Conservative', votes: 2460, share: 0.41 },
    { name: 'Candidate L', party: 'Labour', votes: 2340, share: 0.39 },
  ],
};

const projected = {
  id: 'test-seat', partyGroup: 'Labour', projectedParty: 'Labour',
  simulatedCandidates: [
    { id: 'c', name: 'Candidate C', party: 'Conservative', share: 0.36, sourceIndex: 0 },
    { id: 'l', name: 'Candidate L', party: 'Labour', share: 0.44, sourceIndex: 1 },
  ],
};

test('shows the applied projected winner alongside the declared winner', () => {
  render(<SeatPanel seat={declared} election={{ id: '2024', label: '2024' }} scenarioSeat={projected} />);

  expect(screen.getByText(/Declared winner:/)).toBeInTheDocument();
  expect(screen.getByText('Projected winner:')).toBeInTheDocument();
  expect(screen.getByText('Labour', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText(/candidate votes remain below for comparison/)).toBeInTheDocument();
});

test('does not show an unapplied scenario as a seat result', () => {
  render(<SeatPanel seat={declared} election={{ id: '2024', label: '2024' }} scenarioSeat={null} />);

  expect(screen.queryByText('Applied 2024 scenario')).not.toBeInTheDocument();
  expect(screen.getByText('Conservative', { selector: '.tag' })).toBeInTheDocument();
});
