import React from 'react';
import { num } from '../lib/analysis';

export default function SimpleComparePanel({ election, comparison, model, comparisonSeats, error, onOpenDetails }) {
  if (!comparison) return <p className="hint">Choose another election to compare.</p>;
  if (error) return <p role="alert" className="boundary-warning">Comparison data could not be loaded. Choose another election or reload to retry.</p>;
  if (!comparisonSeats) return <p className="hint" role="status">Loading comparison results…</p>;

  const leadingParties = model.parties.filter((row) => row.selected || row.previous).slice(0, 4);

  return (
    <section className="simple-compare" aria-labelledby="simple-compare-heading">
      <p className="eyebrow">Election comparison</p>
      <h2 id="simple-compare-heading">{election.label} and {comparison.label}</h2>
      {model.sameBoundaries ? (
        <p className="simple-compare-context">Both results use the same constituency boundaries.</p>
      ) : (
        <p className="boundary-warning">These elections use different constituency boundaries. Compare overall totals; seat-by-seat changes are not inferred.</p>
      )}

      <div className="simple-compare-facts">
        <div><span>{election.label}</span><strong>{num(model.current.length)}</strong><small>seats</small></div>
        <div><span>{comparison.label}</span><strong>{num(model.previous.length)}</strong><small>seats</small></div>
        {model.sameBoundaries && <div><span>Different winners</span><strong>{num(model.changed)}</strong><small>constituencies</small></div>}
      </div>

      <h3 className="sub">Largest parties</h3>
      <div className="simple-compare-head">
        <span>Party</span><span>{election.label}</span><span>{comparison.label}</span>
      </div>
      <div className="simple-compare-parties">
        {leadingParties.map((party) => (
          <div className="simple-compare-party" key={party.party}>
            <span className="simple-party-dot" style={{ background: party.colour }} aria-hidden="true" />
            <span>{party.party}</span>
            <strong aria-label={`${election.label}: ${num(party.selected)} seats`}>{num(party.selected)}</strong>
            <strong aria-label={`${comparison.label}: ${num(party.previous)} seats`}>{num(party.previous)}</strong>
          </div>
        ))}
      </div>

      <button type="button" className="simple-primary-action" onClick={onOpenDetails}>Show detailed comparison</button>
      <details className="simple-details">
        <summary>Sources and result notes</summary>
        <div>
          {[election, comparison].map((item) => (
            <p key={item.id}><strong>{item.label}:</strong> {item.boundaryLabel || item.boundarySetId}{item.isNotional ? ' · modelled result' : ' · declared result'}{item.caveat ? ` · ${item.caveat}` : ''}</p>
          ))}
          {model.sameBoundaries && <p>Winner changes compare matched seats. They do not measure how votes moved between places.</p>}
        </div>
      </details>
    </section>
  );
}
