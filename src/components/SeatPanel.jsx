/* eslint-disable no-unused-vars */
import React, { useMemo, useState } from 'react';
import CensusPanel from './CensusPanel';
import { num, pct, pp, pctAdaptive } from '../lib/analysis';

/**
 * Detail panel for one seat: the winner, the full result table, and any
 * contextual note carried over from the Wikipedia source.
 */
export default function SeatPanel({ seat, election, onClose, scenarioSeat = null }) {
  const [showAll, setShowAll] = useState(false);

  const candidates = useMemo(() => seat?.candidates ?? [], [seat]);
  const partyTotals = Boolean(seat?.isNotional || seat?.partyTotals?.length || candidates.every((candidate) => !candidate.name));
  const rows = partyTotals && seat?.partyTotals?.length ? seat.partyTotals : candidates;
  const visible = useMemo(
    () => (showAll ? rows : rows.filter((row) => row.votes > 0).slice(0, 6)),
    [rows, showAll],
  );
  const scenarioCandidates = useMemo(() => scenarioSeat?.simulatedCandidates || [], [scenarioSeat]);
  const hasScenarioDifference = useMemo(() => {
    if (!seat || !scenarioSeat || scenarioSeat.scenarioIsBaseline || scenarioSeat.scenarioHeldAtBaseline || !scenarioCandidates.length) return false;
    if ((scenarioSeat.projectedParty || scenarioSeat.partyGroup) !== seat.partyGroup) return true;
    return scenarioCandidates.some((projected) => {
      const baselineRow = rows[projected.sourceIndex];
      const baselineShare = Number.isFinite(baselineRow?.share) ? baselineRow.share
        : Number(seat.validVotes) > 0 ? Number(baselineRow?.votes || 0) / Number(seat.validVotes) : null;
      return baselineShare !== null && Math.abs(baselineShare - projected.share) > 1e-8;
    });
  }, [seat, scenarioSeat, scenarioCandidates, rows]);

  if (!seat) {
    return (
      <p className="hint">
        Click a constituency on the map to see who won it, or search below.
      </p>
    );
  }

  return (
    <section className="seat" aria-live="polite">
      <button type="button" className="close" onClick={onClose} aria-label="Close seat details">
        ×
      </button>

      <h2>{seat.name}</h2>
      <p className="meta">
        {seat.region}
        {seat.type ? ` · ${seat.type} seat` : ''}
        {seat.gss ? ` · ${seat.gss}` : ''}
      </p>

      <div className="winner">
        {seat.photo ? (
          <img src={`${import.meta.env.BASE_URL}${seat.photo}`} alt="" loading="lazy" />
        ) : (
          <div className="winner-blank" aria-hidden="true" />
        )}
        <div>
          <strong>{seat.isNotional ? 'Notional party estimate' : seat.member || (election?.candidateDataGranularity === 'candidate' ? 'No member recorded' : 'Candidate names unavailable')}</strong>
          <span className="tag" style={{ borderColor: seat.colour, color: seat.colour }}>
            {seat.party}
          </span>
          <span className="result">{seat.result}</span>
          {seat.memberGender && <span className="muted">{seat.memberGender}</span>}
        </div>
      </div>

      <dl className="stats">
        <div>
          <dt>Majority</dt>
          <dd>{num(seat.majority)}</dd>
        </div>
        <div>
          <dt>As % of votes</dt>
          <dd>{pctAdaptive(seat.majorityShare)}</dd>
        </div>
        <div>
          <dt>Winner&rsquo;s share</dt>
          <dd>{pct(seat.winnerShare, 1)}</dd>
        </div>
        <div>
          <dt>Turnout</dt>
          <dd>{pct(seat.turnout, 1)}</dd>
        </div>
        <div>
          <dt>Electorate</dt>
          <dd>{num(seat.electorate)}</dd>
        </div>
        <div>
          <dt>Votes cast</dt>
          <dd>{num(seat.validVotes)}</dd>
        </div>
      </dl>

      {seat.declarationTime && (
        <p className="meta">Declared at {seat.declarationTime}</p>
      )}

      {scenarioSeat && scenarioCandidates.length > 0 && <section className="seat-scenario-result">
        <p className="comparison-eyebrow">Applied 2024 scenario</p>
        <h3>Projected result · {seat.name}</h3>
        <p><span>Declared winner:</span> <strong>{seat.partyGroup}</strong> → <span>Projected winner:</span> <strong>{scenarioSeat.projectedParty || scenarioSeat.partyGroup}</strong>{scenarioCandidates[0]?.name ? ' · ' + scenarioCandidates[0].name : ''}</p>
        <p className="note">Projected winning gap: {pctAdaptive(Math.max(0, (scenarioCandidates[0]?.share || 0) - (scenarioCandidates[1]?.share || 0)))}. {hasScenarioDifference ? 'The declared winner and candidate votes remain below for comparison.' : 'The projected winner matches the declared result.'}</p>
        <div className="compare-table-wrap"><table className="candidates scenario-candidates">
          <thead><tr><th scope="col">Candidate</th><th scope="col">Party</th><th scope="col">2024 votes</th><th scope="col">2024 share</th><th scope="col">Scenario share</th></tr></thead>
          <tbody>{scenarioCandidates.slice(0, 8).map((row) => {
            const base = rows[row.sourceIndex];
            const share = Number.isFinite(base?.share) ? base.share
              : Number(seat.validVotes) > 0 ? Number(base?.votes || 0) / Number(seat.validVotes) : null;
            return <tr key={row.id}><th scope="row">{row.name || row.party}</th><td>{row.party}</td><td className="num">{num(base?.votes)}</td><td className="num">{pctAdaptive(share)}</td><td className="num">{pctAdaptive(row.share)}</td></tr>;
          })}</tbody>
        </table></div>
      </section>}

      <h3 className="sub">{election?.candidateDataGranularity === 'party-aggregate' ? 'Reported party groups' : partyTotals ? 'Party totals' : 'Candidates'}</h3>
      <table className="candidates">
        <thead>
          <tr>
            <th scope="col">{partyTotals ? 'Party' : 'Candidate'}</th>
            <th scope="col">Party</th>
            <th scope="col">Votes</th>
            <th scope="col">Share</th>
            <th scope="col">Swing</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((c, i) => (
            <tr key={`${c.abbrev}-${i}`}>
              <th scope="row">
                {partyTotals ? c.party : c.name || '—'}
                {c.sittingMp && <span className="badge" title="Was an MP before this election"> Sitting</span>}
              </th>
              <td>{c.party}</td>
              <td className="num">{num(c.votes)}</td>
              <td className="num">{pctAdaptive(c.share)}</td>
              <td className="num">{Number.isFinite(c.change) ? pp(c.change, 1) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {candidates.length > 6 && (
        <button type="button" className="link" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${candidates.length} candidates`}
        </button>
      )}

      {seat.notes && <p className="notes">{seat.notes}</p>}

      {seat.memberWiki && (
        <a className="wiki" href={seat.memberWiki} target="_blank" rel="noreferrer">
          Read more on Wikipedia ↗
        </a>
      )}

      {election?.sourceUrl && (
        <p className="note muted">
          Source: <a href={election.sourceUrl} target="_blank" rel="noreferrer">{election.sourceName}</a>
          {' · '}{election.boundaryLabel} · {election.sourceLicense}.
          {election?.caveat ? ' ' + election.caveat : ''}
          {election?.boundaryCaveat ? ' Boundary note: ' + election.boundaryCaveat : ''}
        </p>
      )}

      <CensusPanel seat={seat} />
    </section>
  );
}
