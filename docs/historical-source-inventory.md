# Historical election and boundary source inventory

Reviewed 9 October 2026. This inventory separates published app inputs from upstream archive material and records known source and geometry limits.

## Current archive

The app contains seven election snapshots: 2001, 2010, 2015, 2017, 2019, 2019 notional on 2024 boundaries, and 2024. The 2001 snapshot is the first integrated pre-2010 slice. It is an aggregate-party result, not a candidate-level return.

## 2001 results

The source is the House of Commons Library [CBP-8647 results dataset](https://commonslibrary.parliament.uk/research-briefings/cbp-8647/). The integrated 2001 workbook tab has 659 seats: 529 England, 40 Wales, 72 Scotland and 18 Northern Ireland. It reports 44,403,238 electors and 26,367,383 valid votes. The per-seat party groups reconcile to the declared valid votes.

The inspected source workbook mirror has SHA-256 137eb21778b1acfd0c73ed0ae40e3fae1c9288a396a5cbc5d29b3ebe4120d7b4. It has not been byte-compared with the Commons Library download. The build reads the committed normalized input data/source/hoc/historical-2001-results.json, not the mirrored workbook. Recreate that normalized input with python scripts/export-2001-results.py when the local workbook mirror is available.

The workbook reports party-group totals, not named candidates, second-place votes, winning margins or invalid-ballot totals. Smaller parties are grouped as “Other”; its notes identify the Speaker in Glasgow Springburn and the Independent Kidderminster Hospital and Health Concern winner in Wyre Forest. The normalized data preserves those noted winners and leaves unavailable fields unknown.

## 2001 election geometry

The exact mapped set is identified as **2001 election boundaries**. It combines 641 Great Britain polygons from the ONS [2001/2005 Westminster boundary dataset](https://www.data.gov.uk/dataset/c6f9c53b-e2ba-487f-925e-0d8e8064651a/westminster-parliamentary-constituencies-2001-and-2005-boundaries-gb-bfe) with 18 Northern Ireland polygons constructed from the 1995 statutory constituency order and all 582 [OSNI 1993 wards](https://admin.opendatani.gov.uk/dataset/osni-open-data-50k-boundaries-wards-1993). The generated geometry is committed as data/source/boundaries/constituencies-2001.geojson.gz.

The OSNI 1993 ward shapes are one year older than the 1995 Order's referenced ward vintage (1 June 1994), and are at 1:50,000 source detail. The ONS catalogue record's dataset-specific licence field is “Not set” while its page has default OGL terms; that ambiguity remains recorded with the source. Do not restate the ONS dataset licence without that qualification. The OSNI open ward data and the statutory order have their own recorded reuse terms.

Do not use the separate 1995 Northern Ireland FOI polygon archive: its OSNI/LPS-derived geometry has unresolved reuse terms. The build instead constructs NI polygons from the open 1993 ward source and legal 1995 ward descriptions.

## Result-code period versus map geometry

The Commons Library groups 1997 and 2001 result rows in a “1997–2001” PCA-code period. Those codes are result join keys; they do not establish that both elections used identical seat polygons. The Library's [2001 constituency history paper](https://researchbriefings.files.parliament.uk/documents/RP08-38/RP08-38.pdf) says the 1997 seats were mostly based on April 1994 wards (with a small number based on April 1995 wards), and that mostly minor interim changes in London and South East England occurred before the 2001 election. Accordingly, this app maps the 2001 result to the 2001 geometry only. It does not include a 1997 map.

## Remaining archive and lineage work

- Locate and verify exact 1994/1995 ward geometry across England, Wales, Scotland and Northern Ireland before producing an exact 1997 boundary set. ONS publishes 1991 England and Wales ward polygons, but those are not the 1994/1995 vintage; any use of them must be labelled approximate.
- Add 1997 results from the Commons Library workbook only with their own geometry identity and source caveats.
- Build the missing 2001-to-2010 geographic overlap links from verified polygons. The existing official overlap file covers 2010-to-2024 only; these relationships describe place overlap, not vote movement.
- Add later years one complete result-and-boundary era at a time. Scotland's 2005 constituency change means 2005 needs its own country-aware geometry treatment.

## Source references

- House of Commons Library, [CBP-8647 historical results and workbook](https://commonslibrary.parliament.uk/research-briefings/cbp-8647/).
- House of Commons Library, [RP 08/38: 2001 constituency geography and changes](https://researchbriefings.files.parliament.uk/documents/RP08-38/RP08-38.pdf).
- ONS, [2001/2005 Great Britain boundary catalogue record](https://www.data.gov.uk/dataset/c6f9c53b-e2ba-487f-925e-0d8e8064651a/westminster-parliamentary-constituencies-2001-and-2005-boundaries-gb-bfe).
- OSNI, [1993 ward boundaries](https://admin.opendatani.gov.uk/dataset/osni-open-data-50k-boundaries-wards-1993).
- The National Archives, [Northern Ireland Parliamentary Constituencies Order 1995](https://www.legislation.gov.uk/uksi/1995/2992/made).
- ONS, [1991 England and Wales ward boundaries](https://www.data.gov.uk/dataset/424f350f-4869-49f2-ab39-60d6771eff45/wards-1991-boundaries-ew).
- ONS, [response on historic constituency predecessor/successor links](https://www.ons.gov.uk/aboutus/transparencyandgovernance/freedomofinformationfoi/currentandhistoricparliamentaryconstituencies).
