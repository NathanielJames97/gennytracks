/* eslint-disable no-unused-vars */
import React, { useMemo, useState } from 'react';
import CensusPanel from './CensusPanel';
import { num, pct, pp, pctAdaptive } from '../lib/analysis';

/**
 * Detail panel for one seat: the winner, the full result table, and any
 * contextual note carried over from the Wikipedia source.
 */
export default function SeatPanel({ seat, onClose }) {
  const [showAll, setShowAll] = useState(false);

  const candidates = useMemo(() => seat?.candidates ?? [], [seat]);
  const visible = useMemo(
    () => (showAll ? candidates : candidates.filter((c) => c.votes > 0).slice(0, 6)),
    [candidates, showAll],
  );

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
          <img src={`${process.env.PUBLIC_URL || ''}/${seat.photo}`} alt="" loading="lazy" />
        ) : (
          <div className="winner-blank" aria-hidden="true" />
        )}
        <div>
          <strong>{seat.member || 'No member recorded'}</strong>
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

      <h3 className="sub">Candidates</h3>
      <table className="candidates">
        <thead>
          <tr>
            <th scope="col">Candidate</th>
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
                {c.name || '—'}
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

      <CensusPanel seat={seat} />
    </section>
  );
}
