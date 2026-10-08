import React, { useMemo } from 'react';
import { num, pct } from '../lib/analysis';

export default function HistoryPanel({ seat, election, elections, resultSets, crosswalk, onSelectElection, onSelectPlace }) {
  const history = useMemo(() => {
    if (!seat) return [];
    return elections.map((item, index) => {
      if (item.boundarySetId !== election?.boundarySetId) return null;
      const match = resultSets[index]?.find((record) => record.id === seat.id);
      return match ? { election: item, seat: match } : null;
    }).filter(Boolean);
  }, [seat, election, elections, resultSets]);
  const overlaps = useMemo(() => {
    if (!seat || !crosswalk?.length) return [];
    if (election?.boundarySetId === '2024') {
      return crosswalk.filter((row) => row.toCode === seat.id)
        .sort((a, b) => b.toPopulationShare - a.toPopulationShare)
        .map((row) => ({ ...row, linkedCode: row.fromCode, linkedName: row.fromName, share: row.toPopulationShare, linkedElection: '2019' }));
    }
    return crosswalk.filter((row) => row.fromCode === seat.id)
      .sort((a, b) => b.fromPopulationShare - a.fromPopulationShare)
      .map((row) => ({ ...row, linkedCode: row.toCode, linkedName: row.toName, share: row.fromPopulationShare, linkedElection: '2024' }));
  }, [seat, election, crosswalk]);

  if (!seat) return <p className="hint">Choose a constituency to trace its results through elections.</p>;

  return (
    <section className="history-panel">
      <h2>{seat.name}</h2>
      <p className="note">Results below use the same constituency boundary set as the selected map.</p>
      {history.length > 1 ? (
        <ol className="history-timeline">
          {history.map(({ election: item, seat: result }) => (
            <li key={item.id}>
              <button type="button" onClick={() => onSelectElection(item.id)}>
                <span className="history-year">{item.label}</span>
                <span className="dot" style={{ background: result.colour }} aria-hidden="true" />
                <span className="history-winner">
                  {result.member ? `${result.member} · ${result.partyGroup}` : `${result.partyGroup} party estimate`}
                </span>
                <span className="history-meta">{pct(result.winnerShare, 1)} · majority {num(result.majority)}</span>
                {item.isNotional && <span className="badge">Notional</span>}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">No other results on this boundary set are available for this constituency.</p>
      )}
      {overlaps.length > 0 && (
        <>
          <h3 className="sub">Across the 2024 boundary review</h3>
          <p className="note">Official population overlap links the old and new seat maps. These shares describe geography, not how votes transferred.</p>
          <ul className="place-overlaps">
            {overlaps.slice(0, 8).map((row) => (
              <li key={row.linkedCode}>
                <button type="button" onClick={() => onSelectPlace(row.linkedCode, row.linkedElection)}>
                  <span>{row.linkedName}</span>
                  <strong>{(row.share * 100).toFixed(1)}% overlap</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {election?.boundarySetId === '2024' ? (
        <p className="note muted">The earlier actual results used older boundaries. The 2019 notional line is the published same-boundary bridge to 2024.</p>
      ) : (
        <p className="note muted">The 2024 boundary review changed constituency geography. Use the election selector to explore later maps; seat names and borders may have changed.</p>
      )}
    </section>
  );
}
