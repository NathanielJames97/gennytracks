import React, { useEffect, useState } from 'react';
import { num, pct, pp } from '../lib/analysis';
import { COMPARISON_SORTS, comparisonAreas, downloadComparisonCsv } from '../lib/comparison';
import { downloadComparisonPng } from '../lib/comparison-png';

export default function ComparePanel({ election, seats, comparison, comparisonSeats, model, pairs,
  filters, onFilters, onSelectSeat, error, boundaries, comparisonBoundaries, boundarySets = [], sources = [] }) {
  const [showAllParties, setShowAllParties] = useState(false);
  const [page, setPage] = useState(0);
  const [exportingPng, setExportingPng] = useState(false);
  const [pngExportStatus, setPngExportStatus] = useState('');
  useEffect(() => setPage(0), [filters, election?.id, comparison?.id]);
  if (!comparison) return <p className="hint">Choose a comparison election above.</p>;
  if (error) return <p role="alert" className="boundary-warning">Comparison data could not be loaded. Choose another election or reload to retry.</p>;
  if (!comparisonSeats) return <p className="hint" role="status">Loading comparison results…</p>;
  const pageCount = Math.max(1, Math.ceil(pairs.length / 25));
  const activePage = Math.min(page, pageCount - 1);
  const mainParties = model.parties.filter((row) => row.selected || row.previous || Math.max(row.selectedShare || 0, row.previousShare || 0) >= .002);
  const displayedParties = showAllParties ? model.parties : mainParties;
  const update = (patch) => onFilters({ ...filters, ...patch });
  const exportPng = async () => {
    setExportingPng(true);
    setPngExportStatus('Preparing comparison PNG…');
    try {
      await downloadComparisonPng({ election, comparison, model, pairs, filters, boundaries,
        comparisonBoundaries, boundarySets, sources });
      setPngExportStatus('Comparison PNG downloaded.');
    } catch (exportError) {
      setPngExportStatus(`PNG export failed: ${exportError?.message || 'unknown error'}`);
    } finally {
      setExportingPng(false);
    }
  };
  return (
    <section className="compare-panel">
      <p className="comparison-eyebrow">Election comparison</p>
      <h2>{election.label} <span className="muted">versus</span> {comparison.label}</h2>
      <p className="note">All changes show {election.label} minus {comparison.label}. Select an area to update totals and both maps.</p>
      <label className="comparison-control">Area
        <select aria-label="Area" value={filters.area} onChange={(event) => update({ area: event.target.value })}>
          <option value="">United Kingdom</option>
          {comparisonAreas(seats, comparisonSeats).map((area) => <option key={area}>{area}</option>)}
        </select>
      </label>
      {!model.sameBoundaries && <p className="boundary-warning">These elections use different constituency boundaries. Area totals can be compared, but no seat-by-seat changes are inferred.</p>}
      {[election, comparison].filter((item) => item.caveat).map((item) => <p className="note" key={item.id}><strong>{item.label}:</strong> {item.caveat}</p>)}
      <div className="compare-metrics">
        <div><strong>{num(model.current.length)}</strong><span>selected seats · {filters.area || 'UK'}</span></div>
        <div><strong>{num(model.previous.length)}</strong><span>baseline seats · {filters.area || 'UK'}</span></div>
        {model.sameBoundaries && <>
          <div><strong>{num(model.changed)}</strong><span>winner changes / {num(model.pairs.length)} matched seats</span></div>
          <div><strong>{model.turnout.value === null ? '—' : `${pp(model.turnout.value)} pp`}</strong><span>mean turnout movement · {model.turnout.count} seats with data</span></div>
        </>}
      </div>
      {model.sameBoundaries && <p className="note">Mean majority movement: {model.majority.value === null ? '—' : `${model.majority.value > 0 ? '+' : ''}${num(Math.round(model.majority.value))} votes`} · {model.majority.count} seats with data.</p>}
      <h3 className="sub">Party balance · {filters.area || 'UK'}</h3>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <caption className="sr-only">Seats and vote-share movement, selected election minus baseline</caption>
          <thead><tr><th scope="col">Party</th><th scope="col" title={election.label}>Selected</th><th scope="col" title={comparison.label}>Baseline</th><th scope="col">Seats ±</th><th scope="col">Vote pp ±</th></tr></thead>
          <tbody>{displayedParties.map((row) => <tr key={row.party}>
            <th scope="row"><span className="dot" style={{ background: row.colour }} aria-hidden="true" />{row.party}</th>
            <td className="num">{num(row.selected)}</td><td className="num">{num(row.previous)}</td>
            <td className="num">{row.selected - row.previous > 0 ? '+' : ''}{num(row.selected - row.previous)}</td>
            <td className="num" title={`${pct(row.previousShare)} → ${pct(row.selectedShare)}`}>{pp(row.shareDelta)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {model.parties.length > mainParties.length && <button type="button" className="link" onClick={() => setShowAllParties(!showAllParties)}>{showAllParties ? 'Show major parties' : `Show all ${model.parties.length} parties`}</button>}
      <p className="note">Vote shares use total party votes divided by valid votes in the selected area. Grouped source categories remain grouped.</p>
      {model.sameBoundaries && <>
        <h3 className="sub">Explore matched seats</h3>
        <div className="comparison-filters">
          <label className="comparison-check"><input type="checkbox" checked={filters.changesOnly} onChange={(event) => update({ changesOnly: event.target.checked })} />Winner changes only</label>
          <label className="search"><span className="sr-only">Search comparison seats or parties</span><input type="search" placeholder="Search seat or either party…" value={filters.query} onChange={(event) => update({ query: event.target.value })} /></label>
          <label className="comparison-control">Order
            <select aria-label="Order" value={filters.sort} onChange={(event) => update({ sort: event.target.value })}>{Object.entries(COMPARISON_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
        </div>
        <p className="count" role="status">{pairs.length} of {model.pairs.length} matched seats · both maps highlight this selection</p>
        <ul className="comparison-seat-results">{pairs.slice(activePage * 25, (activePage + 1) * 25).map((pair) => <li key={pair.current.id}>
          <button type="button" onClick={() => onSelectSeat(pair.current)}>
            <strong>{pair.current.name}</strong>
            <span>{pair.previous.partyGroup} → {pair.current.partyGroup}</span>
            <small>Selected margin {num(pair.current.majority)} · turnout {pp(pair.turnoutDelta)} pp</small>
          </button>
        </li>)}</ul>
        {!pairs.length && <p className="hint">No seats match these filters. Try another area or include unchanged winners.</p>}
        {pageCount > 1 && <nav className="comparison-pagination" aria-label="Comparison seat pages">
          <button type="button" disabled={!activePage} onClick={() => setPage(activePage - 1)}>Previous</button>
          <span>{activePage + 1} / {pageCount}</span>
          <button type="button" disabled={activePage + 1 >= pageCount} onClick={() => setPage(activePage + 1)}>Next</button>
        </nav>}
      </>}
      <button type="button" className="primary-action comparison-export" onClick={() => downloadComparisonCsv(model, pairs, election, comparison, filters)}>
        Export {model.sameBoundaries ? `${pairs.length} matched seats` : 'area party totals'}
      </button>
      <button type="button" className="secondary-action comparison-export-png" disabled={exportingPng} onClick={exportPng}>
        {exportingPng ? 'Preparing PNG…' : 'Export comparison PNG'}
      </button>
      {pngExportStatus && <p className="note" role="status">{pngExportStatus}</p>}
      <p className="note">Includes election types, boundaries, area and source links{model.sameBoundaries ? ', plus the active seat filters' : ''}.</p>
      <details className="comparison-sources"><summary>Sources and boundary sets</summary>{[election, comparison].map((item) => <p key={item.id}><strong>{item.label}</strong><br />{item.boundaryLabel || item.boundarySetId}<br />{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceName || 'Election source'}</a> : 'Source link unavailable'}</p>)}</details>
    </section>
  );
}
