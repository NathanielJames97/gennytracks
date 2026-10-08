# Genny Tracks

An interactive history of UK general elections by place. Explore declared results
from **2010, 2015, 2017, 2019 and 2024**, move between boundary periods, compare
party outcomes, inspect a constituency's history, and try a clearly labelled
uniform-swing illustration.

The 2019 notional result on 2024 boundaries provides a same-geography bridge to
the declared 2024 result. It is a published model of party totals, not a second
set of declared constituency results.

Built with React 18, Create React App and `react-leaflet` 4. OpenStreetMap tiles
load at runtime; map boundaries and election results are generated from the
committed source data.

## Explore

The election selector loads six datasets:

| Election | Constituency geography | What it represents |
| --- | --- | --- |
| 2010, 2015, 2017, 2019 | 2010–2019 boundaries | Declared election results on a shared boundary set |
| 2019 notional · 2024 boundaries | 2024 boundaries | Published notional party totals, modelled for the 2024 seats |
| 2024 | 2024 boundaries | Declared election results |

Map shading includes winner, winning vote share, swing, margin and turnout.
The side panel adds national summaries, Census 2021 context for 2024, same-seat
history, election comparisons, a scenario lab and a searchable seat list. The
selected view, year, seat and filters can be copied as a URL; the displayed
results can be exported as CSV.

Constituency-by-constituency comparisons are enabled when both elections use
the same boundary set. Comparisons across the boundary review are described at
national level and carry a warning. The scenario lab applies a uniform party
vote-share shift to existing candidate totals. It is an illustration, not a
forecast. Constituency history also exposes Parliament's official population
overlap links across the 2024 boundary review; those links describe territory,
not vote movement.

## Quick start

```bash
npm install
python scripts/export-historical-results.py  # regenerate the normalized history input
npm run build:data                           # generate public/data and public/photos
npm start                                    # http://localhost:3000
```

`build:data` runs before `start` or `build`; its output is gitignored.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Development server with hot reload |
| `npm run build` | Production bundle into `build/` |
| `npm run build:data` | Generate election snapshots, boundary files and photos |
| `python scripts/export-historical-results.py` | Export 2010–2019 and notional 2019 results from Parliament's database |
| `npm test` | Jest via Create React App |
| `npm run deploy` | Publish `build/` to the `gh-pages` branch |

See [docs/data-provenance.md](docs/data-provenance.md) for boundary periods,
coverage, licenses, source notes and known limits. See
[docs/moonshot-roadmap.md](docs/moonshot-roadmap.md) for the staged expansion plan
and [docs/next-session-plan.md](docs/next-session-plan.md) for the next build-system
milestone. The [GitHub Desktop guide](docs/github-desktop.md) covers the desktop workflow.

To preview a production build locally:

```bash
npm run build && node scripts/serve.mjs 8080 build
```

## Data pipeline

Committed source inputs live under `data/`; generated payloads are written under
`public/data/` and `public/photos/`.

| Input | Provides |
| --- | --- |
| `data/source/hoc/constituency.csv` and `candidate.csv` | Verified 2024 declarations and full candidate results |
| `data/source/hoc/psephology.db` | Official election results used for 2010–2019 and the 2019 notional dataset |
| `data/source/boundaries/constituencies-2019.geojson.gz` | ONS constituency geometry for the 2010–2019 boundary period |
| `data/source/constituency.geojson` | 2024 constituency geometry |
| `data/source/census/` | ONS Census 2021 tables and the MSOA-to-constituency lookup |
| `data/List of MPs elected … Wikipedia.html` | 2024 MP portraits and article prose; never vote totals |

The pipeline joins results to boundaries by official geographic code, simplifies
the geometry, and emits an election catalog, one result and summary file per
election, one boundary file per geography and an official cross-boundary
population-overlap table. It asserts 650 unique seats per
election, exact 2024 boundary joins, matching 2010–2019 boundary codes, the
published 2024 totals and party seat counts, and per-seat vote arithmetic.

The 2010–2019 boundary geography contains 533 English, 40 Welsh, 59 Scottish
and 18 Northern Irish seats. The 2024 geography contains 543 English, 32 Welsh,
57 Scottish and 18 Northern Irish seats. Census 2021 is aggregated to 2024
boundaries and covers 575 England and Wales seats; it is not historical
demographic data for earlier elections.

## Attribution

Election results for 2024 are from the House of Commons Library under the Open
Parliament Licence. Historical and notional result data are from the UK
Parliament Election Results service under the Open Parliament Licence v3.0.
The 2010–2019 boundary layer is from the Office for National Statistics and
contains Ordnance Survey data. The 2024 boundary layer is from Automatic
Knowledge, licensed CC BY 4.0. Census data is from the ONS under the Open
Government Licence. Individual MP portraits retain the licenses and attribution
of their respective Wikimedia source files; licenses vary by image. Basemap
tiles are © OpenStreetMap contributors.
