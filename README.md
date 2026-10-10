# Genny Tracks

An interactive history of UK general elections by place. Explore declared
results from **2001, 2010, 2015, 2017, 2019 and 2024**, move between boundary
periods, compare party outcomes, inspect a constituency's history, and explore
multi-party support scenarios, sourced polling snapshots and historical seat
backtests.

The 2019 notional result on 2024 boundaries provides a same-geography bridge to
the declared 2024 result. It is a published model of party totals, not a second
set of declared constituency results.

Built with React 18, Vite and **react-leaflet 4**. OpenStreetMap tiles load at
runtime; map boundaries and election results are generated from the committed
source data. Node.js must be **^22.12.0**, **^24.0.0**, or **>=26.0.0** for the
Vite and Vitest toolchain.

## Explore

The election selector offers seven election views:

| Election | Constituency geography | What it represents |
| --- | --- | --- |
| 2001 | 2001 election boundaries | Declared party-group totals; candidate names and margins are not available |
| 2010, 2015, 2017, 2019 | 2010–2019 boundaries | Declared election results on a shared boundary set |
| 2019 notional · 2024 boundaries | 2024 boundaries | Published notional party totals, modelled for the 2024 seats |
| 2024 | 2024 boundaries | Declared election results |

Map shading includes winner, winning vote share, swing, margin and turnout
where the source provides those fields. The 2001 result has party-group totals
but no candidate-level totals or winning margins. The election boundaries and
results cover the UK; Ireland is included in the basemap view for geographic
context. The main and comparison maps share a UK-and-Ireland extent, which
limits panning and basemap tile requests to that region.
The side panel adds national summaries with selectable regional filtering,
Census 2021 context for 2024, same-seat party-share and turnout history with
boundary-overlap navigation, election comparisons with synchronized maps,
scenario, polling and backtest workspaces, and a searchable seat list. The
selected view, year, seat and filters can be copied as a URL; election and
scenario results can be exported as CSV. Comparison views also download a
citation-ready PNG with both boundary maps, coverage counts and the complete
filtered seat list, or area party totals when boundaries differ.

Constituency-by-constituency comparisons are enabled when both elections use
the same boundary set. The comparison picker labels each choice and can be
limited to matching boundaries; cross-boundary comparisons remain available for
area totals. Matching maps outline winner changes; maps on different sets stay
separate and carry a boundary warning. The scenario workspace offers
two named multi-party allocation methods. Both are illustrations, not forecasts.
Polling observations show dates, geography and original sources where verified;
the snapshot is static and does not update automatically. Historical backtests
separate hindsight allocation checks from dated poll-to-seat checks.
Constituency history exposes official population, residential and land-area
overlap links between the 2010 and 2024 boundary sets. Links back to 2001 are
not available yet. The existing links describe territory, not vote movement.

## Quick start

~~~bash
npm install
python scripts/export-historical-results.py  # regenerate the normalized history input
npm run build:data                           # generate public/data and public/photos
npm start                                    # Vite dev server at http://localhost:5173
~~~

The Vite build uses relative asset paths, so the generated **dist/** directory
can be hosted at a site root or beneath a project subpath. The data generator
writes to **public/data/** and **public/photos/**; Vite copies those files into
**dist/** during production build.

## Scripts

| Command | What it does |
| --- | --- |
| npm start | Vite development server with hot reload |
| npm run build | Generate election data, then build the production bundle into dist/ |
| npm run validate:data | Validate generated JSON contracts and their cross-file relationships |
| npm run build:data | Generate election snapshots, boundary files and photos |
| python scripts/export-2001-results.py | Refresh normalized 2001 results from the local historical workbook mirror |
| python scripts/export-historical-results.py | Export 2010–2019 and notional 2019 results from Parliament's database |
| npm test | Run the Vitest and React Testing Library suite |
| npm run test:watch | Run Vitest in watch mode |
| npm run preview | Preview the production build locally |
| npm run deploy | Publish dist/ to the gh-pages branch |

See [docs/data-provenance.md](docs/data-provenance.md) for boundary periods,
coverage, licenses, source notes and known limits. See
[docs/moonshot-roadmap.md](docs/moonshot-roadmap.md) for the staged expansion
plan and [docs/next-session-plan.md](docs/next-session-plan.md) for the Vite
migration record. The [GitHub Desktop guide](docs/github-desktop.md) covers the
desktop workflow.

To build and preview locally:

~~~bash
npm run build
npm run preview
~~~

## Data pipeline

Committed source inputs live under **data/**; generated payloads are written
under **public/data/** and **public/photos/**.

| Input | Provides |
| --- | --- |
| data/source/hoc/constituency.csv and candidate.csv | Verified 2024 declarations and full candidate results |
| data/source/hoc/historical-2001-results.json | Normalized Commons Library 2001 party-group results; this is the build input |
| data/source/hoc/psephology.db | Official election results used for 2010–2019 and the 2019 notional dataset |
| data/source/boundaries/constituencies-2001.geojson.gz | Composite 2001 election geometry, with the NI vintage caveat documented |
| data/source/boundaries/constituencies-2019.geojson.gz | ONS constituency geometry for the 2010–2019 boundary period |
| data/source/constituency.geojson | 2024 constituency geometry |
| data/source/census/ | ONS and NISRA Census 2021 tables, Scotland’s Census 2022 output-area tables, and published 2024 seat lookups |
| data/List of MPs elected … Wikipedia.html | 2024 MP portraits and article prose; never vote totals |

The pipeline joins results to boundaries by official geographic code where
available; the 2001 source uses a validated name-and-alias join. It simplifies
the geometry, and emits an election catalog, one result and summary file per
election, one boundary file per geography and official 2010-to-2024
boundary-overlap links with population, residential and land-area shares. It
asserts 659 unique 2001
seats and 650 for each modern election, exact 2024 boundary joins, matching
2010–2019 boundary codes, the published 2024 totals and party seat counts, and
per-seat vote arithmetic.

The 2001 boundary set contains 529 English, 40 Welsh, 72 Scottish and 18
Northern Irish seats. The 2010–2019 boundary geography contains 533 English,
40 Welsh, 59 Scottish and 18 Northern Irish seats. The 2024 geography contains
543 English, 32 Welsh, 57 Scottish and 18 Northern Irish seats. Census context
covers all 650 seats: 2021 for England, Wales and Northern Ireland, and 2022
for Scotland. The country-specific source years, definitions and aggregation
methods are shown in Census details. Some older England and Wales measures
remain unavailable elsewhere; they are not filled with estimates. These are
area snapshots, not historical electorate data.

## Attribution

Election results for 2024 are from the House of Commons Library under the Open
Parliament Licence. 2001 party-group results are from the House of Commons
Library CBP-8647. Historical and notional result data for 2010–2019 are from the
UK Parliament Election Results service under the Open Parliament Licence v3.0.
The 2001 GB boundaries are from ONS; its Northern Ireland polygons are
constructed from OSNI open 1993 wards and the 1995 Order, with the source-vintage
caveat in the provenance notes. The 2010–2019 boundary layer is from the Office
for National Statistics and contains Ordnance Survey data. The 2024 boundary
layer is from Automatic Knowledge, licensed CC BY 4.0. Census data is from the
ONS, National Records of Scotland and NISRA under the Open Government Licence.
Individual MP portraits retain the
licenses and attribution of their respective Wikimedia source files; licenses
vary by image. Basemap tiles are © OpenStreetMap contributors.

### Scenario, polling and backtest workspaces

Open **Scenario** to edit the complete 2024 party-share vector for Great
Britain, Northern Ireland or the UK. The table compares requested and achieved
shares, seats and gains or losses; the seat list supports close-margin search,
region filters, candidate inspection, saved comparisons and support-transfer
sensitivity. Applying a valid scenario shades the 2024 map. Scenario URLs and
CSV exports retain the selected allocation method and its inputs.

| Method | Behaviour |
| --- | --- |
| `uniform-party-delta-v1` | Adds the same percentage-point change to each party’s local share wherever it stood, clips negative values and rescales each seat. Requested and achieved national shares can differ. |
| `national-rake-v1` | Fits local party shares to within 0.01 percentage points of requested vote-weighted totals while keeping each seat’s valid-vote total fixed. A feasibility check respects the declared candidate slate; unsupported targets are reported and cannot be applied to the map. |

Both methods use only candidates in the selected baseline result; neither adds
candidates or models turnout, tactical voting, local campaigns or uncertainty.
Country vectors are manual assumptions. Under calibrated allocation, they must
also reconcile with the Great Britain vector. A zero-change vector preserves
the declared result.

Open **Polling** for the static snapshot dated 9 October 2026. The chart can be
filtered by geography, date and pollster. Its transparent descriptive average
uses the latest verified non-MRP poll from each pollster in the chosen window,
with equal pollster weights and missing party values omitted. Unverified source
rows remain marked and are excluded from the average. The data file carries
BritPolls attribution and original pollster links where verified; the app does
not refresh it automatically. Compatible GB observations can populate the
scenario inputs with completion assumptions recorded.

Open **Backtest** to compare both allocation methods across four
same-boundary election pairs and to run fixed-date Ipsos final polls for 2015,
2017, 2019 and 2024. Allocation-only tests use eventual vote shares and include
hindsight. Poll-to-seat tests use one poll snapshot per election, all from one
pollster. They are retrospective diagnostics, not evidence of general forecast
accuracy. If the calibrated method cannot meet a poll vector on the prior
election’s candidate slate, the panel reports that case as unavailable.
See [the implementation plan](docs/polling-and-seat-analysis-plan.md) for the
full method contracts and [the Sol handoff](docs/sol-handoff-multi-party-polling-overhaul.md)
for the current checkout state and next modelling decisions.

### Comparison workspace

Open **Compare**, choose the baseline election and select an area. The picker
labels boundary compatibility and can show only elections on the selected
boundary set. Party totals
show selected election minus baseline; vote shares use total valid votes in that
area. On matching boundaries, search by seat or either party, include unchanged
winners, order by margin or turnout movement, and browse every match. Both maps
highlight the same selection. **Copy link** preserves these controls; **Export
comparison** downloads the filtered matched seats with source and boundary
metadata. Different boundary sets export area party totals instead.

See [the comparison overhaul plan](docs/comparison-overhaul.md) for validation
and the next priorities. Run `node scripts/smoke-comparison.mjs` after a build
with Playwright available to repeat the local production-browser checks.
