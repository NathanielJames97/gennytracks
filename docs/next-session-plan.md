# Next session: migrate the frontend build to Vite

## Goal

Replace Create React App with Vite while preserving the current election explorer, its data pipeline, and deployment under both a site root and a project subpath.

## Starting point

Start from the election-history explorer commit. Read `README.md`, `docs/moonshot-roadmap.md`, and `docs/data-provenance.md` before changing the build setup.

## Work sequence

1. Record the existing build and runtime contract: generated data locations, public asset paths, map assets, environment variables, and deployment base paths.
2. Add Vite configuration and migrate the HTML entry point, package scripts, dependencies, and lockfile.
3. Preserve root and relative subpath hosting. Replace Create React App path conventions such as `process.env.PUBLIC_URL` with Vite equivalents and verify all data, icon, and map asset URLs.
4. Move the existing Jest and React Testing Library coverage to Vitest. Keep the current mocks and assertions meaningful; do not reduce coverage to make the migration pass.
5. Remove `react-scripts` and other CRA-only dependencies after the new build and test paths work.
6. Build and preview from both `/` and a non-root path. Smoke-test the election selector, notional 2019 comparison, constituency history, swing scenario, shareable URL, and CSV export.

## Acceptance checks

- `npm run build:data`, `npm test`, and `npm run build` complete successfully.
- The generated election data is unchanged by the frontend tooling migration.
- The production bundle loads correctly at the site root and beneath a project subpath, including JSON data and map geometry.
- The existing six automated tests remain effective, with suitable additions for path handling if needed.
- CRA dependencies and CRA-specific build warnings are gone.
- Record any checks that require a deployed site or a human browser session separately from local build evidence.

## Out of scope

- Adding election years before 2010.
- Adding new census datasets.
- Building a synchronized two-map comparison mode.

## Handover

Update this plan and `docs/moonshot-roadmap.md` with completed work, validation evidence, and any newly discovered constraints before ending the session.
