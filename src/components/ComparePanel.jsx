import React, { useMemo } from 'react';
import { num } from '../lib/analysis';

export default function ComparePanel({ election, summary, seats, comparison, comparisonSummary, comparisonSeats, onSelectSeat }) {
  const sameBoundaries = election?.boundarySetId === comparison?.boundarySetId;
  const partyRows = useMemo(() => {
    const current = new Map((summary?.parties || []).map((item) => [item.party, item]));
    const other = new Map((comparisonSummary?.parties || []).map((item) => [item.party, item]));
    return [...new Set([...current.keys(), ...other.keys()])]
      .map((party) => ({
        party,
        colour: current.get(party)?.colour || other.get(party)?.colour || '#7A7A7A',
        selected: current.get(party)?.seats || 0,
        comparison: other.get(party)?.seats || 0,
      }))
      .sort((a, b) => b.selected - a.selected || b.comparison - a.comparison);
  }, [summary, comparisonSummary]);
  const changedSeats = useMemo(() => {
    if (!sameBoundaries || !seats || !comparisonSeats) return [];
    const other = new Map(comparisonSeats.map((seat) => [seat.id, seat]));
    return seats.filter((seat) => other.has(seat.id) && other.get(seat.id).partyGroup !== seat.partyGroup)
      .map((seat) => ({ seat, old: other.get(seat.id) }));
  }, [sameBoundaries, seats, comparisonSeats]);

  if (!comparison) return <p className="hint">Choose a comparison election above.</p>;
  if (!comparisonSummary || !comparisonSeats) return <p className="hint">Loading comparison results…</p>;

  return (
    <section className="compare-panel">
      <h2>{election?.label} compared with {comparison.label}</h2>
      {!sameBoundaries ? (
        <p className="boundary-warning">
          These elections use different constituency boundaries. Seat counts and party vote shares are comparable nationally; constituency-by-constituency changes are not.
        </p>
      ) : comparison.isNotional ? (
        <p className="note">{comparison.caveat}</p>
      ) : null}
      <h3 className="sub">Seats won</h3>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead><tr><th>Party</th><th>{election?.year}</th><th>{comparison.year}</th><th>Change</th></tr></thead>
          <tbody>
            {partyRows.map((row) => (
              <tr key={row.party}>
                <th scope="row"><span className="dot" style={{ background: row.colour }} aria-hidden="true" />{row.party}</th>
                <td className="num">{num(row.selected)}</td>
                <td className="num">{num(row.comparison)}</td>
                <td className="num">{row.selected - row.comparison > 0 ? '+' : ''}{num(row.selected - row.comparison)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="sub">National vote share</h3>
      <ul className="vote-deltas">
        {partyRows.slice(0, 8).map((row) => {
          const selected = summary.voteShare.find((item) => item.party === row.party)?.share || 0;
          const previous = comparisonSummary.voteShare.find((item) => item.party === row.party)?.share || 0;
          const delta = selected - previous;
          const points = `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp`;
          return <li key={row.party}><span>{row.party}</span><strong>{points}</strong></li>;
        })}
      </ul>
      {sameBoundaries && (
        <>
          <h3 className="sub">Seats with a different winner · {changedSeats.length}</h3>
          <ul className="changed-seats">
            {changedSeats.slice(0, 20).map(({ seat, old }) => (
              <li key={seat.id}>
                <button type="button" onClick={() => onSelectSeat(seat)}>
                  {seat.name}<span className="muted">{old.partyGroup} → {seat.partyGroup}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
