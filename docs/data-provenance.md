# Data provenance and limits

## Election snapshots

| Snapshot | Results source | Boundary period | Published meaning |
| --- | --- | --- | --- |
| 2001 | House of Commons Library, CBP-8647 | 2001 geometry; 1997–2001 PCA result-code period | Declared party-group results |
| 2010 | UK Parliament Election Results database | 2010–2019 | Declared constituency results |
| 2015 | UK Parliament Election Results database | 2010–2019 | Declared constituency results |
| 2017 | UK Parliament Election Results database | 2010–2019 | Declared constituency results |
| 2019 | UK Parliament Election Results database | 2010–2019 | Declared constituency results |
| 2019 notional · 2024 boundaries | UK Parliament Election Results database | 2024 | Modelled party totals, allocated to 2024 constituencies |
| 2024 | House of Commons Library, CBP-10009 | 2024 | Declared constituency and candidate results |

The historical database is a Parliament-maintained snapshot from the
[UK Parliament Election Results service](https://electionresults.parliament.uk/),
available in the
[Parliament psephology repository](https://github.com/ukparliament/psephology-datasette).
Parliamentary election information is licensed under the Open Parliament
Licence v3.0. The 2024
CSV files come from the House of Commons Library's
[General election 2024 results brief](https://commonslibrary.parliament.uk/research-briefings/cbp-10009/)
under the Open Parliament Licence.

Generated files use schema version 1, documented in
[`data/schemas/election-data-v1.schema.json`](../data/schemas/election-data-v1.schema.json).
The manifest catalogs election results, boundary sets, source attribution and
one or more directed boundary crosswalks. Each result bundle names its election
and wraps its constituency rows. Each constituency record uses the source
geographic code as its stable ID within that boundary period. Candidate party
names are normalized into display groups for consistent charts; the source
label is retained as `partyOfficial`. The history view can traverse any
crosswalk declared in that catalog.

## Boundary sets

The four 2010–2019 declared elections use the same 650-seat geography. Their
country totals are 533 England, 40 Wales, 59 Scotland and 18 Northern Ireland.
The 2019 boundary geometry is from the
[ONS December 2019 Generalised Constituency Boundaries](https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WPC_Dec_2019_GCB_UK_2022/FeatureServer/0),
with codes in `PCON19CD`. It is released under the Open Government Licence and
includes Ordnance Survey data. The ONS service metadata supplies the exact
attribution for the ONS/OS data.

The 2024 map uses 543 England, 32 Wales, 57 Scotland and 18 Northern Ireland
seats. Geometry comes from Automatic Knowledge's
[UK constituencies 2024 dataset](https://automatic-knowledge.com/), licensed
CC BY 4.0. The build verifies all 650 official codes against the results before
emitting a map.

The Parliament results database also supplies constituency overlap links from
the earlier set to 2024. The app uses the share of 2024 seat population from
each predecessor (or the share of predecessor population carried into each
successor) to navigate between maps. These values describe territorial
overlap; they do not allocate old votes to new seats. Field meanings are
documented in the [official results data dictionary](https://electionresults.parliament.uk/meta/data-dictionary).

Because the boundary codes and shapes changed, seat-level comparisons are
calculated only when both selected elections use the same geography. National
party seat counts and vote shares can still be compared across boundary periods,
but they are not the same comparison as asking how a particular seat changed.

## 2001 results and geography

The 2001 results come from the House of Commons Library CBP-8647 workbook. The committed normalized input was exported from a local GitHub mirror that has not been byte-compared with the official workbook. Its source hash and validation totals are embedded in data/source/hoc/historical-2001-results.json. The 659 party-group rows cover England (529), Wales (40), Scotland (72) and Northern Ireland (18), with 44,403,238 electors and 26,367,383 valid votes. Candidate names, second-place totals, winning margins and invalid-ballot counts are unavailable. “Other” groups smaller parties.

The mapped geometry has the exact identity “2001 election boundaries.” It combines 641 ONS Great Britain polygons with 18 Northern Ireland polygons constructed from the 1995 Order and open OSNI 1993 wards. The NI ward vintage is one year older than the Order's referenced 1 June 1994 ward areas and has 1:50,000 source detail. The ONS catalogue record's dataset-specific licence field is not set although its page has default OGL terms; that distinction is recorded with the source.

The Commons Library calls 1997–2001 a PCA result-code period, but documents minor interim London and South East boundary changes before 2001. Those codes do not mean the 1997 and 2001 polygons are identical. The app includes 2001 geometry only; 1997 geometry and a 2001-to-2010 geographic overlap crosswalk remain open work. See the historical source inventory.

## Notional 2019 result

The 2019-notional dataset is a published model that maps 2019 party support onto
2024 constituency boundaries. It is the supported bridge for comparing the
2019 and 2024 results by current seat. It is not an observed result declared by
a returning officer, and the source supplies party aggregates rather than
individual candidates. The app labels it as notional in the selector, seat
details, comparison panel and CSV export.

Notional totals are useful for boundary-aware comparison; they do not make the
2019 and 2024 campaigns or electorates identical. The model cannot show which
individual candidate would have won in a new boundary.

## Census

Census context is attached to all 650 2024 constituencies with official
country-specific source years and allocation methods:

- **England and Wales (2021):** ONS MSOA tables are summed through the published
  MSOA-to-PCON24 best-fit lookup. The file’s physical fields are named PCON25,
  while the ONS service gives them PCON24 aliases and the publication identifies
  the July 2024 lookup. The source CSV and field names are preserved as published.
- **Scotland (2022):** National Records of Scotland output-area counts are
  summed through the published OA22-to-UKPC24 lookup. The lookup documents the
  May 2024 pre-operative geography; it reports no OA allocation changes for
  five seats whose GSS codes changed.
- **Northern Ireland (2021):** NISRA publishes PCON24 totals by aggregating
  2021 Data Zones. This is an approximate allocation to the new boundaries,
  rather than a direct count from exact 2024 constituency geometry.

The shared headline measures are resident population, residents aged 65+ as a
share of all residents, and owner occupation or shared ownership as a share of
occupied households. ONS TS054 combines owned and shared ownership in England
and Wales; Scotland and Northern Ireland use owner-occupied households. Census
year and source/method are carried per seat. Education is
shown as distinct country-specific measures: England and Wales Level 4+
qualifications (ONS TS067), Northern Ireland Level 4+ (including HNC/HND), and
Scotland degree-level or above (excluding HNC/HND). Each uses the population
aged 16+ as its denominator. These education measures should not be compared as
fully harmonized rates. Existing additional ONS measures remain available only
in England and Wales; coverage labels identify those gaps rather than
estimating values for other countries.

Census measures describe residents and households in their census year, not
voters at each election. They are current demographic context alongside the
2024 result and must not be read as historical electorate data or as evidence
that a demographic feature caused a vote.

## Other material

The 2024 MP portraits and brief notes are parsed from the committed Wikipedia
MP list snapshot. They are not used for vote totals. Portraits are individual
Wikimedia files and their licenses vary; each image retains source attribution
where supplied. OpenStreetMap map tiles are fetched at runtime and credited to
© OpenStreetMap contributors.

## Historical archive status

The 2001 party-group results and matching UK-wide geometry are included. The source workbook mirror has not been byte-compared with the official download; Northern Ireland uses 1993 ward geometry for a 1995 Order referring to 1994 ward areas, and the ONS catalogue dataset-specific licence field is not set. The 1997 result and geometry are not included. See the historical source inventory for these limits and the next archive steps.

## Rebuild and assertions

To refresh the 2001 normalized source, provide the local workbook mirror and run `python scripts/export-2001-results.py`. The production build reads the committed normalized JSON, not the workbook mirror.

Run `python scripts/export-historical-results.py` to recreate the normalized
2010–2024 results input from `data/source/hoc/psephology.db`. Then run
`npm run build:data` to create the browser files, or `npm run validate:data` to
recheck files already generated under `public/data/`.

The schema and cross-file validator check:

- every manifest election, boundary set, source and crosswalk reference exists
- safe result, summary, map and crosswalk paths stay within the generated data directory
- each election has the declared number of unique result rows and boundary features
- result codes match their boundary feature codes exactly
- electorate, valid/invalid vote totals, winner votes, named-candidate counts,
  party seats and national party vote shares reconcile with the summaries
- declared candidate rows or aggregate party rows sum to valid votes according
  to the recorded result granularity
- crosswalks reference known boundary codes, contain no duplicate code pairs,
  and have population, residential and land-area shares in range and summing
  to one for each source and destination seat
- Census headline context covers the 543 English, 32 Welsh, 57 Scottish and
  18 Northern Irish 2024 constituencies, with metric-specific country coverage

The validator verifies that source license and attribution fields are present
and referenced. It does not make a legal determination about reuse rights.
Generated data under `public/data/` and copied portraits under
`public/photos/` are gitignored build outputs.
