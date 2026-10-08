# House of Commons Library results data

Source: [research brief CBP-10009, *General election 2024 results*](https://commonslibrary.parliament.uk/research-briefings/cbp-10009/0),
House of Commons Library, Open Parliament Licence.

| File | Origin | Contents |
| --- | --- | --- |
| `constituency.csv` | `HoC-GE2024-results-by-constituency.csv` | 650 rows, one per seat: electorate, valid and invalid votes, majority, votes per party |
| `candidate.csv` | `HoC-GE2024-results-by-candidate.csv` | 4,515 rows, one per candidate: votes, share, change on 2019 notional, sitting/former MP flags |

These are verified declarations from returning officers. They are the authority
for every vote figure in the app; the Wikipedia table parsed by
`scripts/lib/parse-wikipedia.mjs` contributes only MP portraits and article prose,
which the Library does not publish.

Both files are renamed on download so the import path in `scripts/build-data.mjs`
stays stable if the Library republishes under a new version suffix. To refresh:

```bash
cd data/source/hoc
BASE=https://researchbriefings.files.parliament.uk/documents/CBP-10009
curl -sSLO "$BASE/HoC-GE2024-results-by-constituency.csv"
curl -sSLO "$BASE/HoC-GE2024-results-by-candidate.csv"
mv HoC-GE2024-results-by-constituency.csv constituency.csv
mv HoC-GE2024-results-by-candidate.csv candidate.csv
```

`npm run build:data` asserts the published totals (electorate 48,224,212; valid
votes 28,809,340) and the declared seat count for every party, so an upstream
schema change fails the build instead of producing a plausible-looking wrong map.

## Historical election results

The 2010, 2015, 2017 and 2019 declared results, plus the published 2019 notional
results on 2024 boundaries, come from the [UK Parliament Election Results
service](https://electionresults.parliament.uk/). Its open database snapshot is
committed as `psephology.db` and published under the Open Parliament Licence v3.0.
The copy is sourced from the Parliament-maintained
[`psephology-datasette` repository](https://github.com/ukparliament/psephology-datasette).

Regenerate the normalized source input with:

```bash
python scripts/export-historical-results.py
```

This writes `historical-results.json`. The exporter checks every election has
650 distinct constituency codes, candidate votes sum to the declared valid
votes in every seat, and each geography uses its expected country-specific
boundary-set identifier. The notional 2019 dataset has party aggregates rather
than candidate names; it must remain labelled as modelled data in the UI.
The export also includes Parliament's official population, residential and area
overlap links between the 2010–2019 and 2024 constituency geographies. Those
links describe territorial overlap and are not used to allocate or predict votes.
