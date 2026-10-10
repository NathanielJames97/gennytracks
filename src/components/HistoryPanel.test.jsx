import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import HistoryPanel from './HistoryPanel';

const crosswalk = {
  id: 'old-to-new',
  fromBoundarySetId: 'old',
  toBoundarySetId: 'new',
  overlaps: [
    { fromCode: 'old-a', fromName: 'Old A', toCode: 'new-a', toName: 'New A', fromPopulationShare: 0.7, toPopulationShare: 0.85, fromResidentialShare: 0.6, toResidentialShare: 0.8, fromAreaShare: 0.4, toAreaShare: 0.25 },
    { fromCode: 'old-b', fromName: 'Old B', toCode: 'new-a', toName: 'New A', fromPopulationShare: 0.3, toPopulationShare: 0.15, fromResidentialShare: 0.4, toResidentialShare: 0.2, fromAreaShare: 0.6, toAreaShare: 0.75 },
  ],
};

function renderHistory({ seat, boundarySetId, onSelectPlace = vi.fn() }) {
  return {
    onSelectPlace,
    ...render(<HistoryPanel
      seat={seat}
      election={{ boundarySetId }}
      elections={[]}
      boundarySets={[{ id: 'old', label: 'Old boundary era' }, { id: 'new', label: 'New boundary era' }]}
      resultSets={[]}
      crosswalks={[crosswalk]}
      onSelectElection={vi.fn()}
      onSelectPlace={onSelectPlace}
    />),
  };
}

test('ranks outgoing place links by the selected overlap measure and navigates to the linked era', () => {
  const onSelectPlace = vi.fn();
  renderHistory({ seat: { id: 'new-a', name: 'New A' }, boundarySetId: 'new', onSelectPlace });

  const links = screen.getAllByRole('button');
  expect(links[0]).toHaveTextContent('Old A');
  expect(links[0]).toHaveTextContent('85.0%');
  fireEvent.change(screen.getByLabelText('Overlap measure'), { target: { value: 'area' } });
  expect(screen.getAllByRole('button')[0]).toHaveTextContent('Old B');
  expect(screen.getAllByRole('button')[0]).toHaveTextContent('75.0%');

  fireEvent.click(screen.getAllByRole('button')[0]);
  expect(onSelectPlace).toHaveBeenCalledWith('old-b', 'old');
});

test('uses the selected old seat share when following links into a newer era', () => {
  renderHistory({ seat: { id: 'old-a', name: 'Old A' }, boundarySetId: 'old' });

  expect(screen.getByRole('heading', { name: 'Across a boundary change' })).toBeInTheDocument();
  expect(screen.getAllByRole('button')[0]).toHaveTextContent('New A');
  expect(screen.getAllByRole('button')[0]).toHaveTextContent('70.0%');
  expect(screen.getByText('New boundary era')).toBeInTheDocument();
});

function renderHistoryTrends({ elections, resultSets, selectedId = 'seat-a', onSelectElection = vi.fn() }) {
  return {
    onSelectElection,
    ...render(<HistoryPanel
      seat={{ id: selectedId, name: 'Example North', partyGroup: 'Labour', colour: '#E4003B' }}
      election={{ boundarySetId: '2024' }}
      elections={elections}
      boundarySets={[]}
      resultSets={resultSets}
      crosswalks={[]}
      onSelectElection={onSelectElection}
      onSelectPlace={vi.fn()}
    />),
  };
}

const notional2024Elections = [
  { id: '2019-notional-2024', year: 2019, label: '2019 notional · 2024 boundaries', boundarySetId: '2024', isNotional: true },
  { id: '2024', year: 2024, label: '2024', boundarySetId: '2024', isNotional: false },
  { id: '2019', year: 2019, label: '2019', boundarySetId: '2010', isNotional: false },
];

const result = (id, values) => ({ id, name: 'Example North', partyGroup: 'Labour', majority: 10, winnerShare: 0.5, ...values });

test('charts only same-boundary history, combines source aliases, and keeps distinct party identities', () => {
  const onSelectElection = vi.fn();
  renderHistoryTrends({
    elections: notional2024Elections,
    resultSets: [
      [result('seat-a', { validVotes: 100, turnout: 0.64, partyTotals: [
        { party: 'Labour and Co-operative Party', votes: 20 }, { party: 'Liberal Democrat', votes: 20 },
        { party: 'Reform', votes: 30 }, { party: 'Independent', votes: 10 },
        { party: 'Independent Group', votes: 10 }, { party: 'Green', votes: 10 },
      ] })],
      [result('seat-a', { validVotes: 200, turnout: 0.71, partyTotals: [
        { party: 'Labour', votes: 50 }, { party: 'Liberal Democrats', votes: 50 },
        { party: 'Reform UK', votes: 50 }, { party: 'Independent', votes: 20 },
        { party: 'Independent Group', votes: 20 }, { party: 'Alliance', votes: 10 },
      ] })],
      [result('seat-a', { validVotes: 100, turnout: 0.5, partyTotals: [{ party: 'Conservative', votes: 100 }] })],
    ],
    onSelectElection,
  });

  expect(screen.getByRole('img', { name: /Party vote share/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Turnout/ })).toBeInTheDocument();
  const shareTable = screen.getByRole('table', { name: 'Party vote share by election' });
  expect(within(shareTable).getAllByRole('columnheader')).toHaveLength(3);
  const partyShares = (party) => {
    const row = within(shareTable).getAllByRole('row').find((candidate) => candidate.querySelector('th[scope="row"]')?.textContent === party);
    return within(row).getAllByRole('cell').map((cell) => cell.textContent);
  };
  expect(partyShares('Labour')).toEqual(['20.0%', '25.0%']);
  expect(partyShares('Liberal Democrats')).toEqual(['20.0%', '25.0%']);
  expect(partyShares('Reform')).toEqual(['30.0%', '0.0%']);
  expect(partyShares('Reform UK')).toEqual(['0.0%', '25.0%']);
  expect(partyShares('Independent')).toEqual(['10.0%', '10.0%']);
  expect(partyShares('Independent Group')).toEqual(['10.0%', '10.0%']);
  expect(partyShares('Green')).toEqual(['10.0%', '0.0%']);
  expect(partyShares('Alliance')).toEqual(['0.0%', '5.0%']);
  expect(screen.getByText(/2019 notional is an estimate on 2024 boundaries/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /2019 notional · 2024 boundaries/ }));
  expect(onSelectElection).toHaveBeenCalledWith('2019-notional-2024');
});

test('shows missing chart values as unavailable rather than zero', () => {
  const elections = [
    { id: '2010', year: 2010, label: '2010', boundarySetId: '2024' },
    { id: '2015', year: 2015, label: '2015', boundarySetId: '2024' },
    { id: '2017', year: 2017, label: '2017', boundarySetId: '2024' },
  ];
  renderHistoryTrends({ elections, resultSets: [
    [result('seat-a', { validVotes: null, turnout: null, partyTotals: [] })],
    [result('seat-a', { validVotes: 100, turnout: 0.6, partyTotals: [{ party: 'Labour', votes: 60 }, { party: 'Conservative', votes: 40 }] })],
    [result('seat-a', { validVotes: 100, turnout: 0.65, partyTotals: [{ party: 'Labour', votes: 65 }, { party: 'Conservative', votes: 35 }] })],
  ] });

  const shareTable = screen.getByRole('table', { name: 'Party vote share by election' });
  const labour = within(shareTable).getByRole('row', { name: /Labour/ });
  expect(within(labour).getAllByRole('cell')[0]).toHaveTextContent('—');
  const turnoutTable = screen.getByRole('table', { name: 'Turnout by election' });
  expect(within(turnoutTable).getByRole('row', { name: /2010/ })).toHaveTextContent('—');
});

test('gives single-snapshot guidance without rendering trend charts', () => {
  renderHistoryTrends({
    elections: [notional2024Elections[1]],
    resultSets: [[result('seat-a', { validVotes: 100, turnout: 0.6, partyTotals: [{ party: 'Labour', votes: 60 }, { party: 'Conservative', votes: 40 }] })]],
  });

  expect(screen.getByText(/History trends need at least two election snapshots/)).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Party vote share/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Turnout/ })).not.toBeInTheDocument();
});
