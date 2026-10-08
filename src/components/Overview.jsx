import React from 'react';
import BarChart, { Histogram } from './BarChart';
import { num, pct } from '../lib/analysis';

/**
 * National overview: headline totals, seats against votes, and the seat flows
 * that explain where Labour's majority came from.
 */
export default function Overview({ summary, onSelectParty, activeParty }) {
  if (!summary) return null;
  const { totals, parties, voteShare, swings, regions, majorityBands, memberStats } = summary;

  const seatRows = parties.map((p) => ({
    key: p.party,
    label: p.party,
    value: p.seats,
    colour: p.colour,
  }));

  const voteRows = voteShare
    .filter((p) => p.share >= 0.002)
    .slice(0, 9)
    .map((p) => ({
      key: p.party,
      label: p.party,
      value: p.share,
      colour: p.colour,
    }));

  const flowRows = swings.slice(0, 8).map((s) => ({
    key: `${s.to}<-${s.from}`,
    label: `${s.from} → ${s.to}`,
    value: s.count,
    colour: parties.find((p) => p.party === s.to)?.colour,
  }));

  const regionRows = regions.map((r) => ({
    key: r.region,
    label: r.region,
    value: r.seats,
    colour: r.seats > 50 ? '#2a7f9e' : '#5cc8d7',
  }));

  return (
    <div className="overview">
      <div className="tiles">
        <div className="tile">
          <span className="tile-value">{num(totals.validVotes)}</span>
          <span className="tile-label">votes cast</span>
        </div>
        <div className="tile">
          <span className="tile-value">{pct(totals.turnout)}</span>
          <span className="tile-label">turnout</span>
        </div>
        <div className="tile">
          <span className="tile-value">{num(totals.candidates)}</span>
          <span className="tile-label">candidates</span>
        </div>
        <div className="tile">
          <span className="tile-value">{num(memberStats.reelected)}</span>
          <span className="tile-label">re-elected</span>
        </div>
      </div>

      <h3 className="sub">Seats won</h3>
      <BarChart
        rows={seatRows}
        ariaLabel="Seats won by party"
        formatValue={(v) => num(v)}
        selected={activeParty}
        onSelect={onSelectParty}
      />

      <h3 className="sub">Vote share</h3>
      <p className="note">
        Reform UK took 14.3% of the vote nationwide but only 5 seats; the Liberal
        Democrats took 12.2% and won 72.
      </p>
      <BarChart
        rows={voteRows}
        max={1}
        ariaLabel="Vote share by party"
        formatValue={(v) => pct(v)}
        selected={activeParty}
        onSelect={onSelectParty}
      />

      <h3 className="sub">Where seats changed hands</h3>
      <BarChart
        rows={flowRows}
        ariaLabel="Largest flows of seats between parties"
        formatValue={(v) => `${v} seats`}
      />

      <h3 className="sub">Seats by region</h3>
      <BarChart
        rows={regionRows}
        ariaLabel="Seats by region"
        formatValue={(v) => num(v)}
      />

      <h3 className="sub">How close were the races?</h3>
      <Histogram bands={majorityBands} ariaLabel="Distribution of winning margins" />
      <p className="note">
        {majorityBands[0].seats + majorityBands[1].seats} seats were won by fewer than
        2,000 votes.
      </p>
    </div>
  );
}
