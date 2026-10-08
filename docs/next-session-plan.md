# Vite migration record

## Status

Complete. The election explorer now builds with Vite, uses Vitest for its
existing integration coverage, and supports relative assets at a site root and
under a project subpath.

## Starting point and existing frontend contract

Work started from the clean election-history explorer commit
6c15cfc36eb5e6c35d0f1d6303f3e6722071e833. Before changing the build, the
session read README.md, docs/moonshot-roadmap.md and
docs/data-provenance.md.

The original contract was recorded before migration:

- Create React App 5 through react-scripts; npm start, npm run build
  and npm test used CRA's development server, production build and Jest
  runner. Production output was build/; predeploy built it before
  gh-pages -d build published it.
- homepage: "./" produced relative asset paths for root and project-subpath
  hosting. PUBLIC_URL was used by src/hooks/useData.js for public/data/
  and by src/components/SeatPanel.jsx for portraits under public/photos/.
  There were no REACT_APP_* references or local .env* files.
- npm run build:data runs scripts/build-data.mjs. It writes generated
  election JSON, summaries, boundary GeoJSON and cross-boundary data under
  public/data/, plus portraits under public/photos/. At kickoff these
  outputs contained 20 data files (18,913,615 bytes) and 341 photos
  (1,739,992 bytes); CRA copied them into build/.
- The generated election manifest selects the boundary GeoJSON fetched by the
  map. Leaflet renders it; OpenStreetMap tiles load from
  tile.openstreetmap.org at runtime, and the app imports Leaflet CSS.
- The old public/index.html and public/manifest.json referenced
  favicon.ico, logo192.png and logo512.png, which were absent from
  the starting checkout.
- The six original integration tests covered dataset loading and totals,
  map-mode selection, party filtering, seat-detail arithmetic, seat search and
  missing-data feedback. They stubbed React Leaflet and Leaflet CSS.

## Work completed

- Added Vite configuration and moved the HTML entry point to the repository
  root. Added a real SVG favicon and updated the web manifest to reference it.
- Changed public URL handling to Vite's import.meta.env.BASE_URL; configured
  the relative base ./ so generated data, portraits, icons and built assets
  work from either root or a project subpath.
- Moved JSX entry and test files to .jsx for Vite's JSX transform.
- Replaced CRA scripts with Vite build/dev/preview and Vitest scripts. Moved
  test tooling and gh-pages to development dependencies, removed
  react-scripts, CRA-only web vitals code, and added the missing direct
  leaflet dependency.
- Preserved all six original integration tests and added a seventh assertion
  covering base-aware data and portrait paths.
- Updated the static preview helper to use Vite's dist/ output.

## Validation evidence

All commands below succeeded using the bundled Node.js runtime
24.19.0. The machine's default Node.js 20.2.0 does not satisfy the
current Vite/Vitest engine requirement (^22.12.0 || ^24.0.0 || >=26.0.0).

- npm ci --include=optional completed successfully.
- npm run build:data completed with 650 seats and matching checks.
- npm test passed: 1 test file, 7 tests.
- npm run build completed with Vite 8.3.4 and emitted the production site
  to dist/.
- Generated data was unchanged. A sorted-path/per-file SHA-256 fingerprint for
  public/data/ and public/photos/ matched before and after migration:
  361 files, 20,653,607 bytes,
  6b874d0ae8aa1db0e1aa2806b8b617c36a034e1b73ee5e921375d04e5d28f57a.
- Headless browser smoke checks passed at both / and
  /gennytracks/: the selector loaded 2024 and the 2019 notional election,
  650 boundary features rendered, Boston and Skegness history loaded, a +5
  Labour swing projection applied, shareable URL state was copied, and the
  650-row scenario CSV downloaded. JSON, boundary, icon and manifest requests
  returned successfully at both paths. Twenty OpenStreetMap tile requests also
  returned successfully.
- The updated static preview helper served the built root document with HTTP 200
  using its default dist/ directory.
- CRA dependencies and build scripts are removed from the package manifest and
  lockfile. The Vite production build emitted no CRA warnings.

## Remaining deployment and visual checks

The root and project-subpath checks used local production previews and a
headless browser. The site was not deployed in this session, and a person has
not reviewed the rendered interface in a visible browser. Repeat a smoke check
after deployment to confirm the host's project-subpath routing and perform a
human visual review. `npm ci` also reported six npm audit advisories (one
moderate, five high); those advisories were not triaged as part of the build
migration.

## Original scope and acceptance

The frontend migration, root/subpath local production checks, and all
acceptance checks that can be completed locally are done. Work before 2010,
additional census datasets, and synchronized two-map comparison remain out of
scope for this migration.
