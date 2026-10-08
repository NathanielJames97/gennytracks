# Genny Tracks

An interactive explorer for the **UK general election of 4 July 2024**. A map of
all 650 constituencies that can be shaded five different ways, backed by the
verified declarations from the House of Commons Library.

Built with Create React App, React 18 and `react-leaflet` 4. Basemap tiles come
from OpenStreetMap at runtime; no tiles or boundaries are served from the app.

## What it shows

The map has five modes, switchable from the header:

| Mode | Shades by |
| --- | --- |
| **Winner** | Party that won the seat |
| **Vote share** | Winning candidate's share of the vote |
| **Swing** | Which party lost each seat, so Labour's gains read as their colour |
| **Margin** | Winning margin, log-scaled so knife-edge seats stand out |
| **Turnout** | Votes cast as a share of the electorate |

The side panel has three views:

- **Overview** — national totals, seats won against vote share, where seats
  changed hands, seats by region, and the distribution of winning margins.
- **Seat** — winner, majority, turnout, electorate and the full candidate table
  with swings on 2019.
- **All seats** — searchable and sortable list of all 650 seats.

Clicking any bar in the seats-won chart filters the map to that party. Clicking a
constituency on the map, or a row in the list, opens its detail panel and flies
the map to it.

Two figures worth noticing, both surfaced in the overview:

- **Reform UK won 5 seats on 14.3% of the vote.** The Liberal Democrats won 72 on
  12.2%. Seats and votes are very different rankings.
- **100 seats were decided by fewer than 2,000 votes.** Hendon, the closest, was
  won by 15 votes out of 41,256 — a 0.036% margin, shown to four decimal places
  because rounding it to "0.0%" would hide what happened.

## Quick start

```bash
npm install
npm run build:data   # generate public/data and public/photos from data/
npm start            # http://localhost:3000
```

`build:data` must run before `start` or `build`; its output is gitignored.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Dev server with hot reload on port 3000 |
| `npm run build` | Production bundle into `build/` |
| `npm run build:data` | Regenerate the data layer from `data/` |
| `npm test` | Jest via `react-scripts` |
| `npm run deploy` | Publish `build/` to the `gh-pages` branch |

To preview a production build locally:

```bash
npm run build && node scripts/serve.mjs 8080 build
```

## Data sources

Three committed inputs under `data/`, none of which are deployed:

| Input | Provides |
| --- | --- |
| `data/source/hoc/*.csv` | **The vote data.** Official HoC Library declarations: electorate, turnout, votes per party, majorities, all 4,515 candidates |
| `data/source/constituency.geojson` | 650 seat boundaries |
| `data/List of MPs elected … Wikipedia.html` | MP portraits and article prose, which HoC does not publish |

Wikipedia is used only for photos and notes. Every vote figure comes from HoC.

### Pipeline

`scripts/build-data.mjs` joins the three sources and writes four files:

| Output | Size | Contents |
| --- | --- | --- |
| `public/data/boundaries.geojson` | ~1.9 MB | Simplified WGS84 geometry + shading fields |
| `public/data/constituencies.json` | ~1.3 MB | 650 seat records with full candidate lists |
| `public/data/parties.json` | ~32 KB | Totals, vote shares, regions, swing matrix, marginals |
| `public/photos/*.jpg` | ~1.7 MB | 341 MP portraits, safely renamed |

The geometry source is 64 MB and the generated payload is ~3.2 MB, so
`build:data` cuts about 95% of it. Coordinates drop from 1,253,898 to 80,181 via
iterative Douglas-Peucker at 0.002° plus sub-pixel landmass removal. Iterative
because some coastline rings exceed 100k points and overflow the JS stack when
recursed.

### Four things about the source data that had to be handled

**The boundaries are in the wrong projection.** `constituency.geojson` declares
`urn:ogc:def:crs:EPSG::3857` and holds Web Mercator metres. Leaflet expects WGS84
degrees, so `scripts/lib/reproject.mjs` inverts the projection first.

**Every feature carries a stray hexagon.** The dataset is called
`uk-constituencies-2024-geo-plus-hex`; each seat has an extra 7-vertex, 1060 km²
hexbin cell that is *not* on its constituency — Bradford South's sits near 9°E,
East Thanet's near 13°E, both at sea. `detectHexOverlay()` finds the signature by
looking for a low-vertex polygon repeated across nearly every feature, rather
than hardcoding the numbers.

**English regions only.** `CTR_REG` is populated for the 543 English seats and
blank for the 107 Scottish, Welsh and Northern Irish ones. Those fall back to
`Country`, giving the conventional nine English regions plus Scotland, Wales and
Northern Ireland.

**Independent winners are split oddly.** HoC's by-constituency file only has fixed
vote columns for twelve parties; independents and minor parties land in "All other
candidates", with "Of which other winner" as a *subset*. Reading those as
additive broke the vote arithmetic for six seats, which the build now asserts.

### Verification

The pipeline fails rather than producing a plausible-but-wrong map. It checks:

- 650 seats, and party seat counts matching the declared result exactly
- Published totals: electorate 48,224,212 and 28,809,340 valid votes
- Per-seat arithmetic: the winner's votes exceed the majority, which cannot
  exceed votes cast
- Reprojected bounds fall inside the UK's bounding box, so a projection
  regression fails the build instead of silently drawing in the ocean

## Layout

```
scripts/
  build-data.mjs            pipeline: parse -> join -> reproject -> simplify -> write
  lib/csv.mjs               RFC 4180 reader
  lib/hoc.mjs               HoC results loader
  lib/parse-wikipedia.mjs   MP table and portrait scraper
  lib/reproject.mjs         EPSG:3857 <-> WGS84
  lib/simplify.mjs          Douglas-Peucker, ring filtering
  serve.mjs                 static preview server
src/
  App.js                    map modes, panel routing, layer styling
  components/SeatPanel.jsx  one seat in detail
  components/SeatList.jsx   searchable table of all seats
  components/Overview.jsx   national charts
  components/BarChart.jsx   SVG bar chart and histogram
  lib/analysis.js           formatting and colour scales
  hooks/useData.js          data loading
data/                       committed inputs, not deployed
public/                     committed shell + generated data, deployed
```

The map restyles 650 polygons in place when the mode changes, via a layer map
captured in `onEachFeature`. react-leaflet's `<GeoJSON>` does not forward a ref to
the `L.GeoJSON` it creates internally, so remounting to restyle was the
alternative and would re-parse every polygon on each interaction.

## Attribution

Results are from the House of Commons Library, CBP-10009, under the Open
Parliament Licence. MP portraits and constituency names derive from Wikipedia
(CC BY-SA). Boundary data is Crown copyright / Open Government Licence. Basemap
tiles are © OpenStreetMap contributors.
