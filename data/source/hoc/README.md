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
