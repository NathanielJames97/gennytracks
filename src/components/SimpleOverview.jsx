import React from 'react';
import { num, pct } from '../lib/analysis';

export default function SimpleOverview({
  summary,
  election,
  activeParty,
  onSelectParty,
  onOpenSeats,
  onOpenCompare,
}) {
  if (!summary) return null;

  const totalSeats = summary.total ?? summary.parties.reduce((total, party) => total + party.seats, 0);
  const partyLeaders = summary.parties.slice(0, 3);
  const quickCaveat = election?.isNotional
    ? 'This is a modelled result on 2024 boundaries, not a declared election result.'
    : election?.candidateDataGranularity === 'party-aggregate'
      ? 'This source reports party groups; candidate names and winning margins are unavailable.'
      : null;

  return (
    <section className="simple-overview" aria-labelledby="simple-overview-heading">
      <div className="simple-welcome">
        <div>
          <p className="eyebrow">Explore the result</p>
          <h2 id="simple-overview-heading">{election?.label || election?.year} general election</h2>
        </div>
        <p>Choose an area on the map, or find a constituency by name.</p>
      </div>

      <div className="simple-facts" aria-label="Election facts">
        <div><strong>{num(totalSeats)}</strong><span>seats</span></div>
        <div><strong>{pct(summary.totals.turnout)}</strong><span>turnout</span></div>
        <div><strong>{num(summary.totals.validVotes)}</strong><span>votes cast</span></div>
      </div>

      <div className="simple-party-list" aria-label="Seats won by party">
        {partyLeaders.map((party) => (
          <button
            key={party.party}
            type="button"
            className={activeParty === party.party ? 'simple-party on' : 'simple-party'}
            onClick={() => onSelectParty(party.party)}
            aria-pressed={activeParty === party.party}
            title={`Filter the map to ${party.party} seats`}
          >
            <span className="simple-party-dot" style={{ background: party.colour }} aria-hidden="true" />
            <span>{party.party}</span>
            <strong>{num(party.seats)}</strong>
          </button>
        ))}
      </div>

      <div className="simple-actions">
        <button type="button" className="simple-primary-action" onClick={onOpenSeats}>Find a seat</button>
        <button type="button" className="simple-secondary-action" onClick={onOpenCompare}>Compare elections</button>
      </div>

      {quickCaveat && <p className="simple-caveat">{quickCaveat}</p>}

      <details className="simple-details">
        <summary>Sources and boundary notes</summary>
        <div>
          {election?.sourceName && <p>Source: {election.sourceName}{election.sourceLicense ? ` · ${election.sourceLicense}` : ''}.</p>}
          {election?.sourceUrl && <p><a href={election.sourceUrl} target="_blank" rel="noreferrer">View the original source ↗</a></p>}
          {election?.boundaryLabel && <p>Constituency boundaries: {election.boundaryLabel}.</p>}
          {election?.caveat && <p>{election.caveat}</p>}
          {election?.boundaryCaveat && <p>{election.boundaryCaveat}</p>}
        </div>
      </details>
    </section>
  );
}
