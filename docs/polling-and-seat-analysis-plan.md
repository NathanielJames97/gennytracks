# Polling trends and seat scenarios

Assessment: 9 October 2026. User-selected priority: polling trends and seat
scenarios. This document began as a proposal; current implementation status is
recorded at the end.

## Product outcome

A reader should be able to inspect polling evidence, turn explicit assumptions
into a seat scenario, explore the constituencies driving the result, and reproduce
the analysis through a link or export.

**Inspect polls → choose vote shares → compare seats with 2024 → inspect close
contests → vary assumptions → share the evidence.**

Keep the existing election atlas and comparison workspace. The React, Vite,
static JSON and Leaflet approach can support this expansion. Polling snapshots
can be refreshed at build time; a backend is not a prerequisite.

## Baseline observed before this implementation

The working tree has seven election views, boundary-aware comparison,
constituency history, URL state and CSV export. ScenarioLab currently offers
one party's share shift, a seat tally and projection on the map. No polling
contract, dataset or trend view was found in the inspected source.

- The scenario party picker uses constituency winners rather than all parties
  with votes. Workers Party of Britain and Scottish Green Party, for example,
  have 2024 votes but are omitted.
- The model combines candidates by party group, making separate independent
  candidates one contender. A read-only calculation against the generated
  650-seat 2024 data confirmed that a zero-point Labour shift changes Bradford
  West and Birmingham Hall Green and Moseley from Labour to Independent.
- If a target party is absent from a seat, the model reduces other shares without
  adding a target row. A synthetic 55/45 seat with an absent Reform UK target
  and a +15-point shift produces shares totalling 85%.
- Existing URLs store party and shift. Scenario CSV omits those inputs, method
  version, boundary set and source links.
- The model has no explicit polling-geography contract. GB polling needs a GB
  baseline and separate NI handling.

Relevant implementation at assessment time: src/components/ScenarioLab.jsx,
src/lib/scenario.js, src/lib/share.js and src/App.jsx. The discovered independent
candidate and arithmetic issues were repaired in the implementation recorded
below. The existing uncommitted data and application work has been preserved.

## Stage 1: dependable scenario calculations

Before connecting polls:

1. Preserve contender identity for candidate-level results. Party reporting can
   aggregate votes, but separate independent candidates cannot be pooled to
   determine the winner. Preserve historical grouped Other without inventing
   candidates.
2. Define eligibility per seat. Preserve the historical candidate slate by
   default; hypothetical entrants require an explicit assumption. Exclude
   ineligible parties from local allocation and retain shares totalling 100%.
3. Populate controls from reported vote categories using canonical party names.
   Distinct parties stay distinct.
4. Guarantee zero change reproduces declared 2024 winners and shares. Specify
   missing-data, clipping and exact-tie behavior.
5. Export baseline, geography, boundary set, method version, inputs, eligibility
   policy, exclusions and source links.
6. Call the existing control a party vote-share change in percentage points.
   It is not automatically a two-party swing or national vote-share target.

Acceptance: all 650 declared 2024 winners survive zero change; seat shares are
bounded and total 100%; independent identities survive; eligibility is explicit;
links and exports restore the assumptions.

## Stage 2: a useful multi-party workspace

Start with manual inputs and declared 2024 results on 2024 boundaries, making
the scenario method reviewable before selecting a polling feed.

| Reader action | Useful output |
| --- | --- |
| Enter complete GB shares | Input total, baseline shares and requested changes |
| Run a named allocation method | Achieved aggregate shares beside requested shares |
| Compare with 2024 | Seats, gains, losses and party changes |
| Filter by party or region | Searchable seat changes and close contests |
| Open a constituency | Declared versus scenario contender shares and winning gap |
| Transfer support between two parties | Seat sensitivity curve and changing constituencies |
| Compare two saved scenarios | Input, seat-count and winner differences |
| Copy a link or export | Complete assumptions and per-seat results |

Use a wide analysis panel beside the map, following the comparison workspace.
On mobile, put inputs and headline results before the map and seat table. Add a
compact seat-count chart so constituency land area does not determine the visual
importance of a seat.

Define the allocation method explicitly. Share changes with clipping and local
rescaling do not necessarily achieve requested national totals. Show requested
and achieved shares separately. If calibration is added, expose tolerance,
feasibility checks and fixed-contender handling.

Keep NI separate from GB inputs and label unchanged NI outcomes as baseline
assumptions. Define Speaker and independent handling. Respect Scotland/Wales
party eligibility: do not allocate SNP or Plaid support to seats where they do
not stand.

Sensitivity inputs must still total 100%, for example by transferring support
between two parties. Label resulting ranges as assumption sensitivity; they are
not confidence intervals or probabilities of victory.

Acceptance: a complete scenario can be entered, inspected nationally and locally,
compared with 2024 and restored from its link. Exports carry inputs and achieved
outputs. Declared and scenario results remain distinguishable throughout the UI.

## Stage 3: sourced polling trends

Create a separate poll contract: ID, pollster, commissioner, publication date,
fieldwork dates, sample size and voting-intention base where available, mode,
population, geography, question, reported shares, tables URL, methodology version,
retrieval date and redistribution terms.

The [British Polling Council disclosure rules](https://www.britishpollingcouncil.org/rules-of-disclosure/)
provide a basis for metadata on commissioner, interviewing dates and method,
population, sample size and geographic coverage. Check reuse terms separately.

Build poll dots, party trend lines, date/pollster/geography filters and a source
table. Position observations by fieldwork date and expose publication dates.
Keep GB, UK, country and constituency polls distinct. Missing figures are not
zero; retain published rounding and grouped Other.

Begin with a documented descriptive rolling average. Show its window, included
polls, pollster representation and exclusions. More frequent polling does not
itself establish greater reliability. More advanced aggregation is a separate,
evaluated change.

Send one compatible poll or the documented average into the scenario workspace.
Record its snapshot and any completion assumptions for omitted categories. The
current implementation uses the attributed static snapshot described below; it
does not refresh the provider feed automatically.

Acceptance: each observation links to its source; averages and filters are
reproducible; freshness is apparent; revisions and duplicates are handled;
GB polling never uses a UK vote denominator.

## Stage 4: regional assumptions and external models

- Add Scotland, Wales and England inputs where compatible evidence supports them.
  Handle NI through an explicit separate scenario.
- Introduce transfer and turnout assumptions only with defined mechanics.
  Equal turnout changes across parties do not change vote shares.
- Import published constituency estimates as separate evidence layers, matched
  by verified boundary codes and dated model versions.
- Highlight disagreement in winners and margins between methods.

A national-share calculator should not be described as MRP. [YouGov's UK 2024
model FAQ](https://yougov.com/en-gb/articles/49537-faqs-about-yougovs-2024-general-election-mrp-model)
explains the survey relationships and constituency population data used for
multilevel regression and post-stratification.

## Stage 5: historical backtesting

Use same-boundary elections and the published 2019 notional bridge to 2024 where
appropriate. Separate allocation error from polling error:

1. Given eventual national shares, how well does the method reproduce party seat
   totals, constituency winners and local shares?
2. Given only polling available at a fixed pre-election cutoff, how well does the
   whole polling-to-seat workflow perform?

Record party seat errors, winner agreement, local share errors and close-seat
performance. Compare simple methods before adding complexity. Use held-out
outcomes where feasible and retain dated inputs to prevent hindsight leakage.

Add probabilistic intervals only after specifying and evaluating national,
regional and local error. Slider ranges cannot establish win probabilities.

## Implementation status · 9 October 2026

The five requested user-facing steps now have implementation slices in the static application in this working tree. Results and limitations below describe only this local checkout; nothing has been published.

- **Stage 1 — complete:** candidate-level identity is retained, including separate independent candidates; absent parties do not become local candidates; seat allocations are clipped and renormalised; exact zero change preserves declared winners, shares and margins. Structured scenario links and CSV exports retain inputs, geography, method, source and assumptions. Regression coverage includes all 650 2024 seats.
- **Stage 2 — implemented with two methods:** GB, NI and UK scopes; complete 2024 party vectors; requested and achieved shares; baseline and projected seat totals, gains and losses; close-seat search and filters; candidate-level seat inspection; two-party support sensitivity; optional manual England, Scotland and Wales vectors; locally saved current-versus-saved seat comparisons; map projection and scenario export. `uniform-party-delta-v1` remains the default. `national-rake-v1` uses a maximum-flow eligibility check and fits within 0.01 percentage points when the requested margins are feasible; otherwise it reports that no calibrated projection is available. Regional constraints must reconcile with the GB target.
- **Stage 3 — implemented as a static snapshot:** dated observations and pollster/source links, poll metadata, geography and date filters, reported-share trend chart, and an equal-weight descriptive average using each pollster’s latest verified non-MRP poll in the selected window. Missing values remain missing; MRP and other geographies are excluded. A poll or compatible average can populate GB scenario inputs, with completion assumptions recorded. Snapshot date: 9 October 2026. Four official Ipsos final polls (2015, 2017, 2019 and 2024) are also included as fixed-date backtest inputs; they are not a live trend feed.
- **Stage 4 — partial:** country-specific manual inputs and a separate NI scope exist. No constituency MRP estimates or regional polling series are imported. Turnout, tactical voting, candidate entry, incumbency and uncertainty remain outside this allocation illustration.
- **Stage 5 — retrospective comparison implemented, evidence still narrow:** both allocation methods are scored for 2010→2015, 2015→2017, 2017→2019 and 2019 notional on 2024 boundaries→2024. Four fixed-date Ipsos final polls are run from the prior same-boundary baseline: 2015, 2017, 2019 and 2024. The calibrated 2024 poll-to-seat check reports an eligibility shortfall of 101,298 votes against the **2019 notional prior baseline candidate slate**; it does not silently alter that target. The same vector is feasible against the 2024 result slate in the interactive workspace. All four allocation-only tests and three poll-to-seat calibrated tests produce scores. The poll history is one pollster and one final snapshot per election, so it cannot establish general forecast accuracy.

### Decisions and limits to carry forward

The default allocation method is additive uniform percentage-point change from the selected geography’s baseline, applied to parties with declared candidates in a constituency. Local values below zero are clipped, then the seat is rescaled to 100%; candidate shares within a party retain their observed proportions. It is a transparent illustration, not a forecast. Requested national shares may differ from achieved seat-weighted shares.

The alternative `national-rake-v1` keeps each constituency’s valid-vote total fixed and fits party totals to the requested vote-weighted shares within 0.01 percentage points. A max-flow check rejects margins that the declared candidate slate cannot support; an iterative proportional fit can also report non-convergence near a boundary. It seeds candidates with zero baseline votes at one vote so an already-declared contender can receive support. This is a constrained calibration method, not a locally estimated vote model. The requested-versus-achieved table exposes its output. Manual country targets and the GB vector are reconciled together; incompatible combinations are rejected.

GB, NI and UK use separate denominators. Seats outside a selected geography are retained at baseline. England, Scotland and Wales overrides are explicit manual assumptions that use each country’s 2024 baseline; they are not sourced polling estimates. The UK-wide poll chart may contain both GB and UK observations, but averages require an exact geography match.

The static poll file includes a mix of verified and unverified source rows. Unverified rows remain visible with their status and are excluded from geography-specific averages. Only a small number of recent GB observations are individually source-verified in this snapshot. Poll averages are descriptive, equal-weighted, and not a pooled estimate.

The Ipsos 2015 topline lists SNP separately and reports Other only as `<0.5%`; no numeric point estimate is supplied. The 2017 topline’s listed shares total 99% after rounding. The 2019 poll’s Brexit Party was absent from the 2017 baseline slate, so its share is treated as unrepresented remainder during poll completion. The Ipsos 2024 headline categories sum to 101% after rounding and combine SNP/Plaid Cymru. Poll completion normalises that rounded vector to 100%, splits the combined category in proportion to baseline SNP/Plaid shares, and records those assumptions. The calibrated 2024 poll-to-seat backtest is infeasible on the 2019-notional prior baseline slate; the vector is feasible against the 2024 result slate in the interactive workspace. Uniform-change remains available for the backtest. Backtest allocation scores use eventual national shares and therefore include hindsight in their inputs; they must stay separate from poll-to-seat results.

### Validation status

- Full automated suite: 13 files, 67 tests passed, including zero-change retention on all 650 declared 2024 seats for both methods, scenario links/CSV, feasibility rejection, and all four allocation pairs plus eight dated-poll/method combinations. Seven poll/method combinations produce scores; the 2024 Ipsos poll with `national-rake-v1` is the single expected infeasible result.
- Data contracts: `scripts/validate-data.mjs` passed for 7 elections, 3 boundary sets, 4,559 seat rows and 1,438 links across 1 crosswalk.
- Production bundle: Vite 8.3.4 built successfully with Node 24.19.0, 81 modules transformed, by directly invoking `node_modules/vite/bin/vite.js build`. The full `npm run build`/data regeneration step was not run because it recreates generated election and photo output directories.
- Browser evidence: Node 24.19.0 directly launched `node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175` from the normal entry at `http://127.0.0.1:5175/`; the journey changed the method and complete vector, applied a map scenario, exported CSV with `national-rake-v1`, opened a constituency detail, and filtered the polling chart to all dates. The production preview used `node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5176` at `http://127.0.0.1:5176/` and repeated method/input/map/CSV/polling/backtest checks. No page errors occurred; the calibrated 2024 poll backtest warning was shown for its 2019-notional prior baseline, and mobile width 390px had no horizontal overflow. Both temporary servers were stopped after their checks.
- Existing production comparison smoke passed at both `/` and `/gennytracks/`, covering map rendering, area/search filters, CSV, shared URL, seat navigation, incompatible-boundary messaging and mobile layout.
- Git snapshot reviewed: branch `master`, local HEAD `daef06de59b069aefe497d0f0d699dcba63b2a50`, one commit ahead of `origin/master`, with the project’s existing unpublished and current uncommitted changes. No commit, push, deployment or live-data refresh was made.

See [Sol handoff](sol-handoff-multi-party-polling-overhaul.md) for the implementation map, assumptions and next decisions.
