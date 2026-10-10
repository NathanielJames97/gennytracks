import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ComparisonMaps from './ComparisonMaps';

vi.mock('react-leaflet', async () => {
  const ReactModule = await import('react');
  const map = {
    on: vi.fn(), off: vi.fn(), getCenter: () => ({ lat: 55, lng: -3 }),
    getZoom: () => 5, setView: vi.fn(), fitBounds: vi.fn(),
  };
  return {
    MapContainer: ({ children, className }) => ReactModule.createElement('div', { className }, children),
    TileLayer: () => null,
    GeoJSON: ({ data, style }) => ReactModule.createElement('div', {
      'data-testid': 'comparison-geometry',
      'data-styles': JSON.stringify(data.features.map((feature) => style(feature))),
    }),
    useMap: () => map,
  };
});

const boundary = (id) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id, name: id }, geometry: { type: 'Polygon', coordinates: [] } }] });
const currentSeat = { id: 'seat-a', name: 'Seat A', partyGroup: 'Labour', colour: '#E4003B' };
const priorSeat = { ...currentSeat, partyGroup: 'Conservative', colour: '#0087DC' };
const baseProps = {
  election: { id: '2024', label: '2024', boundarySetId: 'new' },
  comparison: { id: '2019', label: '2019', boundarySetId: 'new' },
  boundaries: boundary('seat-a'), comparisonBoundaries: boundary('seat-a'),
  seats: [currentSeat], comparisonSeats: [priorSeat], onSelectSeat: vi.fn(),
};

test('synchronizes a same-boundary pair and outlines seats where the winner changed', () => {
  render(<ComparisonMaps {...baseProps} />);

  expect(screen.getByRole('heading', { name: '2024' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '2019' })).toBeInTheDocument();
  expect(screen.getByText(/Gold outlines mark seats where the winner changed/)).toBeInTheDocument();
  const styles = screen.getAllByTestId('comparison-geometry').map((node) => JSON.parse(node.dataset.styles)[0]);
  expect(styles).toHaveLength(2);
  expect(styles.every((style) => style.color === '#FFE16B')).toBe(true);
});

test('does not imply seat-by-seat change when the boundary sets differ', () => {
  render(<ComparisonMaps
    {...baseProps}
    comparison={{ ...baseProps.comparison, boundarySetId: 'old' }}
    comparisonBoundaries={boundary('old-seat')}
  />);

  expect(screen.getByText(/Boundary sets differ, so seat-by-seat winner changes are not mapped/)).toBeInTheDocument();
  const styles = screen.getAllByTestId('comparison-geometry').map((node) => JSON.parse(node.dataset.styles)[0]);
  expect(styles.every((style) => style.color !== '#FFE16B')).toBe(true);
});
test('dims filtered seats consistently on both maps without marking hidden winner changes', () => {
  render(<ComparisonMaps {...baseProps} visibleIds={new Set()} />);
  const styles = screen.getAllByTestId('comparison-geometry').map((node) => JSON.parse(node.dataset.styles)[0]);
  expect(styles.every((style) => style.fillOpacity === 0.08 && style.color !== '#FFE16B')).toBe(true);
});
