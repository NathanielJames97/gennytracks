import { render, screen, waitFor } from '@testing-library/react';

// react-leaflet v4 ships ES modules, which Create React App's Jest config does
// not transform (node_modules is excluded from Babel). Stub the map out: these
// tests cover data loading and the party legend, and the real Leaflet rendering
// is verified against a production build in a browser.
jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
    __esModule: true,
    MapContainer: ({ children }) => React.createElement('div', null, children),
    TileLayer: () => null,
    GeoJSON: () => React.createElement('div', { 'data-testid': 'geojson' }),
    useMap: () => ({ fitBounds: jest.fn() }),
  };
});
jest.mock('leaflet/dist/leaflet.css', () => ({}));

import App from './App';

// The app fetches its data at runtime from public/data, so mock those requests.
function mockData() {
  const seat = {
    id: 'boston and skegness',
    name: 'Boston and Skegness',
    region: 'East Midlands',
    country: 'England',
    electorate: 75806,
    member: 'Richard Tice',
    memberWiki: 'https://en.wikipedia.org/wiki/Richard_Tice',
    party: 'Reform UK',
    partyGroup: 'Reform UK',
    colour: '#12B6CF',
    photo: 'photos/richard-tice.jpg',
    notes: 'Defeated incumbent Matt Warman',
  };

  global.fetch = jest.fn((url) => {
    const body = url.includes('parties.json')
      ? {
          total: 650,
          parties: [{ party: 'Reform UK', seats: 5, colour: '#12B6CF' }],
          regions: [{ region: 'East Midlands', seats: 47 }],
        }
      : url.includes('boundaries.geojson')
        ? {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: { id: seat.id, name: seat.name },
              geometry: {
                type: 'Polygon',
                coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]],
              },
            }],
          }
        : [seat];

    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
}

afterEach(() => {
  delete global.fetch;
  jest.resetAllMocks();
});

test('shows the seat count from the generated data', async () => {
  mockData();
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText(/650 UK constituencies/i)).toBeInTheDocument();
  });
});

test('lists parties with their seat totals', async () => {
  mockData();
  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Reform UK/ })).toHaveTextContent('5');
  });
});

test('reports a helpful error when the data layer is missing', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' }),
  );

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText(/Data unavailable/i)).toBeInTheDocument();
  });
  expect(screen.getByText(/npm run build:data/)).toBeInTheDocument();
});
