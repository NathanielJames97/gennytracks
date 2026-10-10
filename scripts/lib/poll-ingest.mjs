// Pure mapping rules for the scheduled BritPolls ingestion. The feed is a
// simple snapshot (date, pollster, lowercase party fields, sample) and
// carries no geography, fieldwork dates or per-row publisher links, so every
// mapped observation is staged as unverified and is excluded from the app's
// polling average until a human verifies it. Tests: poll-ingest.test.js.

export const PROVIDER_NAME = 'BritPolls';
export const PROVIDER_DATASET_URL = 'https://britpolls.co.uk/data/voting-intention.json';
export const STAGING_SCHEMA_VERSION = 1;

// Feed field -> canonical display party name (the app re-canonicalises at
// runtime, but staged rows should already read like curated ones).
const PROVIDER_FIELD_TO_PARTY = {
  labour: 'Labour',
  conservatives: 'Conservative',
  reform_uk: 'Reform UK',
  lib_dems: 'Liberal Democrats',
  greens: 'Green',
  snp: 'Scottish National Party',
  snp_pc: 'SNP/Plaid Cymru',
  plaid: 'Plaid Cymru',
  other: 'Other',
  others: 'Other',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function providerPollId(row) {
  const slug = String(row?.pollster || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('Provider row is missing a pollster name.');
  if (!ISO_DATE.test(String(row?.date || ''))) {
    throw new Error('Provider row is missing an ISO date: ' + JSON.stringify(row));
  }
  return 'britpolls-' + slug + '-' + row.date;
}

/**
 * Map one feed row to a staged observation. Unknown numeric fields are
 * reported (not dropped silently) so curators notice when the provider adds
 * a party. The '(MRP)' suffix stays in the pollster name; the app's
 * isMrpPoll check excludes those rows from voting-intention averages.
 */
export function mapProviderRow(row, {
  datasetUrl = PROVIDER_DATASET_URL,
  providerUpdated = null,
  ingestedAt = null,
} = {}) {
  if (!row || typeof row !== 'object') throw new Error('Provider row is not an object.');
  const pollster = String(row.pollster || '').trim();
  if (!pollster) throw new Error('Provider row is missing a pollster name: ' + JSON.stringify(row));
  if (!ISO_DATE.test(String(row.date || ''))) {
    throw new Error('Provider row has a non-ISO date: ' + JSON.stringify(row));
  }

  const shares = {};
  const unmappedProviderFields = [];
  for (const [field, value] of Object.entries(row)) {
    if (['date', 'pollster', 'sample'].includes(field)) continue;
    // Number(null) is 0: an unreported party must stay unreported, not
    // become a staged zero that the average would treat as reported.
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    const party = PROVIDER_FIELD_TO_PARTY[field];
    if (!party) {
      unmappedProviderFields.push(field);
      continue;
    }
    if (numeric >= 0) shares[party] = numeric;
  }
  if (!Object.keys(shares).length) {
    throw new Error('Provider row has no usable party shares: ' + JSON.stringify(row));
  }

  return {
    id: providerPollId(row),
    pollster,
    date: row.date,
    sampleSize: Number.isFinite(Number(row.sample)) && Number(row.sample) > 0
      ? Number(row.sample) : null,
    geography: 'unverified',
    type: 'voting-intention',
    shares,
    sourceUrl: datasetUrl,
    sourceLevel: 'provider dataset only',
    sourceNote: 'Automatically ingested from the BritPolls voting-intention dataset. Geography, fieldwork dates, mode and an original publisher link are unverified; the row is excluded from the descriptive average until verified.',
    unmappedProviderFields: unmappedProviderFields.length ? unmappedProviderFields : undefined,
    ingested: {
      provider: PROVIDER_NAME,
      datasetUrl,
      providerUpdated: providerUpdated || null,
      ingestedAt: ingestedAt || null,
    },
  };
}

/** New observations from the feed: deduped inside the feed, minus known ids. */
export function collectNewProviderPolls(feedPolls, knownIds, mappingOptions) {
  const known = new Set(knownIds || []);
  const byId = new Map();
  const feedError = (error, row) => new Error(error.message + ' (while mapping ' + JSON.stringify(row) + ')');
  for (const row of Array.isArray(feedPolls) ? feedPolls : []) {
    let mapped;
    try {
      mapped = mapProviderRow(row, mappingOptions);
    } catch (error) {
      throw feedError(error, row);
    }
    byId.set(mapped.id, mapped); // a repeated pollster+date keeps the latest entry
  }
  const added = [...byId.values()].filter((row) => !known.has(row.id));
  return { added, feedSize: byId.size };
}

/** Drop staged rows the curator has since promoted into the authored file. */
export function prunePromoted(stagedRows, promotedIds) {
  const promoted = new Set(promotedIds || []);
  return (stagedRows || []).filter((row) => !promoted.has(row.id));
}

export const REVIEW_CHECKLIST = [
  'Confirm the pollster published the row and the headline shares match the source release.',
  'Set geography to the verified value (GB or UK); unverified rows never enter the average.',
  'Fill fieldwork dates, mode and an original publisher sourceUrl where available.',
  'Replace the combined SNP/Plaid or combined-category values only if the source reports them separately.',
  'Delete rows that cannot be verified, then run npm run build && npm run deploy to publish.',
];

/** Staging document written to data/source/polls/pending-ingest.json. */
export function buildStagingDoc({ fetchedAt, providerUpdated, rows, promotedCount = 0 }) {
  return {
    schemaVersion: STAGING_SCHEMA_VERSION,
    kind: 'poll-ingest-staging',
    updatedAt: fetchedAt,
    promotedCount,
    provider: {
      name: PROVIDER_NAME,
      datasetUrl: PROVIDER_DATASET_URL,
      providerUpdated,
      attribution: 'Staged automatically from the BritPolls voting-intention dataset; see the app attribution for licence terms.',
    },
    reviewChecklist: REVIEW_CHECKLIST,
    rows,
  };
}
