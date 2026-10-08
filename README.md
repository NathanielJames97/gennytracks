# Genny Tracks

An interactive map of all **650 UK parliamentary constituencies**, coloured by the
party that won each seat in the **2024 general election**. Click a constituency to
see its MP, party, electorate and portrait.

Built with Create React App, React 18 and `react-leaflet` 4. No map tiles are
bundled — basemap tiles come from OpenStreetMap at runtime.

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

## How the data is produced

The app reads three generated files. None of them are committed:

| File | Size | Contents |
| --- | --- | --- |
| `public/data/boundaries.geojson` | ~1.8 MB | Simplified seat boundaries, WGS84 |
| `public/data/constituencies.json` | ~270 KB | One record per seat, no geometry |
| `public/data/parties.json` | ~2 KB | Party colours, seat totals, region totals |

`scripts/build-data.mjs` derives them from two committed sources:

- `data/source/constituency.geojson` (64 MB) — 650 seat boundaries
- `data/List of MPs elected in the 2024 … - Wikipedia.html` — MP table and portraits

The two are joined on constituency name. All 650 match exactly; the only difference
between the sources is that the boundary data capitalises a mid-name "The"
("South Holland and **The** Deepings"), which `normaliseName()` absorbs. No fuzzy
matching is involved.

### Three things worth knowing about the source data

**It is in the wrong projection.** `data/source/constituency.geojson` declares
`urn:ogc:def:crs:EPSG::3857` and its coordinates are Web Mercator metres
(bbox `-962913 … 1483606, 6422887 … 8593926`). Leaflet expects WGS84 degrees, so
`scripts/lib/reproject.mjs` inverts the Mercator projection before anything else
touches the geometry. Without this the map renders in the ocean.

**Every feature carries a stray hexagon.** The dataset is called
`uk-constituencies-2024-geo-plus-hex`, and each feature has one extra 7-vertex,
1060 km² hexagon from a hexbin tessellation. They are *not* located on their
constituency — Bradford South's sits near 9°E, East Thanet's near 13°E, both at sea.
`detectHexOverlay()` finds that signature by looking for a low-vertex polygon
repeated across nearly every feature, and strips it.

**English regions only.** `CTR_REG` is populated for the 543 English seats and blank
for the 107 Scottish, Welsh and Northern Irish ones. Those fall back to `Country`,
giving the conventional 9 English regions plus Scotland, Wales and Northern Ireland.

### Simplification

Coordinates are reduced from 1,253,898 to 80,181 (93.6%) by iterative
Douglas-Peucker at 0.002° (~140 m) followed by rounding to 5 decimal places
(`scripts/lib/simplify.mjs`). Landmasses below 0.0002 deg² — sub-pixel rocks and
skerries — are dropped, keeping real islands such as Islay.

The Douglas-Peucker implementation is iterative rather than recursive because some
coastline rings exceed 100k points and would overflow the JS stack.

Geometry lives under `data/`, never `public/`: Create React App copies everything in
`public/` verbatim into `build/`, so a 64 MB source file left there would ship to
every visitor.

## Verification

The pipeline asserts its own output rather than trusting it:

- Party seat totals must sum to 650 and match the official 2024 result.
- Reprojected bounds must fall inside the UK's bounding box, so a projection
  regression fails the build instead of silently rendering in the sea.
- Ring closure, coordinate range and finite-value checks on the output.

The resulting seat counts match the official declaration exactly: Labour 411,
Conservative 121, Liberal Democrats 72, SNP 9, Sinn Féin 7, Reform UK 5, DUP 5,
Green 4, Plaid Cymru 4, plus independents, SDLP, Alliance, TUV and UUP, and the
Speaker — 650 in total.

## Layout

```
scripts/
  build-data.mjs            pipeline: parse -> join -> reproject -> simplify -> write
  lib/parse-wikipedia.mjs   MP table scraper
  lib/reproject.mjs         EPSG:3857 <-> WGS84
  lib/simplify.mjs          Douglas-Peucker, ring filtering
  serve.mjs                 static preview server
src/
  App.js                    map, party legend, seat details
  App.css
data/                       committed inputs (not deployed)
public/                     committed shell + generated data (deployed)
```

## Attribution

Boundary and MP data derive from Wikipedia and the ONS; basemap tiles are
© OpenStreetMap contributors. Constituency data is Crown copyright / Open Government
Licence.
