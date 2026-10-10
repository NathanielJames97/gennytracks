// Scheduled polling refresh: fetch the BritPolls voting-intention dataset,
// stage any observations the authored snapshot does not have yet, and leave
// verification to a human. Never edits public/data/polls.json directly —
// staged rows are geography-unverified and therefore excluded from the
// app's average, so even an auto-committed staging file cannot change what
// the site shows. Local run: npm run polls:refresh (add --dry-run to inspect
// without writing). CI: .github/workflows/polls-refresh.yml.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  PROVIDER_DATASET_URL,
  buildStagingDoc,
  collectNewProviderPolls,
  prunePromoted,
} from './lib/poll-ingest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUTHORED = join(ROOT, 'public', 'data', 'polls.json');
const STAGING = join(ROOT, 'data', 'source', 'polls', 'pending-ingest.json');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const flagValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};

const dryRun = hasFlag('--dry-run');
const fixture = flagValue('--fixture');
const summaryFile = flagValue('--summary');
const datasetUrl = flagValue('--dataset') || PROVIDER_DATASET_URL;

function fail(message) {
  console.error('polls-refresh: ' + message);
  process.exit(1);
}

async function fetchDataset(url, attempt = 0) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
    return await response.json();
  } catch (error) {
    if (attempt === 0) {
      console.error('polls-refresh: fetch failed (' + error.message + '); retrying once');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return fetchDataset(url, attempt + 1);
    }
    fail('could not fetch the provider dataset from ' + url + ' after one retry (' + error.message + '). The authored snapshot is untouched.');
  }
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return fail('could not read ' + label + ' (' + error.message + ')');
  }
}

const feed = fixture
  ? await readJson(join(ROOT, fixture), 'fixture')
  : await fetchDataset(datasetUrl);
if (!feed || !Array.isArray(feed.polls)) fail('the provider dataset has no polls array.');

const authored = await readJson(AUTHORED, 'public/data/polls.json');
const authoredIds = new Set((authored.polls || []).map((row) => row.id));

const stagingPath = STAGING;
const existingStaging = existsSync(stagingPath)
  ? await readJson(stagingPath, 'staging file')
  : null;
const stagedRows = Array.isArray(existingStaging?.rows) ? existingStaging.rows : [];

// Rows already promoted since the last run drop out of staging here.
const pruned = prunePromoted(stagedRows, authoredIds);
const promotedCount = stagedRows.length - pruned.length;

const ingestedAt = new Date().toISOString().slice(0, 10);
const { added } = collectNewProviderPolls(feed.polls, [...authoredIds, ...pruned.map((r) => r.id)], {
  datasetUrl,
  providerUpdated: feed.updated || null,
  ingestedAt,
});

const mergedRows = [...pruned, ...added];
console.log('polls-refresh: provider dataset updated ' + (feed.updated || 'unknown date')
  + ' with ' + feed.polls.length + ' rows; ' + authoredIds.size + ' authored ids, '
  + pruned.length + ' staged, ' + promotedCount + ' promoted since last run, ' + added.length + ' new.');

if (added.length) {
  for (const row of added) {
    console.log('  staged ' + row.id + ' [' + Object.entries(row.shares).map(([p, v]) => p + ' ' + v).join(', ') + ']');
  }
}

if (dryRun) {
  console.log('polls-refresh: dry run, staging file not written.');
} else {
  const doc = buildStagingDoc({
    fetchedAt: ingestedAt,
    providerUpdated: feed.updated || null,
    rows: mergedRows,
    promotedCount,
  });
  await mkdir(join(ROOT, 'data', 'source', 'polls'), { recursive: true });
  await writeFile(stagingPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('polls-refresh: wrote ' + stagingPath.replace(ROOT, '') + ' (' + mergedRows.length + ' rows awaiting verification).');
}

if (summaryFile) {
  const rowLine = (row) => '| ' + [row.date, row.pollster, row.sampleSize ?? '',
    ...['Conservative', 'Labour', 'Reform UK', 'Liberal Democrats', 'Green', 'Scottish National Party', 'Other']
      .map((party) => row.shares[party] ?? '')].join(' | ') + ' |';
  const report = [
    '## Polling snapshot refresh',
    '',
    'Provider dataset updated **' + (feed.updated || 'unknown') + '**; feed rows: ' + feed.polls.length
      + '; authored observations: ' + authoredIds.size + '; newly staged: **' + added.length
      + '**; promoted since last run: ' + promotedCount + '.',
    '',
    added.length ? [
      '| Date | Pollster | n | Con | Lab | Ref | LD | Green | SNP | Other |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...added.map(rowLine),
    ].join('\n') : 'No new rows to stage.',
    '',
    'Staged rows are unverified and excluded from the app average. Verify them against the original releases, promote into `public/data/polls.json`, then deploy.',
  ].join('\n');
  await writeFile(summaryFile, report + '\n', 'utf8');
}

if (!dryRun && !added.length && !mergedRows.length) {
  console.log('polls-refresh: staging is empty and the feed has nothing new.');
}
