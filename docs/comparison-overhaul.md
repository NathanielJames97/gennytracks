# Comparison workspace overhaul — 9 October 2026

## Decision and scope

The next overhaul turns election comparison into a complete area-to-seat workflow.
The archive, schema validation and synchronized maps already exist in the working
tree. Build on those changes rather than restart them or add unverified historical
years. Keep static hosting and the existing source contracts.

## Implemented

1. Add a shared comparison analysis module. Match constituency IDs only when
   both descriptors explicitly declare the same boundary set. Calculate party
   vote shares from total votes in each selected area, including party-group
   sources; normalize Eastern/East of England and Yorkshire naming variants.
2. Replace the comparison panel with area controls, party balance, selected versus
   baseline labels, coverage-aware movement summaries, and source links. Missing
   margins and turnout never become zero-valued observations.
3. Expose all matching seats through search, changed-winner filtering, ordering
   by name/margin/turnout movement, and 25-seat pagination. Highlight the same
   filtered seats on both maps while keeping the area totals independent of
   seat search. Dimmed map seats remain clickable for geographic exploration.
4. Save area, changed-winner filter, search and sort in the URL. Make the header
   export the comparison while this view is active. Export matching seat rows
   with filters, source links, result types and geography; for different boundary
   sets export area party totals without fabricated constituency matches.
5. Add visible data-load failures and prevent an earlier request's results being
   shown under a newly selected election. Hide unrelated map-shading controls
   in comparison mode. Use a wider analysis panel and a stacked mobile layout.
6. Normalize equivalent party spellings in a shared pipeline/frontend module, so Liberal Democrat/Liberal Democrats and equivalent NI names do not create false gains. Preserve distinct parties and source names. Focus maps on the selected area and resize them when their layout changes. Guard reciprocal map move events so bounds clamping cannot recurse.
7. Add arithmetic, boundary-safety, CSV, URL, pagination, map-filter, fetch-switch
   and app integration regression tests, plus a repeatable production smoke script.
8. Label comparison choices by boundary compatibility, optionally restrict the
   picker to the current boundary set, and retain the choice in the share URL.
9. Let readers select a regional overview bar to filter the map and seat list;
   preserve the region with party/search state in shared URLs.
10. Add accessible party-share and turnout timelines to same-boundary seat
    history, including notional-result and missing-data labels.
11. Export a citation-ready PNG with both boundary maps, coverage counts and
    every filtered matched seat. Across boundary sets, report area party totals
    without implying seat matches.

## Validation

- Vitest: 8 files, 30 tests pass under bundled Node 24.19.0.
- `node scripts/validate-data.mjs`: seven elections, three boundary sets,
  4,559 seat rows and 1,438 crosswalk links pass schema v1 checks.
- Vite production build passes: approximately 358 kB JS (109 kB gzip).
- Production-browser smoke passes at / and /gennytracks/: 1,300 real map polygons, area and seat filters, downloaded CSV content, shared URL reload, seat navigation, mismatched boundaries and a 390px mobile layout without horizontal overflow. Desktop and mobile screenshots were reviewed.

Run the browser checks after building with:

```powershell
# Use an installed Playwright module, or set GENNY_PLAYWRIGHT_MODULE to a shared
# runtime's absolute playwright/index.mjs path. Chromium or Edge must be available.
node scripts/smoke-comparison.mjs
```

The script serves dist locally at both / and /gennytracks/, checks real map
geometry, filters, CSV and PNG downloads, URL reload, seat navigation,
mismatched boundaries and mobile horizontal overflow, then closes its server
and browser. Set GENNY_SMOKE_SCREENSHOTS to an existing directory to retain
visual evidence. Set GENNY_SMOKE_PNG_MATCHED_PATH and
GENNY_SMOKE_PNG_CROSS_BOUNDARY_PATH to retain both exported PNGs for inspection.

## Next priorities

- Add an explicit comparison-table export if the PNG and CSV outputs prove
  insufficient for the intended reporting workflow.
- Extend place profiles with multiple predecessor navigation. Keep geographic
  overlap separate from vote movement.
- Complete verified 2001-to-2010 overlap evidence and exact 1997 boundary sourcing
  before enlarging the archive. Do not substitute an approximate map silently.
- Keep broader polling backtests as a separate future slice with its own source
  and election-day eligibility requirements.

No deployment or commit is included. The checkout contained substantial existing
uncommitted work before this overhaul; all of it remains in place. Human review
and deployed-host routing checks remain separate from local automation.
