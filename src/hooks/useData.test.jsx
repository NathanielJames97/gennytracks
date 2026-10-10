import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useDataFile } from './useData';
afterEach(() => vi.unstubAllGlobals());
test('does not expose old results under a new election while its fetch is pending', async () => {
  let resolveNext;
  vi.stubGlobal('fetch', vi.fn((url) => url.endsWith('a.json')
    ? Promise.resolve({ ok: true, json: async () => ({ election: 'a' }) })
    : new Promise((resolve) => { resolveNext = resolve; })));
  const { result, rerender } = renderHook(({ name }) => useDataFile(name), { initialProps: { name: 'a.json' } });
  await waitFor(() => expect(result.current.data).toEqual({ election: 'a' }));
  rerender({ name: 'b.json' });
  expect(result.current.data).toBeNull();
  expect(result.current.status).toBe('loading');
  await act(async () => resolveNext({ ok: true, json: async () => ({ election: 'b' }) }));
  expect(result.current.data).toEqual({ election: 'b' });
});
