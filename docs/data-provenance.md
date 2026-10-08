# Data provenance and limits

## Election snapshots

| Snapshot | Results source | Boundary period | Published meaning |
| --- | --- | --- | --- |
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

The data build exports separate result and summary JSON files for each election.
Each constituency record uses the source geographic code as its stable ID within
that boundary period. Candidate party names are normalized into display groups
for consistent charts; the source label is retained as `partyOfficial`.

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

Census 2021 tables are aggregated from MSOA to the 2024 constituency geography
with the ONS best-fit lookup. This covers 575 seats in England and Wales. The
57 Scottish and 18 Northern Irish seats have no values in this dataset.

Census measures describe residents in 2021, not voters at each election. They
are shown as current demographic context with the 2024 result and must not be
read as historical electorate data or as evidence that a demographic feature
caused a vote.

## Other material

The 2024 MP portraits and brief notes are parsed from the committed Wikipedia
MP list snapshot. They are not used for vote totals. Portraits are individual
Wikimedia files and their licenses vary; each image retains source attribution
where supplied. OpenStreetMap map tiles are fetched at runtime and credited to
© OpenStreetMap contributors.

## Rebuild and assertions

Run `python scripts/export-historical-results.py` to recreate the normalized
historical input from `data/source/hoc/psephology.db`. Then run
`npm run build:data` to create the browser data files. The build checks:

- 650 unique constituencies for every election
- exact matching of results and the appropriate boundary set by official code
- 650 old and new codes covered by the official boundary-overlap table, with population fractions summing to 1 for each constituency
- candidate votes summing to the declared valid votes for every historical seat
- 2024 declared totals, party seat counts and per-seat vote arithmetic
- 575 Census-coded 2024 seats, all in England or Wales

Generated data under `public/data/` and copied portraits under
`public/photos/` are gitignored build outputs.
