import React, { useMemo } from 'react';
import { simulateUniformSwing } from '../lib/scenario';
import { num } from '../lib/analysis';

export default function ScenarioLab({ election, seats, scenario, onChange, onApply, applied }) {
  const parties = useMemo(() => [...new Set((seats || []).map((seat) => seat.partyGroup))].sort(), [seats]);
  const projectedSeats = useMemo(
    () => simulateUniformSwing(seats, scenario.party, scenario.swing),
    [seats, scenario.party, scenario.swing],
  );
  const counts = useMemo(() => {
    const map = new Map();
    projectedSeats.forEach((seat) => map.set(seat.partyGroup, (map.get(seat.partyGroup) || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [projectedSeats]);
  const flips = projectedSeats.filter((seat, index) => seat.partyGroup !== seats[index]?.partyGroup).length;

  return (
    <section className="scenario-lab">
      <h2>Uniform swing illustration</h2>
      <p className="note">Start from {election?.label} party totals, then shift support uniformly. This is a scenario tool, not a forecast.</p>
      <label className="scenario-control">
        <span>Party gaining or losing support</span>
        <select value={scenario.party} onChange={(event) => onChange({ ...scenario, party: event.target.value })}>
          {parties.map((party) => <option key={party} value={party}>{party}</option>)}
        </select>
      </label>
      <label className="scenario-control">
        <span>Swing: <strong>{scenario.swing > 0 ? '+' : ''}{scenario.swing} points</strong></span>
        <input type="range" min="-15" max="15" step="1" value={scenario.swing} onChange={(event) => onChange({ ...scenario, swing: Number(event.target.value) })} />
        <span className="scenario-range"><span>−15</span><span>0</span><span>+15</span></span>
      </label>
      <div className="scenario-callout">
        <strong>{flips} seats change projected winner</strong>
        <span>{scenario.party} would hold {num(counts.find(([party]) => party === scenario.party)?.[1] || 0)} seats in this illustration.</span>
      </div>
      <button type="button" className="primary-action" onClick={() => onApply(!applied)}>
        {applied ? 'Remove projection from map' : 'Show projection on map'}
      </button>
      {applied && <p className="note">The map now shows projected winners. Return to the Winner view to clear the projection.</p>}
      <h3 className="sub">Projected seats</h3>
      <ol className="scenario-results">
        {counts.map(([party, count]) => <li key={party}><span>{party}</span><strong>{count}</strong></li>)}
      </ol>
      <p className="note muted">The model adjusts party vote shares in every constituency, rescales other parties proportionally and keeps the existing candidate set. It does not account for tactical voting, turnout, candidate effects or local campaigns.</p>
    </section>
  );
}
