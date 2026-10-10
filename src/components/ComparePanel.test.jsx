import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { downloadComparisonPng } from '../lib/comparison-png';
import ComparePanel from './ComparePanel';
import { buildComparison, filterComparisonPairs, DEFAULT_COMPARISON_FILTERS } from '../lib/comparison';
vi.mock('../lib/comparison-png', () => ({ downloadComparisonPng: vi.fn().mockResolvedValue(undefined) }));
const election = { id: 'new', label: '2024', boundarySetId: 'same' };
const comparison = { id: 'old', label: '2019 notional', boundarySetId: 'same', isNotional: true, caveat: 'Modelled totals, not declarations.' };
const seats = Array.from({ length: 31 }, (_, index) => ({ id: String(index), name: `Seat ${String(index).padStart(2, '0')}`, region: 'London', partyGroup: 'Labour', majority: 10, turnout: .6 }));
const comparisonSeats = seats.map((s) => ({ ...s, partyGroup: 'Conservative' }));
const model = buildComparison(seats, comparisonSeats, election, comparison);
const props = { election, comparison, seats, comparisonSeats, model, pairs: filterComparisonPairs(model.pairs, DEFAULT_COMPARISON_FILTERS), filters: DEFAULT_COMPARISON_FILTERS, onFilters: vi.fn(), onSelectSeat: vi.fn() };
test('offers all changed seats through pagination and opens a selected seat', () => {
  render(<ComparePanel {...props} />);
  expect(screen.getByText('Seat 00')).toBeInTheDocument();
  expect(screen.queryByText('Seat 30')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: /Seat 30/ }));
  expect(props.onSelectSeat).toHaveBeenCalledWith(seats[30]);
  expect(screen.getByText(/Modelled totals/)).toBeInTheDocument();
});
test('filter controls pass their changes to the shared comparison state', () => {
  render(<ComparePanel {...props} />);
  fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'London' } });
  expect(props.onFilters).toHaveBeenCalledWith({ ...DEFAULT_COMPARISON_FILTERS, area: 'London' });
  fireEvent.click(screen.getByLabelText('Winner changes only'));
  expect(props.onFilters).toHaveBeenCalledWith({ ...DEFAULT_COMPARISON_FILTERS, changesOnly: false });
});
test('exports the complete filtered pair set and both boundary citation inputs as PNG', async () => {
  const boundaries = { type: 'FeatureCollection', features: [] };
  const boundarySets = [{ id: 'same', label: 'Shared boundaries', sourceId: 'geometry' }];
  const sources = [{ id: 'geometry', name: 'Boundary source', url: 'https://example.test/geometry' }];
  const panelProps = { ...props, boundaries, comparisonBoundaries: boundaries, boundarySets, sources };
  vi.mocked(downloadComparisonPng).mockClear();
  render(<ComparePanel {...panelProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export comparison PNG' }));
  await waitFor(() => expect(downloadComparisonPng).toHaveBeenCalledWith(expect.objectContaining({
    election, comparison, model, pairs: props.pairs, filters: DEFAULT_COMPARISON_FILTERS,
    boundaries, comparisonBoundaries: boundaries, boundarySets, sources,
  })));
  expect(screen.getByText('Comparison PNG downloaded.')).toHaveAttribute('role', 'status');
});
test('shows an actionable comparison load failure', () => {
  render(<ComparePanel {...props} comparisonSeats={null} error={new Error('404')} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Choose another election or reload');
  expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
});
