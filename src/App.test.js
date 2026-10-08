import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';

// react-leaflet v4 ships ES modules, which Create React App's Jest config does
// not transform (node_modules is excluded from Babel). Stub the map out: these
// tests cover data loading, the party filter and the seat panel, and real
// Leaflet rendering is verified against a production build in a browser.
jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
    __esModule: true,
    MapContainer: ({ children }) => React.createElement('div', null, children),
    TileLayer: () => null,
    GeoJSON: () => React.createElement('div', { 'data-testid': 'geojson' }),
    useMap: () => ({ fitBounds: jest.fn(), flyTo: jest.fn(), getZoom: () => 6 }),
  };
});
jest.mock('leaflet/dist/leaflet.css', () => ({}));

const SEAT = {
  id: 'boston and skegness',
  name: 'Boston and Skegness',
  region: 'East Midlands',
  country: 'England',
  type: 'borough',
  gss: 'E14001063',
  electorate: 75806,
  member: 'Richard Tice',
  memberGender: 'Male',
  memberWiki: 'https://en.wikipedia.org/wiki/Richard_Tice',
  party: 'Reform UK',
  partyGroup: 'Reform UK',
  colour: '#12B6CF',
  result: 'RUK gain from Con',
  resultType: 'gain',
  firstParty: 'Reform UK',
  secondParty: 'Conservative',
  gainedFrom: 'Conservative',
  majority: 2010,
  majorityShare: 0.041,
  validVotes: 48738,
  invalidVotes: 210,
  turnout: 0.643,
  winnerVotes: 15520,
  winnerShare: 0.384,
  photo: null,
  notes: 'Defeated incumbent Matt Warman',
  candidates: [
    { name: 'Richard Tice', party: 'Reform UK', abbrev: 'RUK', gender: 'Male', votes: 15520, share: 0.384, change: 0, sittingMp: false, formerMp: false },
    { name: 'Matt Warman', party: 'Conservative', abbrev: 'Con', gender: 'Male', votes: 13510, share: 0.334, change: -0.430321, sittingMp: true, formerMp: true },
  ],
};

const SUMMARY = {
  total: 650,
  totals: { electorate: 48224212, validVotes: 28809340, invalidVotes: 116253, candidates: 4515, turnout: 0.597 },
  parties: [
    { party: 'Reform UK', seats: 5, gains: 5, holds: 0, colour: '#12B6CF' },
    { party: 'Labour', seats: 411, gains: 218, holds: 193, colour: '#E4003B' },
  ],
  voteShare: [
    { abbrev: 'Lab', party: 'Labour', votes: 9708716, share: 0.337, seats: 411, colour: '#E4003B' },
    { abbrev: 'RUK', party: 'Reform UK', votes: 4117610, share: 0.143, seats: 5, colour: '#12B6CF' },
  ],
  regions: [{ region: 'East Midlands', seats: 47, country: 'England', electorate: 100, validVotes: 60, turnout: 0.6, parties: {} }],
  swings: [{ from: 'Conservative', to: 'Reform UK', count: 5 }],
  marginals: [{ id: 'hendon', name: 'Hendon', region: 'London', majority: 15, majorityShare: 0.0001, party: 'Labour', colour: '#E4003B', member: 'Rachel Maskell' }],
  majorityBands: [
    { label: '0-1k', min: 0, max: 1000, seats: 51 },
    { label: '1-2k', min: 1000, max: 2000, seats: 49 },
  ],
  memberStats: { reelected: 347, newMPs: 335, byGender: { Female: 263, Male: 387 } },
};

const BOUNDARIES = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { id: SEAT.id, name: SEAT.name },
    geometry: { type: 'Polygon', coordinates: [[[-0.1, 52.9], [-0.1, 53.0], [0.0, 53.0], [-0.1, 52.9]]] },
  }],
};

function mockFetch({ seats = [SEAT] } = {}) {
  global.fetch = jest.fn((url) => {
    const body = url.includes('parties.json') ? SUMMARY
      : url.includes('boundaries.geojson') ? BOUNDARIES
        : seats;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
}

afterEach(() => {
  delete global.fetch;
  jest.resetAllMocks();
});

test('loads and shows national totals', async () => {
  mockFetch();
  render(<App />);

  // The header counts the seats actually loaded, so this fixture reports 1.
  await waitFor(() => expect(screen.getByText(/1 constituencies/)).toBeInTheDocument());
  expect(screen.getByText('28,809,340')).toBeInTheDocument();
  expect(screen.getByText('votes cast')).toBeInTheDocument();
  expect(screen.getByText('4,515')).toBeInTheDocument();
});

test('switching the map mode changes the active control', async () => {
  mockFetch();
  render(<App />);

  const turnout = await screen.findByRole('button', { name: 'Turnout' });
  expect(turnout).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(turnout);
  expect(turnout).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Winner' })).toHaveAttribute('aria-pressed', 'false');
});

test('clicking a seat bar filters the map and shows a banner', async () => {
  mockFetch();
  render(<App />);

  // Two parties appear in the seats-won chart; Reform UK has 5 seats.
  const seatRow = await screen.findByTitle('Reform UK: 5');
  fireEvent.click(seatRow);

  await waitFor(() => expect(screen.getByText(/Showing 1 Reform UK seats/i)).toBeInTheDocument());
});

test('the seat panel renders vote arithmetic and candidates', async () => {
  mockFetch();
  render(<App />);

  // Nothing is selected yet, so the seat tab shows guidance and is named
  // "Seat". Selecting a seat from the list renames the tab and opens the panel.
  // Wait for the data to load before interacting: the tabs are not rendered
  // until the fetch resolves.
  fireEvent.click(await screen.findByRole('tab', { name: 'Seat' }));
  expect(screen.getByText(/Click a constituency on the map/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'All seats' }));
  fireEvent.click(await screen.findByRole('row', { name: /Boston and Skegness/ }));

  // The name now appears twice: as the panel heading and as the tab label.
  expect(screen.getByRole('heading', { name: 'Boston and Skegness' })).toBeInTheDocument();
  // The winner's name shows in the header block and again in the results table.
  expect(screen.getAllByText('Richard Tice').length).toBeGreaterThan(0);
  expect(screen.getByText('2,010')).toBeInTheDocument();          // majority
  expect(screen.getByText('64.3%')).toBeInTheDocument();          // turnout
  expect(screen.getByText('RUK gain from Con')).toBeInTheDocument();
  expect(screen.getByText(/Defeated incumbent Matt Warman/)).toBeInTheDocument();

  // Winner share renders in the stat tile and in the top results row. 38.4% is
  // above the 10% threshold so it keeps one decimal; the 4.1% majority below it
  // gains a second, so neither value collapses to the other.
  expect(screen.getAllByText('38.4%').length).toBe(2);
  expect(screen.getByText('4.10%')).toBeInTheDocument();

  // Swing is shown in percentage points, and the sitting-MP badge is set.
  expect(screen.getByText('-43.0')).toBeInTheDocument();
  expect(screen.getByTitle('Was an MP before this election')).toBeInTheDocument();
});

test('searching filters the seat list', async () => {
  mockFetch({ seats: [SEAT, { ...SEAT, id: 'hendon', name: 'Hendon', member: 'Rachel Maskell', partyGroup: 'Labour', colour: '#E4003B' }] });
  render(<App />);

  fireEvent.click(await screen.findByRole('tab', { name: 'All seats' }));
  const input = screen.getByPlaceholderText(/search seat/i);
  expect(screen.getByText('2 seats')).toBeInTheDocument();

  fireEvent.change(input, { target: { value: 'hendon' } });
  await waitFor(() => expect(screen.getByText('1 of 2 seats')).toBeInTheDocument());
  expect(screen.getByText('Hendon')).toBeInTheDocument();
  expect(screen.queryByText('Boston and Skegness')).not.toBeInTheDocument();
});

test('reports a helpful error when the data layer is missing', async () => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' }));

  render(<App />);

  await waitFor(() => expect(screen.getByText(/Data unavailable/i)).toBeInTheDocument());
  expect(screen.getByText(/npm run build:data/)).toBeInTheDocument();
});
