import React, { useEffect, useMemo, useState } from 'react';
import {
  calculateScenarioSeatCounts, calculateScenarioShares, compareScenarioSeatCounts,
  isCompleteShareVector, NATIONAL_RAKE_SCENARIO_METHOD, PARTY_SCENARIO_METHOD,
  PARTY_SCENARIO_METHODS, shareVectorTotal, simulatePartyShareScenario,
} from '../lib/multi-party-scenario';
import { num, pct, pp } from '../lib/analysis';

const COUNTRY_SCOPES = ['England', 'Scotland', 'Wales'];

function inScope(seat, geography) {
  if (geography === 'UK') return true;
  const isNI = seat?.country === 'Northern Ireland' || seat?.countryCode === 'NI';
  return geography === 'NI' ? isNI : !isNI;
}

function marginPoints(seat) {
  const candidates = seat?.simulatedCandidates || [];
  if (candidates.length < 2) return null;
  return Math.max(0, (candidates[0].share - candidates[1].share) * 100);
}

function moveSupport(vector, sourceParty, destinationParty, points) {
  const available = Math.max(0, Number(vector?.[sourceParty]) || 0);
  const moved = Math.min(points, available);
  return {
    ...vector,
    [sourceParty]: available - moved,
    [destinationParty]: (Number(vector?.[destinationParty]) || 0) + moved,
  };
}

function transferScenarioInputs(requestedShares, regionalShares, sourceParty, destinationParty, points) {
  const regional = Object.fromEntries(Object.entries(regionalShares || {}).map(([country, shares]) => [
    country, moveSupport(shares, sourceParty, destinationParty, points),
  ]));
  return { requestedShares: moveSupport(requestedShares, sourceParty, destinationParty, points), regionalShares: regional };
}

function seatCounts(seats, geography = 'GB') {
  return calculateScenarioSeatCounts(seats, { geography });
}

function useStoredScenario() {
  const [stored, setStored] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('gennytracks-scenario-saved') || 'null'); }
    catch { return null; }
  });
  const save = (value) => {
    try {
      window.localStorage.setItem('gennytracks-scenario-saved', JSON.stringify(value));
      setStored(value);
      return true;
    } catch { return false; }
  };
  return [stored, save];
}

export default function ScenarioLab({
  election, seats, baseline, regionBaselines = {}, baselineByGeography = {}, scenario, scenarioSeats, onChange, onApply, applied,
  canApplyMap = true, onSelectSeat, scenarioError = '',
}) {
  const [seatQuery, setSeatQuery] = useState('');
  const [region, setRegion] = useState('');
  const [seatFilter, setSeatFilter] = useState('close');
  const [limit, setLimit] = useState(40);
  const [regionalCountry, setRegionalCountry] = useState('England');
  const [sourceParty, setSourceParty] = useState('Labour');
  const [destinationParty, setDestinationParty] = useState('Conservative');
  const [transfer, setTransfer] = useState(4);
  const [savedScenario, saveScenario] = useStoredScenario();
  const method = scenario.method || PARTY_SCENARIO_METHOD;
  const methodInfo = PARTY_SCENARIO_METHODS.find((item) => item.id === method) || PARTY_SCENARIO_METHODS[0];
  const geography = scenario.geography || 'GB';
  const geographyLabel = geography === 'NI' ? 'Northern Ireland' : geography === 'UK' ? 'United Kingdom' : 'Great Britain';
  const baselineShares = baseline?.shares || {};
  const parties = useMemo(() => Object.keys(baselineShares).sort((a, b) => (
    (baselineShares[b] || 0) - (baselineShares[a] || 0) || a.localeCompare(b, 'en-GB')
  )), [baselineShares]);
  useEffect(() => {
    const nextSource = parties.includes(sourceParty) ? sourceParty : (parties[0] || '');
    const nextDestination = parties.includes(destinationParty) && destinationParty !== nextSource
      ? destinationParty : (parties.find((party) => party !== nextSource) || '');
    if (nextSource !== sourceParty) setSourceParty(nextSource);
    if (nextDestination !== destinationParty) setDestinationParty(nextDestination);
  }, [parties, sourceParty, destinationParty]);
  const requestedShares = scenario.requestedShares || baselineShares;
  const shareTotal = shareVectorTotal(requestedShares);
  const shareVectorComplete = isCompleteShareVector(requestedShares, parties);
  const regionalBaseRaw = regionBaselines?.[regionalCountry]?.shares || {};
  const regionalBaseShares = Object.fromEntries(parties.map((party) => [party, Number(regionalBaseRaw[party]) || 0]));
  const regionalRequestedShares = scenario.regionalShares?.[regionalCountry] || regionalBaseShares;
  const regionalEnabled = Boolean(scenario.regionalShares?.[regionalCountry]);
  const regionalComplete = Object.entries(scenario.regionalShares || {}).every(([country, shares]) => COUNTRY_SCOPES.includes(country) && isCompleteShareVector(shares, parties));
  const complete = shareVectorComplete && regionalComplete;
  const scopedSeats = useMemo(() => (seats || []).filter((seat) => inScope(seat, geography)), [seats, geography]);
  const counts = useMemo(() => compareScenarioSeatCounts(scenarioSeats || [], { geography }), [scenarioSeats, geography]);
  const changedSeats = (scenarioSeats || []).filter((seat) => inScope(seat, geography) && seat.scenarioWinnerChanged).length;
  const achieved = useMemo(() => calculateScenarioShares(scenarioSeats || [], { geography }), [scenarioSeats, geography]);
  const regions = useMemo(() => [...new Set(scopedSeats.map((seat) => seat.region).filter(Boolean))].sort(), [scopedSeats]);
  const baselineById = useMemo(() => new Map((seats || []).map((seat) => [seat.id, seat])), [seats]);
  const displayedSeats = useMemo(() => (scenarioSeats || []).filter((seat) => {
    if (!inScope(seat, geography)) return false;
    const gap = marginPoints(seat);
    if (seatFilter === 'close' && (gap === null || gap > 5)) return false;
    if (seatFilter === 'changes' && !seat.scenarioWinnerChanged) return false;
    if (region && seat.region !== region) return false;
    if (seatQuery && ![seat.name, seat.region, seat.partyGroup, seat.scenarioBaselineParty, seat.member]
      .some((value) => String(value || '').toLowerCase().includes(seatQuery.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => (marginPoints(a) ?? Infinity) - (marginPoints(b) ?? Infinity) || a.name.localeCompare(b.name)), [scenarioSeats, geography, seatFilter, region, seatQuery]);
  const maxTransfer = Math.min(10, Math.max(0, Number(requestedShares[sourceParty]) || 0));
  const transferPoints = useMemo(() => Array.from({ length: 6 }, (_, index) => maxTransfer * index / 5), [maxTransfer]);
  const sensitivity = useMemo(() => transferPoints.map((points) => {
    const inputs = transferScenarioInputs(requestedShares, scenario.regionalShares, sourceParty, destinationParty, points);
    try {
      const projection = simulatePartyShareScenario(seats, { ...inputs, baselineShares: baseline, geography, regionalBaselineShares: regionBaselines, method });
      const projectedCount = seatCounts(projection, geography)[destinationParty] || 0;
      return { points, seats: projectedCount, flips: projection.filter((seat) => inScope(seat, geography) && seat.scenarioWinnerChanged).length };
    } catch (error) { return { points, seats: null, flips: null, error: error.message }; }
  }), [transferPoints, requestedShares, sourceParty, destinationParty, seats, baseline, geography, scenario.regionalShares, regionBaselines, method]);
  const transferAtCurrent = useMemo(() => {
    const points = Math.min(transfer, maxTransfer);
    const inputs = transferScenarioInputs(requestedShares, scenario.regionalShares, sourceParty, destinationParty, points);
    try {
      const projection = simulatePartyShareScenario(seats, { ...inputs, baselineShares: baseline, geography, regionalBaselineShares: regionBaselines, method });
      return { inputs: inputs.requestedShares, seats: seatCounts(projection, geography)[destinationParty] || 0, flips: projection.filter((seat) => inScope(seat, geography) && seat.scenarioWinnerChanged).length };
    } catch (error) { return { inputs: inputs.requestedShares, seats: null, flips: null, error: error.message }; }
  }, [requestedShares, sourceParty, destinationParty, transfer, maxTransfer, seats, baseline, geography, scenario.regionalShares, regionBaselines, method]);
  const savedCompatible = savedScenario?.geography === geography;
  const savedBaseline = baselineByGeography?.[geography] || baseline;
  const savedProjection = useMemo(() => savedCompatible && savedScenario?.requestedShares
    ? (() => {
      try {
        return simulatePartyShareScenario(seats, { requestedShares: savedScenario.requestedShares, baselineShares: savedBaseline, geography, regionalShares: savedScenario.regionalShares || {}, regionalBaselineShares: regionBaselines, method: savedScenario.method || PARTY_SCENARIO_METHOD });
      } catch { return null; }
    })()
    : null, [savedCompatible, savedScenario, seats, savedBaseline, geography, regionBaselines]);
  const savedChanges = useMemo(() => savedProjection?.filter((seat) => (
    seat.projectedParty !== (baselineById.get(seat.id)?.partyGroup)
  )).length || 0, [savedProjection, baselineById, geography]);
  const savedCount = savedProjection ? seatCounts(savedProjection, geography) : null;
  const savedComparisonRows = savedCount ? [...new Set([...counts.map((row) => row.party), ...Object.keys(savedCount)])]
    .sort((a, b) => a.localeCompare(b, 'en-GB'))
    .map((party) => ({ party, current: counts.find((row) => row.party === party)?.projected || 0, saved: savedCount[party] || 0 }))
    : null;

  const setShare = (party, value) => {
    onChange({
      ...scenario,
      method,
      geography,
      baselineElection: { id: '2024', label: '2024 general election' },
      requestedShares: { ...requestedShares, [party]: value === '' ? '' : Number(value) },
      source: scenario.source || { kind: 'manual', id: 'manual', label: 'Manual scenario' },
      assumptions: scenario.assumptions || [
        'National share changes are applied as equal percentage-point deltas wherever each party stood.',
        'Local shares are clipped at zero and rescaled across declared candidates; no candidate entrants, tactical shifts, turnout changes or local evidence are modelled.',
        'Northern Ireland is held at baseline and excluded from this GB scenario.',
      ],
    });
  };
  const saveCurrent = () => saveScenario({ method: scenario.method || 'uniform-party-delta-v1', geography, requestedShares, regionalShares: scenario.regionalShares || {}, savedAt: new Date().toISOString(), source: scenario.source || { kind: 'manual', label: 'Manual scenario' }, assumptions: scenario.assumptions || [] });
  const changeGeography = (next) => onChange({ ...scenario, method, geography: next, requestedShares: null, regionalShares: {}, source: { kind: 'manual', id: 'baseline-' + next, label: '2024 ' + next + ' baseline' }, assumptions: ['Seats outside the selected geography stay at the 2024 baseline.'] });
  const toggleRegional = () => {
    const regionalShares = { ...(scenario.regionalShares || {}) };
    if (regionalEnabled) delete regionalShares[regionalCountry]; else regionalShares[regionalCountry] = { ...regionalBaseShares };
    onChange({ ...scenario, geography: 'GB', regionalShares, source: scenario.source?.kind === 'poll' ? { ...scenario.source, kind: 'poll+manual-regional' } : { kind: 'manual', id: 'manual-regional', label: 'Manual country assumptions' }, assumptions: ['Manual country-specific overrides use that country’s own 2024 baseline. No sourced regional polling series is included.'] });
  };
  const setRegionalShare = (party, value) => onChange({ ...scenario, geography: 'GB', regionalShares: { ...(scenario.regionalShares || {}), [regionalCountry]: { ...regionalRequestedShares, [party]: value === '' ? '' : Number(value) } }, source: scenario.source?.kind === 'poll' ? { ...scenario.source, kind: 'poll+manual-regional' } : { kind: 'manual', id: 'manual-regional', label: 'Manual country assumptions' }, assumptions: scenario.assumptions?.length ? scenario.assumptions : ['Manual country-specific overrides use that country’s own 2024 baseline. No sourced regional polling series is included.'] });

  const chartWidth = 310;
  const chartHeight = 96;
  const chartMax = Math.max(1, ...sensitivity.map((row) => row.seats));
  let chartConnected = false;
  const chartPath = sensitivity.map((row, index) => {
    if (row.seats === null) { chartConnected = false; return ''; }
    const x = sensitivity.length <= 1 ? 0 : index * chartWidth / (sensitivity.length - 1);
    const y = chartHeight - (row.seats / chartMax) * (chartHeight - 12) - 4;
    const command = chartConnected ? 'L' : 'M';
    chartConnected = true;
    return command + x + ' ' + y;
  }).filter(Boolean).join(' ');

  if (!baseline || !seats?.length) return <p className="hint" role="status">Loading the 2024 constituency baseline…</p>;

  return (
    <section className="scenario-lab">
      <p className="comparison-eyebrow">2024 constituency scenario workspace</p>
      <h2>Multi-party support and seats</h2>
      <p className="note">{methodInfo.description} This is a transparent allocation illustration, not a forecast.</p>
      {election?.id !== '2024' && <p className="boundary-warning">The workspace uses 2024 constituencies. Change the election selector to 2024 before applying this projection to the map.</p>}
      {scenario.source?.kind?.includes('poll') && <p className="scenario-source">Input: <a href={scenario.source.url} target="_blank" rel="noreferrer">{scenario.source.label || 'Polling snapshot'}</a> · {scenario.source.date}</p>}
      <label className="scenario-method-control">Allocation method<select aria-label="Allocation method" value={method} onChange={(event) => onChange({ ...scenario, method: event.target.value, assumptions: [] })}>{PARTY_SCENARIO_METHODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="scenario-scope-control">Scenario scope<select value={geography} onChange={(event) => changeGeography(event.target.value)}><option value="GB">Great Britain · 632 seats</option><option value="NI">Northern Ireland · 18 seats</option><option value="UK">United Kingdom · 650 seats</option></select></label>
      {scenarioError && <p className="scenario-model-error" role="alert">{scenarioError} The current inputs have no calibrated projection; change the party shares or use the uniform-change method.</p>}
      <div className="scenario-summary-grid">
        <div><strong>{num(scopedSeats.length)}</strong><span>{geographyLabel} seats</span></div>
        <div><strong>{scenarioError ? '—' : num(changedSeats)}</strong><span>projected winner changes</span></div>
        <div><strong>{scenarioError ? '—' : num((counts.find((row) => row.party === 'Labour') || {}).projected || 0)}</strong><span>projected Labour seats</span></div>
        <div><strong>{complete ? shareTotal.toFixed(1) + '%' : 'Incomplete'}</strong><span>requested share total</span></div>
      </div>
      <div className="scenario-input-header">
        <h3 className="sub">{geographyLabel} vote-share inputs</h3>
        <button type="button" className="link" onClick={() => onChange({
          ...scenario, requestedShares: { ...baselineShares }, source: { kind: 'manual', id: 'baseline', label: '2024 baseline shares' }, assumptions: [],
        })}>Reset to 2024</button>
      </div>
      <p className="note">Baseline shares use 2024 valid votes in {geographyLabel}. All listed parties remain editable; enter the full vector, including smaller parties.</p>
      <div className="scenario-share-table-wrap">
        <table className="scenario-share-table">
          <caption className="sr-only">2024 baseline, requested and achieved national vote shares, and projected seat changes</caption>
          <thead><tr><th scope="col">Party</th><th scope="col">2024 base</th><th scope="col">Input</th><th scope="col">Input ± pp</th><th scope="col">Achieved</th><th scope="col">Seats ±</th></tr></thead>
          <tbody>{parties.map((party) => {
            const row = counts.find((item) => item.party === party) || { baseline: 0, projected: 0, change: 0 };
            const actual = achieved.shares[party];
            return <tr key={party}>
              <th scope="row">{party}</th>
              <td className="num">{pct((baselineShares[party] || 0) / 100)}</td>
              <td><label className="sr-only" htmlFor={'share-' + party}>Requested share for {party}</label><div className="share-input-wrap"><input id={'share-' + party} type="number" min="0" max="100" step="0.1" value={requestedShares[party] ?? ''} onChange={(event) => setShare(party, event.target.value)} /><span>%</span></div></td>
              <td className="num">{pp(((Number(requestedShares[party]) || 0) - (baselineShares[party] || 0)) / 100, 1)} pp</td>
              <td className="num">{Number.isFinite(actual) ? actual.toFixed(1) + '%' : '—'}</td>
              <td className="num">{scenarioError ? '—' : <>{row.change > 0 ? '+' : ''}{num(row.change)}</>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p className={complete ? 'share-total valid' : 'share-total invalid'} role="status">Input total: {shareTotal.toFixed(1)}% {complete ? '· sums to 100%' : '· adjust inputs to sum to 100% before applying'}</p>
      <button type="button" className="primary-action" disabled={!complete || !canApplyMap || Boolean(scenarioError)} onClick={() => onApply(!applied)}>
        {applied ? 'Remove scenario from map' : 'Show scenario on map'}
      </button>
      {applied && <p className="note">Projected winners are shaded on the 2024 map for {geographyLabel}; seats outside the selected scope stay at baseline.</p>}
      {geography === 'GB' && <details className="regional-assumption"><summary>Optional England, Scotland and Wales share overrides</summary>
        <p className="note">Manual assumptions only. Each override uses its own 2024 baseline; countries without an override use the GB input vector. Under calibrated allocation, country targets and the GB total must both fit the declared slates. No sourced regional polling series is included.</p>
        <label className="scenario-control">Country<select value={regionalCountry} onChange={(event) => setRegionalCountry(event.target.value)}>{COUNTRY_SCOPES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <p className="note">{regionalCountry}: {num(regionBaselines?.[regionalCountry]?.validVotes || 0)} valid votes · {num(regionBaselines?.[regionalCountry]?.includedSeats || 0)} seats.</p>
        <button type="button" className="secondary-action" onClick={toggleRegional}>{regionalEnabled ? 'Remove ' + regionalCountry + ' override' : 'Add ' + regionalCountry + ' override'}</button>
        {regionalEnabled && <><p className={regionalComplete ? 'share-total valid' : 'share-total invalid'}>Country input total: {shareVectorTotal(regionalRequestedShares).toFixed(1)}% {regionalComplete ? '· complete' : '· adjust to 100%'}</p>
          <div className="scenario-share-table-wrap"><table className="scenario-share-table"><thead><tr><th>Party</th><th>{regionalCountry} base</th><th>Input</th><th>Change pp</th></tr></thead><tbody>{parties.map((party) => <tr key={party}><th scope="row">{party}</th><td className="num">{pct(regionalBaseShares[party] / 100)}</td><td><label className="sr-only" htmlFor={'regional-' + party}>Requested {regionalCountry} share for {party}</label><div className="share-input-wrap"><input id={'regional-' + party} type="number" min="0" max="100" step="0.1" value={regionalRequestedShares[party] ?? ''} onChange={(event) => setRegionalShare(party, event.target.value)} /><span>%</span></div></td><td className="num">{pp(((Number(regionalRequestedShares[party]) || 0) - regionalBaseShares[party]) / 100, 1)} pp</td></tr>)}</tbody></table></div>
        </>}
      </details>}
      <h3 className="sub">Seat sensitivity · transfer support</h3>
      <p className="note">Move points from one party to another while holding each input vector at 100%. The same transfer is applied to active country overrides, capped by the source party’s share in each vector. This is a sensitivity control, not a probability range.</p>
      <div className="sensitivity-controls">
        <label>From<select value={sourceParty} onChange={(event) => setSourceParty(event.target.value)}>{parties.map((party) => <option key={party}>{party}</option>)}</select></label>
        <span aria-hidden="true">→</span>
        <label>To<select value={destinationParty} onChange={(event) => setDestinationParty(event.target.value)}>{parties.filter((party) => party !== sourceParty).map((party) => <option key={party}>{party}</option>)}</select></label>
      </div>
      {sourceParty === destinationParty && <p className="note">Choose two different parties to compare a transfer.</p>}
      <label className="scenario-control">
        <span>Transfer {Math.min(transfer, maxTransfer).toFixed(1)} points · {destinationParty}: {transferAtCurrent.seats ?? '—'} projected seats · {transferAtCurrent.flips ?? '—'} changed winners</span>
        <input type="range" min="0" max={maxTransfer || 1} step="0.5" disabled={!maxTransfer || sourceParty === destinationParty} value={Math.min(transfer, maxTransfer)} onChange={(event) => setTransfer(Number(event.target.value))} />
      </label>
      <svg className="sensitivity-chart" viewBox={'-8 -8 ' + (chartWidth + 16) + ' ' + (chartHeight + 26)} role="img" aria-label={'Sensitivity of ' + destinationParty + ' seat total as support transfers from ' + sourceParty}>
        <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} />
        <path d={chartPath} />
        {sensitivity.map((row, index) => {
          const x = sensitivity.length <= 1 ? 0 : index * chartWidth / (sensitivity.length - 1);
          const y = row.seats === null ? chartHeight : chartHeight - (row.seats / chartMax) * (chartHeight - 12) - 4;
          return <g key={row.points}>{row.seats === null ? <text x={x} y={y - 4} textAnchor="middle" aria-label="No feasible allocation">×</text> : <circle cx={x} cy={y} r="3" />}<text x={x} y={chartHeight + 15} textAnchor="middle">{row.points.toFixed(0)}</text></g>;
        })}
      </svg>
      <p className="note">Each point reruns the seat allocation against the displayed inputs; the vertical value is projected seats for {destinationParty}.</p>
      <div className="compare-table-wrap sensitivity-table-wrap"><table className="compare-table"><caption className="sr-only">Support transfer sensitivity and projected seat outcomes</caption><thead><tr><th scope="col">Transfer pp</th><th scope="col">{destinationParty} seats</th><th scope="col">Winner changes</th></tr></thead><tbody>{sensitivity.map((row) => <tr key={row.points}><th scope="row">{row.points.toFixed(1)}</th><td className="num">{row.seats === null ? '—' : num(row.seats)}</td><td className="num">{row.flips === null ? '—' : num(row.flips)}</td></tr>)}</tbody></table></div>
      <div className="scenario-save-row">
        <button type="button" className="secondary-action" disabled={!complete} onClick={saveCurrent}>Save comparison</button>
        {savedScenario && savedCompatible && <button type="button" className="link" onClick={() => onChange({ ...scenario, method: savedScenario.method || "uniform-party-delta-v1", geography, requestedShares: savedScenario.requestedShares, regionalShares: savedScenario.regionalShares || {}, source: savedScenario.source, assumptions: savedScenario.assumptions || [] })}>Load saved inputs</button>}
        {savedScenario && !savedCompatible && <span className="note">Saved scenario uses {savedScenario.geography}; switch scope to load.</span>}
        {savedScenario && savedCompatible && <span className="note">Saved: {savedChanges} winner changes · {num(savedCount?.Labour || 0)} Labour seats</span>}
      </div>
      {savedScenario && savedCompatible && <details className="scenario-saved-comparison"><summary>Saved versus current party seat totals</summary>
        <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th scope="col">Party</th><th scope="col">Current</th><th scope="col">Saved</th><th scope="col">Saved − current</th></tr></thead><tbody>{savedComparisonRows.map((row) => <tr key={row.party}><th scope="row">{row.party}</th><td className="num">{num(row.current)}</td><td className="num">{num(row.saved)}</td><td className="num">{row.saved - row.current > 0 ? '+' : ''}{num(row.saved - row.current)}</td></tr>)}</tbody></table></div>
      </details>}
      {savedScenario && <p className="note">The saved vector is stored locally in this browser and is not shared until you copy a scenario link.</p>}
      <h3 className="sub">Close seats and winner changes</h3>
      <div className="scenario-seat-filters">
        <label><span className="sr-only">Search close seats</span><input type="search" placeholder="Search constituency, party or region" value={seatQuery} onChange={(event) => { setSeatQuery(event.target.value); setLimit(40); }} /></label>
        <label><span className="sr-only">Filter seats</span><select value={seatFilter} onChange={(event) => { setSeatFilter(event.target.value); setLimit(40); }}><option value="close">Within 5 pp</option><option value="changes">Winner changes</option><option value="all">All {geographyLabel} seats</option></select></label>
        <label><span className="sr-only">Filter region</span><select value={region} onChange={(event) => { setRegion(event.target.value); setLimit(40); }}><option value="">All areas</option>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <p className="count" role="status">{scenarioError ? 'Projection unavailable for these inputs.' : displayedSeats.length + ' seats match · ordered by projected winning gap'}</p>
      <ul className="scenario-seat-list">{displayedSeats.slice(0, limit).map((seat) => {
        const base = baselineById.get(seat.id);
        const candidates = seat.simulatedCandidates || [];
        return <li key={seat.id}><button type="button" onClick={() => onSelectSeat?.(seat)}>
          <strong>{seat.name}</strong>
          <span>{base?.partyGroup} → {seat.projectedParty}</span>
          <small>{candidates[0]?.name || candidates[0]?.party || 'Candidate'} leads by {marginPoints(seat)?.toFixed(2) ?? '—'} pp · baseline margin {num(base?.majority)} votes</small>
        </button></li>;
      })}</ul>
      {displayedSeats.length > limit && <button type="button" className="secondary-action" onClick={() => setLimit((value) => value + 40)}>Show 40 more</button>}
      <details className="scenario-method">
        <summary>Method, boundaries and assumptions</summary>
        {method === NATIONAL_RAKE_SCENARIO_METHOD
          ? <p>Method: national-rake-v1 alternately scales seat-level party shares to the requested vote-weighted totals while keeping each constituency’s valid-vote total fixed. Structural zeros follow the selected election’s declared candidate slate; a party can receive support only where it had a candidate. A maximum-flow feasibility check rejects targets that the ballot eligibility pattern cannot satisfy. Where a party had a candidate but received no baseline votes, calibration uses a one-vote seed; this is a numerical prior, not evidence of local support. Active country overrides are fitted to their country vectors and the remaining seats are fitted to the residual GB party targets. The exact zero-change case preserves declared winners, shares and margins.</p>
          : <p>Method: additive uniform party percentage-point deltas from the selected geography’s 2024 party shares, applied only where that party had a declared candidate. A GB country override uses that country’s own 2024 shares. Within-seat shares are clipped at zero and rescaled to 100; same-party candidate shares retain their observed proportions; exact projected ties follow source candidate order. A zero-change vector exactly preserves the declared winners, winner shares and margins.</p>}
        <p>Geography: {geographyLabel}. Seats outside the selected scope remain at their 2024 result. GB, NI and UK can be explored separately; country-specific input vectors are manual assumptions.</p>
        <p>Neither method models new candidates, turnout, tactical voting, local campaigns, transfers, incumbency or uncertainty. Uniform-change results can differ from requested shares because party slates vary and seats are rescaled. Calibrated targets may be infeasible when a party lacks candidates in the required seats.</p>
        {scenario.assumptions?.map((assumption) => <p key={assumption}>{assumption}</p>)}
        <p>Baseline source: {election?.sourceUrl ? <a href={election.sourceUrl} target="_blank" rel="noreferrer">{election.sourceName}</a> : '2024 constituency result data'}.</p>
      </details>
    </section>
  );
}
