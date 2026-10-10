# Genny Tracks: moonshot roadmap

## North star

Make every UK general election explorable by place. A reader should be able to
move from a national result to a constituency, understand how its boundary and
political result changed, compare fair like-for-like results, and share what they
found with a source trail attached.

Keep the product static-hostable for the foreseeable future. Election snapshots,
boundary sets and provenance can be built ahead of time and served from a CDN;
there is no need to add a database service just to browse published results.

## Shipped foundation

The first expansion makes the existing 2024 map a multi-election atlas:

- 2010, 2015, 2017 and 2019 declared results on one shared boundary period
- 2001 party-group results and matching 2001 election geography, with source limits shown
- 2019 notional party totals and declared 2024 results on 2024 boundaries
- boundary-aware election selection, constituency history, and official population-overlap links between boundary periods
- election comparison with direct constituency changes only when boundaries match
- a uniform-swing illustration, shareable URL state and CSV export
- a machine-readable source manifest and data-provenance documentation

The 2019 notional result is the official bridge for a constituency-level 2019 to
2024 comparison. The overlap data lets users navigate across boundary versions;
it is not a substitute for notional election results and does not assign past
votes to a newly drawn seat.

## Roadmap

### 1. Make the data contract and build dependable

**Why first:** every later feature depends on consistent election and geography
records.

- **Complete:** Move from Create React App to Vite while retaining React
  Leaflet and static deployment. The Vite build uses a relative base and was
  verified from both the site root and a project subpath.
- **Complete:** Add a production-browser smoke path for changing election,
  comparing 2019 notional with 2024, opening constituency history, applying a
  swing scenario, copying a link and downloading CSV. Local headless browser
  checks passed with 650 map features and successful data, boundary, icon,
  manifest and OpenStreetMap tile requests.
- **Verified:** npm ci --include=optional, npm run build:data, npm test
  (7 tests) and npm run build pass. The generated data fingerprint stayed
  identical across the migration: 361 files, 20,653,607 bytes, SHA-256
  6b874d0ae8aa1db0e1aa2806b8b617c36a034e1b73ee5e921375d04e5d28f57a.
- **Constraint:** Vite and Vitest require Node.js ^22.12.0, ^24.0.0 or >=26.0.0.
  Validation used the bundled Node.js 24.19.0 because the machine default is
  20.2.0. Deployed-host routing and human visual review are still pending.
- **Complete for the current seven-election catalog:** Add schema v1 for the
  manifest, descriptors, result bundles, summaries, map features and crosswalks.
- **Complete for the current catalog:** `build:data` checks source references,
  versioned files, seat arithmetic, exact result-to-map codes, and every
  crosswalk's source, boundary references, duplicate links and overlap sums.
  `npm run validate:data` can recheck the built output directly.
- Keep generated election files split by year and boundary epoch; precompressed
  JSON and a deterministic export fingerprint are still open.

**Status:** Fresh data generation, schema checks and the production build pass
locally under Node 24.19.0. The source license fields are validated for
presence and linkage; the validator does not determine whether a licence allows
redistribution. Deployed-host routing, browser smoke coverage of the new
comparison workspace and human visual review remain open.

### 2. Extend the archive before 2010

The Commons Library publishes constituency results back to 1918 from several historical sources. It warns that source errors exist; its CSV groups many smaller parties as “other,” while the spreadsheet includes extra detail and notes. Preserve those source limits and never invent candidate rows from party totals.

- **Complete first slice:** Integrate the 2001 results as 659 party-group rows with matching 2001 election geometry. The result workbook mirror has not been byte-compared with the official download; the source hash, totals, field limits and geometry notes are recorded in the historical inventory.
- Keep the 1997–2001 PCA result-code period separate from geometry identity. The Commons Library documents minor interim London and South East changes before 2001, so the 2001 map must not be used as an exact 1997 map.
- **Next:** Locate exact 1994/1995 ward geometry for all UK countries, then add the 1997 workbook results with a distinct boundary set and validation. If only 1991 ward geometry can be used, mark the map approximate in metadata and UI.
- Add later years one complete result-and-boundary set at a time. Treat the 2005 Scottish boundary change separately from the rest of the UK.
- Add the missing 2001-to-2010 geographic overlap links after the source geometries are verified. Store geographic overlap evidence separately from election results.
- Label missing fields and uncertain predecessor matches in the data. Keep a boundary timeline so users can tell when a seat was created, renamed, split or merged.

**Done when:** each added year has historically correct seat coverage, a mapped boundary set, cited primary sources, explicit field and reuse limits, and no unsupported cross-year seat identity.
### 3. Turn seat history into place history

The history view follows crosswalk relationships declared in the data manifest
and ranks predecessor or successor seats by population, residential or land-area
overlap. The catalog has 2001, 2010–2019 and 2024 boundary sets, but only the
2010-to-2024 overlap edge. The 2001-to-2010 link and verified 1997 geometry
remain open.

- **Working slice complete:** Show links in both directions and label the
  selected overlap measure; do not treat area overlap as vote movement.
- Add seat-name changes and boundary-era dates as earlier sets enter the catalog.
- Offer a place-focused profile that can follow several predecessor seats,
  while keeping their results separate instead of summing unrelated electorates.
- **Working slice complete:** Add accessible vote-share and turnout timelines
  for the same-seat history and the published 2019 notional/2024 pair. Label
  missing values and single-snapshot histories.

**Done when:** a user can select any mapped constituency and trace its geographic
lineage without confusing an area match with an electoral result.

### 4. Make comparisons visual and explain the difference

The comparison view now has side-by-side maps with shared pan and zoom. On
matching boundaries, changed winners receive a gold outline; across different
sets the maps remain separately labelled and the app does not draw false
seat-to-seat changes. The panel reports national party changes and, where codes
match, winner changes plus average majority and turnout movement.

- **Working slice complete:** Synchronized maps and boundary-aware winner
  highlighting are integrated with the existing comparison panel.
- **Working slice complete:** Filter the national overview by selectable region;
  add a same-boundary picker option; and export a citation-ready comparison
  image containing both maps and all filtered rows.
- Keep comparison-table export and additional regional breakdowns on the roadmap.

**Done when:** the interface can explain a comparison at national, regional and
constituency level without hiding boundary incompatibilities.

### 5. Grow the scenario lab carefully

The current lab applies a transparent uniform swing to published candidate or
party-aggregate totals where available. Extend it only with named assumptions
and clear separation from forecasts.

- Add multi-party swing and configurable transfer assumptions.
- Let readers vary turnout separately from vote share.
- Show which candidate or party result changes in each constituency and why.
- Save the scenario in the URL and export the assumptions alongside results.
- Keep an on-screen explanation that a scenario is not a prediction. Preserve 2001 Other as a grouped party category.

**Done when:** every projected figure is reproducible from the shared URL and
its assumptions are visible in the export.

### 6. Add source-backed place context

Census context is being extended across the 2024 UK geography with separately
sourced population, age, housing and education measures.

- Record each measure's country source, reference year, geography and published
  aggregation method, with coverage shown where a measure is unavailable.
- Consider local authority and deprivation indicators in a later slice.
- Keep correlation language descriptive and do not imply causation.

**Done when:** every contextual measure has a source, year, geography and
coverage note beside the chart that uses it.

## Product and engineering guardrails

- Prefer official results, boundaries and statistical sources; retain raw source
  files, hashes, retrieval dates and license text.
- Use geographic codes and official overlap tables for joins. Never use seat
  names as the sole cross-election key.
- Show when an election is notional, when a field is missing, and which
  boundary set a map uses.
- Separate declared results from modelled scenarios in colors, labels and CSV.
- Keep the experience usable without a server-side account or backend.
- Measure bundle size, downloaded data and map interaction before adding
  heavier charting or geometry packages.
- Make keyboard interaction, reduced motion, screen-reader labels and color
  contrast part of each feature's acceptance criteria.

## Comparison workspace overhaul (9 October 2026)

The comparison view now supports area totals, searchable and paginated matched
seats, filters shared by both maps, reproducible URLs and source-bearing CSV
exports. It excludes missing movement measures and reports coverage. See
[comparison-overhaul.md](comparison-overhaul.md) for the implemented plan,
validation evidence and remaining work. Citation-ready image export and a
same-boundary-only election picker remain open.
