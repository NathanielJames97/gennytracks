# Brand assets, share previews and the polling refresh pipeline

Implementation record for the 10 October 2026 session that added the
installable-app assets, social share card and scheduled BritPolls ingestion.

## What was added

- `scripts/lib/png.mjs` — dependency-free PNG encoder and drawing toolkit
  (rounded rectangles, scanline polygon fill, blocky 5x7 font, 2x/4x
  supersampled antialiasing). Pure `node:zlib`; no npm additions.
- `scripts/generate-brand-assets.mjs` (`npm run brand:assets`) — regenerates
  `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png` (180) and `public/og-card.png` (1200x630). The card's
  dot map plots all 650 2024 constituencies at the mean vertex coordinate of
  each largest exterior boundary ring, coloured by declared winner, read from `public/data/elections/2024.json` and
  `public/data/boundaries.geojson`. Each output prints a SHA-256 prefix.
- `public/manifest.json` — PWA manifest with PNG icons (any + maskable),
  relative `start_url`/`scope` so it works at a root or subpath, en-GB.
- `index.html` — apple-touch-icon link, Open Graph and Twitter card tags.
  The OG image URL hard-codes the GitHub Pages canonical URL; update it if
  the site moves. Per-view crawler cards need a server-side rewrite and are
  deliberately out of scope for the static build.
- `scripts/lib/poll-ingest.mjs` + `scripts/refresh-polls.mjs`
  (`npm run polls:refresh`) — fetches the BritPolls voting-intention dataset,
  maps feed rows to observation schema, dedupes by stable id
  (`britpolls-<pollster-slug>-<date>`), and stages unseen rows in
  `data/source/polls/pending-ingest.json` with `geography: "unverified"`.
  It never edits `public/data/polls.json`.
- `.github/workflows/polls-refresh.yml` — daily 06:00 UTC cron plus manual
  dispatch. Commits the staging file when it changes and writes a job
  summary. Deployment stays manual: verify staged rows against original
  releases, promote into `public/data/polls.json`, then build and deploy.
- `scripts/lib/poll-ingest.test.js` — 11 tests for id stability, party
  mapping, unreported-share handling, feed dedupe and staging pruning.

## Safety property

Staged rows carry `geography: "unverified"`, and the app's `averagePolls`
excludes unverified geography, so the scheduler cannot change what the site
publishes — promotion is a verified human edit by design.

## Validation evidence (local, 10 October 2026)

- Node 24.19.0 (portable copy under the session temp directory; the machine
  default remains 20.2.0). Temporary download: no system state changed.
- `npm test`: 20 files, 106 tests passed, including the new ingest tests.
  One initial failure (a `Number(null)` share became a staged 0) was fixed in
  `mapProviderRow` before anything shipped.
- `npm run polls:refresh` live twice: first run staged 20 new rows from the feed
  dated 2026-10-10; second run staged 0 new (idempotent). Exit code 0.
- `npm run brand:assets`: five PNGs regenerated; fingerprints printed.
- `npm run build`: build:data plus Vite production build passed;
  `dist/` contains manifest.json, icons/, og-card.png and the OG meta tags.
- Browser check against `npm run preview` at http://localhost:4173/:
  app rendered with the Leaflet map, manifest resolved with all four icons,
  `/icons/icon-192.png` and `/og-card.png` returned 200, console reported
  zero errors. Preview server stopped afterwards.

## Open items

- OG URLs are hard-coded to the GitHub Pages domain (commented in
  `index.html`).
- The workflow commits to `main` when staging changes; switch to a PR flow
  if automatic commits feel too eager.
- The 20 staged rows from the first live run still need human verification
  and promotion.

## Current checkout review (10 October 2026)

- Package version `0.2.0`; local `main` at `1a421cc`, matching the local
  `origin/main` reference. The rework remains uncommitted and unpublished.
- Used Node 24.19.0 from the bundled runtime because the machine default is
  Node 20.2.0, below the package engine requirement.
- `node node_modules/vitest/vitest.mjs run`: 20 files and 106 tests passed.
- After the scenario-map caption fix, `node node_modules/vitest/vitest.mjs run
  src/App.test.jsx`: 13 tests passed; the client build and poll-to-scenario
  browser path were repeated against the updated bundle.
- `node scripts/validate-data.mjs`: 7 elections, 3 boundary sets, 4,559 seat
  rows and 1,438 links validated.
- `node node_modules/vite/bin/vite.js build`: client bundle passed. The full
  `npm run build` data regeneration was not repeated, so generated source
  outputs were left untouched.
- `node scripts/refresh-polls.mjs --dry-run`: provider snapshot dated
  2026-10-10; 20 feed rows, 24 authored ids and 20 already-staged rows; no new
  rows and no staging-file write.
- Local preview at `http://127.0.0.1:4173/`: the 2024 overview rendered, and
  the GB descriptive poll average transferred into the scenario workspace and
  applied to the map. Preview was stopped after review.
