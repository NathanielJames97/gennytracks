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
- Add a versioned schema for election records, summaries, maps and crosswalks.
- Add data-pipeline checks for source totals, per-seat candidate arithmetic,
  boundary coverage, license metadata and export reproducibility.
- Keep generated election files split by year and boundary epoch; publish
  precompressed JSON or use a static host that serves Brotli/gzip.

**Done when:** a fresh checkout can rebuild all datasets, the browser can load
each snapshot, and source changes fail with a clear diagnostic. Schema
versioning, broader pipeline checks and compression remain open; deployed-host
routing and a human visual review also remain to be checked.

### 2. Extend the archive before 2010

The Commons Library publishes constituency results back to 1918 in a dataset
compiled from several historical sources. The CSV groups many smaller parties
as “other”, and Ireland's representation changes after 1918. Add older elections
by supported boundary eras, preserve those source limits and do not invent
individual candidates where a historical table only supplies party totals.
Start with the [Commons Library historical results dataset and its user guide](https://commonslibrary.parliament.uk/research-briefings/cbp-8647/).

- Inventory official result tables, boundary files and licenses by year.
- Add the 1950–2005 eras first, then assess pre-1950 coverage and geography.
- Add every available constituency boundary version and official successor
  relationships.
- Label missing fields and uncertain predecessor matches in the data itself.
- Keep a boundary timeline visible so users can tell when a seat was created,
  renamed, split or merged.

**Done when:** every added year has 650-seat or historically correct coverage,
a mapped boundary set, a cited primary source and explicit missing-data notes.

### 3. Turn seat history into place history

The current profile follows codes within their boundary period and links across
the 2024 review by official population overlap. Expand that into a complete
constituency lineage.

- Display predecessors and successors as a navigable graph, with overlap
  percentages and the selected overlap measure.
- Show seat-name changes and boundary-era dates.
- Offer a place-focused profile that can follow several predecessor seats,
  while keeping their results separate instead of summing unrelated electorates.
- Add vote-share and turnout timelines only where results are same-boundary or
  officially notional.

**Done when:** a user can select any mapped constituency and trace its geographic
lineage without confusing an area match with an electoral result.

### 4. Make comparisons visual and explain the difference

The first comparison panel shows party totals and same-boundary winner changes.
Build a dedicated comparison workspace with two synchronized maps and a clear
difference layer.

- Compare two elections side by side and synchronize zoom, pan and selection.
- Show party seat changes, vote-share changes in percentage points, winner
  changes, majority movement and turnout movement.
- Provide a “same boundaries” filter and visibly label notional or crosswalk
  comparisons.
- Export a comparison table and a citation-ready image.

**Done when:** the interface can explain a comparison at national, regional and
constituency level without hiding boundary incompatibilities.

### 5. Grow the scenario lab carefully

The current lab uses a transparent uniform swing over published candidate
totals. Extend it only with named assumptions and clear separation from
forecasts.

- Add multi-party swing and configurable transfer assumptions.
- Let readers vary turnout separately from vote share.
- Show which candidate or party result changes in each constituency and why.
- Save the scenario in the URL and export the assumptions alongside results.
- Keep an on-screen explanation that a scenario is not a prediction.

**Done when:** every projected figure is reproducible from the shared URL and
its assumptions are visible in the export.

### 6. Add source-backed place context

Census 2021 currently gives England and Wales context on the 2024 geography.
Other sources can deepen the place story if they can be compared responsibly.

- Add Scotland's Census 2022 and Northern Ireland Census 2021 as separately
  sourced datasets.
- Consider local authority, age, education, housing and deprivation indicators.
- Store each measure's reference year, geography and aggregation method.
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
