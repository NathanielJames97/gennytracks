import { describe, expect, it } from 'vitest';
import {
  buildStagingDoc,
  collectNewProviderPolls,
  mapProviderRow,
  prunePromoted,
  providerPollId,
} from './poll-ingest.mjs';

const META = { datasetUrl: 'https://example.test/feed.json', providerUpdated: '2026-10-10', ingestedAt: '2026-10-10' };

const feedRow = {
  date: '2026-10-07',
  pollster: 'Find Out Now',
  labour: 25,
  conservatives: 20,
  reform_uk: 23,
  lib_dems: 9,
  greens: 11,
  snp: 3,
  others: 7,
  sample: 2590,
};

describe('providerPollId', () => {
  it('slugifies the pollster and date', () => {
    expect(providerPollId({ pollster: 'Find Out Now', date: '2026-10-07' }))
      .toBe('britpolls-find-out-now-2026-10-07');
    expect(providerPollId({ pollster: 'YouGov (MRP)', date: '2026-09-18' }))
      .toBe('britpolls-yougov-mrp-2026-09-18');
  });

  it('rejects rows without a pollster or ISO date', () => {
    expect(() => providerPollId({ pollster: '  ', date: '2026-10-07' })).toThrow(/pollster/i);
    expect(() => providerPollId({ pollster: 'YouGov', date: '07/10/2026' })).toThrow(/ISO date/);
  });
});

describe('mapProviderRow', () => {
  it('maps feed fields to canonical party names with unverified geography', () => {
    const row = mapProviderRow(feedRow, META);
    expect(row).toMatchObject({
      id: 'britpolls-find-out-now-2026-10-07',
      pollster: 'Find Out Now',
      date: '2026-10-07',
      sampleSize: 2590,
      geography: 'unverified',
      type: 'voting-intention',
      sourceLevel: 'provider dataset only',
      shares: {
        Labour: 25,
        Conservative: 20,
        'Reform UK': 23,
        'Liberal Democrats': 9,
        Green: 11,
        'Scottish National Party': 3,
        Other: 7,
      },
    });
    expect(row.ingested).toEqual({
      provider: 'BritPolls',
      datasetUrl: 'https://example.test/feed.json',
      providerUpdated: '2026-10-10',
      ingestedAt: '2026-10-10',
    });
    expect(row.unmappedProviderFields).toBeUndefined();
  });

  it('keeps the (MRP) suffix so the app excludes the row from averages', () => {
    const row = mapProviderRow({ ...feedRow, pollster: 'YouGov (MRP)' }, META);
    expect(row.pollster).toBe('YouGov (MRP)');
  });

  it('reports unmapped numeric fields instead of dropping them silently', () => {
    const row = mapProviderRow({ ...feedRow, sinn_fein: 2 }, META);
    expect(row.unmappedProviderFields).toEqual(['sinn_fein']);
  });

  it('keeps only finite non-negative shares', () => {
    const row = mapProviderRow({ ...feedRow, labour: -4, conservatives: null }, META);
    expect(row.shares.Labour).toBeUndefined();
    expect(row.shares.Conservative).toBeUndefined();
    expect(row.shares['Reform UK']).toBe(23);
  });

  it('rejects unusable rows', () => {
    expect(() => mapProviderRow({ ...feedRow, pollster: '' }, META)).toThrow(/pollster/i);
    expect(() => mapProviderRow({ ...feedRow, date: 'yesterday' }, META)).toThrow(/ISO date/);
    expect(() => mapProviderRow({ date: '2026-10-07', pollster: 'X' }, META)).toThrow(/no usable party shares/);
  });
});

describe('collectNewProviderPolls', () => {
  it('dedupes inside the feed and skips known ids', () => {
    const repeat = { ...feedRow, labour: 26 };
    const older = { ...feedRow, date: '2026-10-01' };
    const { added, feedSize } = collectNewProviderPolls(
      [feedRow, repeat, older],
      [providerPollId(older)],
      META,
    );
    expect(feedSize).toBe(2);
    expect(added).toHaveLength(1);
    expect(added[0].shares.Labour).toBe(26); // the latest feed entry wins
  });

  it('wraps mapping failures with the offending row', () => {
    expect(() => collectNewProviderPolls([{ ...feedRow, date: 'nah' }], [], META))
      .toThrow(/while mapping/);
  });
});

describe('prunePromoted', () => {
  it('drops staged rows that now exist in the authored file', () => {
    const a = { id: 'britpolls-a-2026-10-01' };
    const b = { id: 'britpolls-b-2026-10-02' };
    expect(prunePromoted([a, b], [a.id])).toEqual([b]);
    expect(prunePromoted(null, [a.id])).toEqual([]);
  });
});

describe('buildStagingDoc', () => {
  it('records provenance and the review checklist', () => {
    const doc = buildStagingDoc({ fetchedAt: '2026-10-10', providerUpdated: '2026-10-10', rows: [], promotedCount: 2 });
    expect(doc).toMatchObject({
      schemaVersion: 1,
      kind: 'poll-ingest-staging',
      promotedCount: 2,
      provider: { name: 'BritPolls', datasetUrl: 'https://britpolls.co.uk/data/voting-intention.json' },
    });
    expect(doc.reviewChecklist.some((item) => item.includes('geography'))).toBe(true);
  });
});
