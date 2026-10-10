# Sol handoff: multi-party scenarios, polling and backtests

Date: 9 October 2026  
Workspace: `D:/LeccyTrack/gennytracks`  
Purpose: continue the modelling and evidence review without losing this checkout’s unpublished work.

## Checkout and availability

- Branch: `master`; local HEAD: `daef06de59b069aefe497d0f0d699dcba63b2a50` (`Build election explorer with Vite`).
- `master` is one commit ahead of `origin/master`, and the working tree has extensive uncommitted changes. The scenario, polling, backtest, historical-data, data-schema and comparison changes described here are local; they are not available from GitHub’s `origin/master`.
- The implementation depends on the current working tree, including its unpublished generated election bundles, data pipeline/schema, comparison UI and app integration. Continue in this checkout or deliberately transfer the whole required state; do not start from the remote commit and assume the files exist there.
- No commit, push, deployment, issue, or live-data refresh was made. Preserve all unrelated existing edits.

## Requested work implemented

1. **Scenario correctness:** candidate identity remains separate from party totals, including separate independent candidates. Zero change preserves all 650 declared 2024 winners, winner shares and margins. The regression runs against both allocation methods.
2. **Multi-party workspace:** complete GB, NI and UK 2024 share vectors; requested and achieved shares; seat gains/losses; close-seat search, region filters and candidate detail; map projection; saved scenario comparison; structured links and CSV export.
3. **Support sensitivity:** transfer points between two parties while keeping vectors complete; show seat totals and winner changes along the curve. It is labelled as assumption sensitivity, not probability.
4. **Polling:** static dated chart and source table, geography/date/pollster filters, MRP and unverified-geography exclusions, and an equal-weight descriptive average of each pollster’s latest verified non-MRP poll in the selected window. A compatible GB poll or average can populate scenario inputs with completion assumptions recorded.
5. **Backtests:** both allocation methods across 2010→2015, 2015→2017, 2017→2019 and 2019 notional on 2024 boundaries→2024. Four fixed-date Ipsos final polls (2015, 2017, 2019, 2024) run separately as polling-to-seat checks.

## Allocation methods and assumptions

| Version | Contract |
| --- | --- |
| `uniform-party-delta-v1` | Default. Apply each party’s national share change as the same percentage-point change in constituencies where it had a candidate; clip below zero and rescale each seat. Requested and achieved totals can differ. |
| `national-rake-v1` | Alternative. Keep each seat’s valid-vote total fixed and fit vote-weighted party totals to within 0.01 percentage points of the request. A maximum-flow check rejects margins that the declared candidate slate cannot support; iterative non-convergence is also reported instead of hiding a miss. |

Both methods preserve ballot eligibility and add no candidates. The calibrated method gives a declared candidate with zero baseline votes a one-vote numerical seed. Country overrides are fitted alongside residual GB targets; incompatible combinations are rejected. Seats outside the selected geography remain at baseline. NI, GB and UK use separate denominators.

**Known infeasible case:** The Ipsos 2024 poll-to-seat backtest applies its rounded final poll vector, including its combined SNP/Plaid category and completed Other share, to the **2019 notional result on 2024 boundaries**, the prior same-boundary baseline. That ballot slate cannot meet the requested margins: `national-rake-v1` reports an eligibility shortfall of **101,298 votes** and withholds that backtest score. This is specific to that prior-result candidate slate. Applying the same completed vector to the 2024 result slate in the interactive scenario workspace is feasible. Uniform-change also remains available for the prior-baseline backtest. Do not silently alter the poll vector to force a score.

Poll conversion notes are in `public/data/polls.json` and shown in the UI. Ipsos 2015 reports Other only as `<0.5%`, with no point estimate; 2017 listed values sum to 99% after rounding; the 2019 Brexit Party share has no 2017 baseline candidate category; the 2024 poll sums to 101% after rounding and groups SNP/Plaid. The code retains each qualification and reports the completion assumptions.

## Evaluation limits

- All four allocation-only election pairs run for both methods. These tests use the target election’s eventual national shares and contain hindsight.
- Seven of the eight poll/method combinations produce scores. Three calibrated poll checks (2015, 2017, 2019) succeed; the 2024 calibrated poll check is infeasible on the 2019-notional prior baseline, as described above. All four uniform-change poll checks succeed. The same poll vector is feasible against the 2024 result slate in the live scenario workspace.
- Poll cutoffs are one final snapshot per election, all from Ipsos. This is a useful implementation check, not broad evidence of forecast accuracy. The suite does not estimate uncertainty, and seat sensitivity is not a probability.
- The formal plan’s regional evidence/external-model stage remains partial: country share overrides are manual; no verified regional polling series or imported constituency MRP layer is included.

## Main files

- `src/lib/scenario.js`, `src/lib/share.js`: repaired earlier scenario arithmetic, legacy/share URL handling and CSV metadata.
- `src/lib/multi-party-scenario.js`: versioned additive and nationally calibrated methods, candidate eligibility, separate geographies, regional constraints and feasibility checks.
- `src/components/ScenarioLab.jsx`, `src/App.jsx`, `src/components/SeatPanel.jsx`, `src/App.css`: inputs, summaries, sensitivity, map/detail/link/export integration and infeasibility UI.
- `src/lib/polling.js`, `src/components/PollingPanel.jsx`, `public/data/polls.json`: polling contract, average, source display and curated snapshot.
- `src/lib/backtest.js`, `src/components/BacktestPanel.jsx`: metrics and side-by-side retrospective comparisons.
- `src/lib/*.test.js`: scenario arithmetic, zero-change behavior, link/export metadata, source conversion, feasibility and historical method coverage.
- `README.md`, `docs/polling-and-seat-analysis-plan.md`: operating guide and authoritative progress/limitations.

## Validation performed

- Full suite: 13 files, 67 tests passed.
- Data validation: 7 elections, 3 boundary sets, 4,559 seat rows and 1,438 links passed `scripts/validate-data.mjs`.
- Production bundle: Vite 8.3.4, Node 24.19.0, 81 modules transformed. Vite was invoked directly. `npm run build` was not run because it also regenerates election and photo output directories.
- Dev-server browser journey from `http://127.0.0.1:5175/`: choose calibrated method, change a balanced share pair, apply map, export CSV and confirm the method version, open a constituency detail, view historical poll rows, and verify no page errors.
- Production-preview browser journey from `http://127.0.0.1:5176/`: zero-change scenario under both methods; all eight dated poll rows; the 2024 Ipsos poll imported and calibrated successfully against the 2024 result slate; all eight backtest groups, including the expected 101,298-vote warning only on the 2019-notional prior baseline; and a 390px mobile viewport with no horizontal overflow. No page errors.
- Existing production comparison smoke passed at `/` and `/gennytracks/` for map rendering, filtering/search, CSV, URL round-trip, seat navigation, incompatible boundaries and mobile layout.
- Both temporary Vite servers were stopped. No deployed evidence is claimed.

## Suggested next work for Sol

1. Review the national-rake contract and the reported 2024 poll infeasibility on the 2019-notional prior baseline. Keep requested, completed and achieved figures distinguishable if proposing any constrained adjustment.
2. Independently inspect the 2024 poll party mapping and 2019-notional candidate slate to explain the 101,298-vote shortfall party-by-party. Decide whether one-vote seeding and 0.01 pp convergence tolerance are suitable product assumptions.
3. Broaden fixed-cutoff tests across more dates and pollsters only after source rows, poll bases, categories, geography and reuse terms are verified. Keep poll-to-seat results separate from hindsight allocation checks.
4. If Stage 4 is in scope, propose a sourced regional-poll series and a separately attributed MRP evidence layer with verified boundary matching. Do not label national-share calibration as MRP.
5. Review the intentional diff against the user’s other unpublished edits, update this handoff and the plan, and keep publication/deployment separate.

### Ready-to-send prompt

Continue the GennyTracks polling and seat-analysis work in `D:/LeccyTrack/gennytracks`. Read `README.md`, `docs/polling-and-seat-analysis-plan.md`, and this handoff first. The current implementation is local to branch `master` at `daef06de59b069aefe497d0f0d699dcba63b2a50` plus extensive uncommitted work; preserve it and do not assume GitHub has these files. Review `uniform-party-delta-v1` and `national-rake-v1`, especially why the Ipsos 2024 poll is infeasible on the 2019-notional prior baseline (101,298-vote eligibility shortfall) but feasible on the 2024 result slate used in the interactive scenario workspace. Keep candidate identity, exact zero-change behavior, requested-versus-achieved shares, source assumptions and poll-versus-allocation backtests transparent. Expand the evidence only with verified sources. Report findings, tests and remaining limitations separately; do not commit, push, publish or deploy.
