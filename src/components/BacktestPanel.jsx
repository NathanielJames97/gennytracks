import React, { useMemo } from 'react';
import { resultRows } from '../hooks/useData';
import { backtestAllocation, backtestPollToSeats } from '../lib/backtest';
import { PARTY_SCENARIO_METHODS } from '../lib/multi-party-scenario';
import { num } from '../lib/analysis';

const PAIRS = [
  { baseline: '2010', target: '2015', label: '2010 → 2015' },
  { baseline: '2015', target: '2017', label: '2015 → 2017' },
  { baseline: '2017', target: '2019', label: '2017 → 2019' },
  { baseline: '2019-notional-2024', target: '2024', label: '2019 notional → 2024' },
];

function metric(value, digits = 1) {
  return Number.isFinite(value) ? (value * 100).toFixed(digits) + '%' : '—';
}

function makeMethodResults(run) {
  return PARTY_SCENARIO_METHODS.map((method) => {
    try { return { method, result: run(method.id) }; }
    catch (error) { return { method, error: error.message || String(error) }; }
  });
}

function BacktestCard({ result, label, methodLabel, poll = false }) {
  if (!result) return null;
  const { metrics } = result;
  return <article className="backtest-card">
    <div className="backtest-card-title"><div><span className="comparison-eyebrow">{poll ? 'Poll to seat' : 'Allocation only'} · {methodLabel}</span><h3>{label}</h3></div><strong>{num(metrics.matchedSeats)} seats</strong></div>
    <p className="note">{poll
      ? 'Applies this dated national poll to the prior same-boundary result, then scores it against the election result.'
      : 'Uses the target election’s eventual national GB shares. This isolates seat allocation and includes hindsight in the inputs.'}</p>
    <div className="scenario-summary-grid backtest-metrics">
      <div><strong>{metric(metrics.winnerAccuracy)}</strong><span>winner agreement · {num(metrics.winnerCorrect)} seats</span></div>
      <div><strong>{metric(metrics.closeWinnerAccuracy)}</strong><span>actual close seats (≤5 pp) · {num(metrics.closeWinnerCorrect)}/{num(metrics.closeSeats)}</span></div>
      <div><strong>{Number.isFinite(metrics.meanAbsoluteLocalPartyShareError) ? (metrics.meanAbsoluteLocalPartyShareError * 100).toFixed(2) + ' pp' : '—'}</strong><span>mean local party-share absolute error</span></div>
      <div><strong>{Number.isFinite(metrics.meanAbsolutePartySeatError) ? metrics.meanAbsolutePartySeatError.toFixed(1) : '—'}</strong><span>mean absolute seat error per party</span></div>
    </div>
    <p className="note">Total absolute party seat-count error: {num(metrics.totalAbsolutePartySeatError)}. Multiple party errors count separately as seats shift between parties.</p>
    {result.assumptions?.map((assumption) => <p key={assumption} className="note">{assumption}</p>)}
    {poll && <details className="backtest-source"><summary>Poll, source and completion assumptions</summary>
      <p>{result.poll.pollster} · fieldwork {result.poll.fieldworkStart}–{result.poll.fieldworkEnd} · {result.poll.geography} · {num(result.poll.sampleSize)} headline respondents. Shares reported: {Object.entries(result.poll.shares || {}).map(([party, value]) => party + ' ' + value + '%').join(', ')}.</p>
      {result.poll.sourceNote && <p>{result.poll.sourceNote}</p>}
      <p><a href={result.poll.sourceUrl} target="_blank" rel="noreferrer">Pollster release</a>{result.poll.tablesUrl && <> · <a href={result.poll.tablesUrl} target="_blank" rel="noreferrer">Topline tables</a></>}</p>
      {result.scenario.assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}
    </details>}
    <details className="backtest-source"><summary>Party seat-count errors</summary>
      <table className="compare-table"><thead><tr><th scope="col">Party</th><th scope="col">Scenario</th><th scope="col">Actual</th><th scope="col">Error</th></tr></thead>
        <tbody>{metrics.seatCounts.map((row) => <tr key={row.party}><th scope="row">{row.party}</th><td className="num">{num(row.projected)}</td><td className="num">{num(row.actual)}</td><td className="num">{row.error > 0 ? '+' : ''}{num(row.error)}</td></tr>)}</tbody>
      </table>
    </details>
  </article>;
}

function MethodCards({ results, label, poll = false }) {
  return <div className="backtest-method-results">
    {results.map(({ method, result, error }) => error
      ? <p role="alert" className="boundary-warning" key={method.id}>{method.label}: {error}</p>
      : <BacktestCard key={method.id} label={label} methodLabel={method.label} result={result} poll={poll} />)}
  </div>;
}

export default function BacktestPanel({ elections, files, polls }) {
  const pairs = useMemo(() => PAIRS.map((pair) => {
    const baselineElection = elections.find((item) => item.id === pair.baseline);
    const targetElection = elections.find((item) => item.id === pair.target);
    const baseSeats = resultRows(files?.[pair.baseline]);
    const targetSeats = resultRows(files?.[pair.target]);
    if (!baselineElection || !targetElection || !baseSeats || !targetSeats) return { ...pair, loading: true };
    const results = makeMethodResults((method) => backtestAllocation(baseSeats, targetSeats, {
      geography: 'GB',
      baselineElection: { id: baselineElection.id, label: baselineElection.label },
      targetElection: { id: targetElection.id, label: targetElection.label },
      method,
    }));
    return { ...pair, results };
  }), [elections, files]);

  const pollBacktests = useMemo(() => (polls?.polls || []).filter((poll) => poll.backtest).map((poll) => {
    const baselineId = poll.backtest.baselineElectionId;
    const targetId = poll.backtest.targetElectionId;
    const baselineElection = elections.find((item) => item.id === baselineId);
    const targetElection = elections.find((item) => item.id === targetId);
    const baseSeats = resultRows(files?.[baselineId]);
    const targetSeats = resultRows(files?.[targetId]);
    if (!baselineElection || !targetElection || !baseSeats || !targetSeats) return { poll, loading: true };
    const label = poll.pollster + ' final poll · ' + poll.fieldworkStart + '–' + poll.fieldworkEnd + ' → ' + targetElection.label;
    const results = makeMethodResults((method) => backtestPollToSeats(baseSeats, targetSeats, poll, {
      geography: 'GB',
      baselineElection: { id: baselineElection.id, label: baselineElection.label },
      targetElection: { id: targetElection.id, label: targetElection.label },
      method,
    }));
    return { poll, label, results };
  }), [elections, files, polls]);

  const loading = pairs.some((pair) => pair.loading) || pollBacktests.some((pair) => pair.loading);
  const resultElectionIds = ['2010', '2015', '2017', '2019', '2019-notional-2024', '2024'];

  return <section className="backtest-panel">
    <p className="comparison-eyebrow">Retrospective method checks</p>
    <h2>Historical seat backtests</h2>
    <p className="note">Great Britain is scored separately from Northern Ireland. Boundary-matched election pairs are used. Allocation-only tests and dated poll-to-seat tests are kept separate; neither establishes future uncertainty or win probabilities.</p>
    {loading && <p className="hint" role="status">Loading election result bundles…</p>}
    <h3 className="sub">Given eventual national shares · allocation only</h3>
    <p className="note">For each pair, both methods receive the target election’s actual national party shares. Uniform changes may miss those totals after local rescaling; calibrated allocation attempts to match them subject to the candidate slate. These are hindsight tests of allocation, not forecasts.</p>
    <div className="backtest-cards">{pairs.filter((pair) => pair.results).map((pair) => <section className="backtest-election" key={pair.label}>
      <h3 className="sub">{pair.label}</h3>
      <MethodCards results={pair.results} label={pair.label} />
    </section>)}</div>
    <h3 className="sub">Dated final polls · poll-to-seat workflow</h3>
    <p className="note">The Ipsos final-poll snapshots cover four elections from 2015–2024. Each method receives only that dated poll and the prior same-boundary result. The set is small and uses one pollster, so it cannot establish general forecasting accuracy.</p>
    <div className="backtest-cards">{pollBacktests.filter((pair) => pair.results).map((pair) => <section className="backtest-election" key={pair.poll.id}>
      <h3 className="sub">{pair.label}</h3>
      <MethodCards results={pair.results} label={pair.label} poll />
    </section>)}</div>
    <h3 className="sub">Score definitions</h3>
    <ul className="backtest-definitions">
      <li><strong>Winner agreement:</strong> share of matched GB seats where the projected party equals the target result’s winning party.</li>
      <li><strong>Close-seat agreement:</strong> same measure only where the actual winning margin was 5 percentage points or less.</li>
      <li><strong>Local share error:</strong> mean absolute error across party shares in each matched constituency.</li>
      <li><strong>Seat-count error:</strong> average absolute projected-versus-actual seats per party, plus total absolute party error.</li>
    </ul>
    <p className="note">The 2024 notional result supplies the same-boundary baseline for the 2024 election; it is modelled party totals, not a declared election. Source results: {elections.filter((item) => resultElectionIds.includes(item.id)).map((item) => <React.Fragment key={item.id}><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.label}</a> · </React.Fragment>)}</p>
    <p className="note">Both allocation methods keep valid-vote totals fixed and use only candidates from the baseline result. They do not model candidate entry, turnout, campaign effects, tactical voting, regional vote transfer or uncertainty. The poll conversion assumptions appear under each poll result.</p>
  </section>;
}
