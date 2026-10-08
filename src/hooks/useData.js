import { useEffect, useState } from 'react';

const BASE = `${process.env.PUBLIC_URL || ''}/data`;

/**
 * Fetch a JSON file from the generated data layer, with loading and error
 * state. Returns a stable object so callers can destructure without churn.
 */
export function useDataFile(name) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const url = `${BASE}/${name}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((data) => { if (!cancelled) setState({ status: 'ready', data, error: null }); })
      .catch((error) => { if (!cancelled) setState({ status: 'error', data: null, error }); });

    return () => { cancelled = true; };
  }, [name]);

  return state;
}

/** The three generated files the app needs, fetched together. */
export function useDataset() {
  const seats = useDataFile('constituencies.json');
  const summary = useDataFile('parties.json');
  const boundaries = useDataFile('boundaries.geojson');

  return {
    seats: seats.data,
    summary: summary.data,
    boundaries: boundaries.data,
    status: seats.status === 'error' || summary.status === 'error' ? 'error'
      : seats.status === 'loading' ? 'loading' : 'ready',
    error: seats.error || summary.error || boundaries.error,
  };
}
