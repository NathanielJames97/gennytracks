import { useEffect, useState } from 'react';

const BASE = `${import.meta.env.BASE_URL}data`;

/**
 * Fetch a JSON file from the generated data layer, with loading and error
 * state. Returns a stable object so callers can destructure without churn.
 */
export function useDataFile(name) {
  const [state, setState] = useState({ status: name ? 'loading' : 'idle', data: null, error: null });

  useEffect(() => {
    if (!name) {
      setState({ status: 'idle', data: null, error: null });
      return undefined;
    }
    let cancelled = false;
    const url = `${BASE}/${name}`;
    setState({ status: 'loading', data: null, error: null });

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

/** Load the chosen election bundle and its declared boundary epoch. */
export function useDataset(requestedElectionId = '2024') {
  const manifest = useDataFile('manifest.json');
  const descriptor = manifest.data?.elections?.find((item) => item.id === requestedElectionId)
    || manifest.data?.elections?.find((item) => item.id === manifest.data.defaultElection)
    || null;
  const seats = useDataFile(descriptor?.resultsFile || null);
  const summary = useDataFile(descriptor?.summaryFile || null);
  const boundaries = useDataFile(descriptor?.boundariesFile || null);

  return {
    manifest: manifest.data,
    election: descriptor,
    electionId: descriptor?.id || null,
    seats: seats.data,
    summary: summary.data,
    boundaries: boundaries.data,
    status: [manifest, seats, summary, boundaries].some((file) => file.status === 'error') ? 'error'
      : !descriptor || [seats, summary, boundaries].some((file) => file.status !== 'ready') ? 'loading' : 'ready',
    error: manifest.error || seats.error || summary.error || boundaries.error,
  };
}
