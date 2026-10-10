import { useEffect, useState } from 'react';

const BASE = String(import.meta.env.BASE_URL) + 'data';

export function resultRows(data) {
  if (Array.isArray(data)) return data;
  return data?.schemaVersion === 1 && Array.isArray(data.results) ? data.results : null;
}

/** Fetch one JSON file from the generated data layer. */
export function useDataFile(name) {
  const [state, setState] = useState({ name, status: name ? 'loading' : 'idle', data: null, error: null });

  useEffect(() => {
    if (!name) {
      setState({ name, status: 'idle', data: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ name, status: 'loading', data: null, error: null });

    fetch(BASE + '/' + name)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status) + ' ' + res.statusText);
        return res.json();
      })
      .then((data) => { if (!cancelled) setState({ name, status: 'ready', data, error: null }); })
      .catch((error) => { if (!cancelled) setState({ name, status: 'error', data: null, error }); });

    return () => { cancelled = true; };
  }, [name]);

  return state.name === name ? state : { name, status: name ? 'loading' : 'idle', data: null, error: null };
}

/** Load several result bundles without tying hook order to archive size. */
export function useDataFiles(requests = []) {
  const requestKey = JSON.stringify(requests);
  const [state, setState] = useState({ status: 'idle', data: {}, error: null });

  useEffect(() => {
    const currentRequests = JSON.parse(requestKey);
    if (!currentRequests.length) {
      setState({ status: 'idle', data: {}, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading', data: {}, error: null });

    Promise.all(currentRequests.map(async ({ id, path }) => {
      try {
        const response = await fetch(BASE + '/' + path);
        if (!response.ok) throw new Error(String(response.status) + ' ' + response.statusText);
        return { id, data: await response.json(), error: null };
      } catch (error) {
        return { id, data: null, error };
      }
    })).then((results) => {
      if (cancelled) return;
      const data = Object.fromEntries(results.map(({ id, data }) => [id, data]));
      const error = results.find((item) => item.error)?.error || null;
      setState({ status: error ? 'error' : 'ready', data, error });
    });

    return () => { cancelled = true; };
  }, [requestKey]);

  return state;
}

/** Load the chosen election bundle and its declared boundary epoch. */
export function useDataset(requestedElectionId = '2024') {
  const manifest = useDataFile('manifest.json');
  const descriptor = manifest.data?.elections?.find((item) => item.id === requestedElectionId)
    || manifest.data?.elections?.find((item) => item.id === manifest.data.defaultElection)
    || null;
  const resultBundle = useDataFile(descriptor?.resultsFile || null);
  const summary = useDataFile(descriptor?.summaryFile || null);
  const boundaries = useDataFile(descriptor?.boundariesFile || null);
  const seats = resultRows(resultBundle.data);

  return {
    manifest: manifest.data,
    election: descriptor,
    electionId: descriptor?.id || null,
    seats,
    summary: summary.data,
    boundaries: boundaries.data,
    status: [manifest, resultBundle, summary, boundaries].some((file) => file.status === 'error') ? 'error'
      : !descriptor || [resultBundle, summary, boundaries].some((file) => file.status !== 'ready') ? 'loading' : 'ready',
    error: manifest.error || resultBundle.error || summary.error || boundaries.error,
  };
}
