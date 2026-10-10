import React, { useMemo, useState } from 'react';
import { averagePolls, buildScenarioFromPoll, isMrpPoll, pollDisplayDate } from '../lib/polling';
import { num } from '../lib/analysis';

const PARTY_COLOURS = {
  Labour: '#e4003b', Conservative: '#0087dc', 'Reform UK': '#12b6cf',
  'Liberal Democrats': '#faa61a', Green: '#5eb646', 'Scottish National': '#fdf38e',
  'Plaid Cymru': '#005b54', Other: '#98a0b3', 'SNP/Plaid Cymru': '#9b8f40',
  'Restore Britain': '#7951a8',
};

function formatDate(value) {
  if (!value) return 'Not reported';
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(time) : value;
}

function chartRows(polls) {
  return polls.filter((poll) => Object.values(poll.shares || {}).some((value) => Number.isFinite(Number(value))));
}

export default function PollingPanel({ data, scenarioBaseline, onUseScenario }) {
  const [chartGeography, setChartGeography] = useState('GB');
  const [averageGeography, setAverageGeography] = useState('GB');
  const [chartWindow, setChartWindow] = useState(90);
  const [averageWindow, setAverageWindow] = useState(30);
  const [pollster, setPollster] = useState('all');
  const [status, setStatus] = useState('');
  const allPolls = data?.polls || [];
  const asOf = data?.updatedAt || '2026-10-09';
  const chartStart = chartWindow < 9999 ? Date.parse(asOf + 'T23:59:59Z') - chartWindow * 86400000 : -Infinity;
  const pollsters = useMemo(() => [...new Set(allPolls.map((poll) => poll.pollster))].sort(), [allPolls]);
  const visiblePolls = useMemo(() => allPolls.filter((poll) => {
    if (chartGeography !== 'all' && poll.geography !== chartGeography) return false;
    if (pollster !== 'all' && poll.pollster !== pollster) return false;
    const date = pollDisplayDate(poll);
    const time = Date.parse((date || '') + 'T23:59:59Z');
    if (Number.isFinite(chartStart) && time < chartStart) return false;
    return true;
  }).sort((a, b) => (pollDisplayDate(a) || '').localeCompare(pollDisplayDate(b) || '')), [allPolls, chartGeography, pollster, chartStart]);
  const average = useMemo(() => averagePolls(allPolls, {
    geography: averageGeography, asOf, windowDays: averageWindow,
  }), [allPolls, averageGeography, asOf, averageWindow]);
  const chartPolls = useMemo(() => chartRows(visiblePolls), [visiblePolls]);
  const parties = useMemo(() => [...new Set(chartPolls.flatMap((poll) => Object.keys(poll.shares || {})))].sort((a, b) => a.localeCompare(b, 'en-GB')), [chartPolls]);
  const width = 720;
  const height = 240;
  const margin = { left: 38, right: 14, top: 14, bottom: 42 };
  const dates = chartPolls.map((poll) => Date.parse((pollDisplayDate(poll) || '') + 'T12:00:00Z')).filter(Number.isFinite);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const xAt = (date) => margin.left + ((maxDate === minDate ? 0.5 : (Date.parse(date + 'T12:00:00Z') - minDate) / (maxDate - minDate)) * (width - margin.left - margin.right));
  const yAt = (value) => margin.top + (50 - Number(value)) / 50 * (height - margin.top - margin.bottom);
  const averageSource = {
    id: 'average-' + averageGeography.toLowerCase() + '-' + asOf,
    pollster: 'Equal-weight ' + averageGeography + ' descriptive average',
    label: 'latest per pollster · ' + average.windowDays + '-day window',
    date: asOf,
    geography: averageGeography,
    type: 'voting-intention',
    shares: Object.fromEntries(Object.entries(average.shares).filter(([, row]) => Number.isFinite(row.value)).map(([party, row]) => [party, row.value])),
    sourceUrl: data?.provider?.sourceUrl,
    providerUrl: data?.provider?.datasetUrl,
  };
  const canFeedAverage = averageGeography === 'GB' && average.pollsterCount > 0 && Boolean(scenarioBaseline);
  const useAverage = () => {
    try {
      const scenario = buildScenarioFromPoll(averageSource, scenarioBaseline, { geography: 'GB' });
      onUseScenario(scenario);
      setStatus('GB descriptive average copied into the 2024 scenario inputs.');
    } catch (error) { setStatus(error.message); }
  };
  const usePoll = (poll) => {
    try {
      const scenario = buildScenarioFromPoll(poll, scenarioBaseline, { geography: 'GB' });
      onUseScenario(scenario);
      setStatus(poll.pollster + ' snapshot copied into the 2024 scenario inputs.');
    } catch (error) { setStatus(error.message); }
  };

  if (!data) return <p className="hint" role="status">Loading polling snapshot…</p>;

  return (
    <section className="polling-panel">
      <p className="comparison-eyebrow">Polling snapshots · static data</p>
      <h2>Vote intention over time</h2>
      <p className="note">These are published poll observations, not election forecasts. The snapshot was updated {formatDate(asOf)}. Percentages are shown as reported; missing parties are not filled with zero.</p>
      <p className="poll-attribution">Series: <a href={data.provider?.sourceUrl} target="_blank" rel="noreferrer">{data.provider?.name || 'BritPolls'}</a> · {data.provider?.license || 'licence terms unavailable'} · original pollster links are shown when verified.</p>
      <div className="polling-filters">
        <label>Chart geography<select value={chartGeography} onChange={(event) => setChartGeography(event.target.value)}><option value="GB">Great Britain verified</option><option value="UK">United Kingdom verified</option><option value="unverified">Geography unverified</option><option value="all">All geographies</option></select></label>
        <label>Display window<select value={chartWindow} onChange={(event) => setChartWindow(Number(event.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option><option value={9999}>All dates</option></select></label>
        <label>Pollster<select value={pollster} onChange={(event) => setPollster(event.target.value)}><option value="all">All pollsters</option>{pollsters.map((name) => <option key={name}>{name}</option>)}</select></label>
      </div>
      <div className="poll-chart-scroll">
        <svg className="poll-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={'Published party voting-intention shares by poll and date. ' + chartPolls.length + ' observations displayed.'}>
          {[0, 10, 20, 30, 40, 50].map((tick) => <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={yAt(tick)} y2={yAt(tick)} /><text x={margin.left - 8} y={yAt(tick) + 4} textAnchor="end">{tick}%</text></g>)}
          {parties.map((party) => {
            const points = chartPolls.map((poll) => {
              const entry = Object.entries(poll.shares || {}).find(([name]) => name === party);
              return entry && Number.isFinite(Number(entry[1])) ? { poll, value: Number(entry[1]), x: xAt(pollDisplayDate(poll)) } : null;
            }).filter(Boolean);
            return <g key={party} className="poll-party-series">
              {points.length > 1 && <polyline points={points.map((point) => point.x + ',' + yAt(point.value)).join(' ')} style={{ stroke: PARTY_COLOURS[party] || '#c8cedb' }} />}
              {points.map((point) => <circle key={point.poll.id} cx={point.x} cy={yAt(point.value)} r="4" style={{ fill: PARTY_COLOURS[party] || '#c8cedb' }}>
                <title>{point.poll.pollster} · {formatDate(pollDisplayDate(point.poll))} · {party}: {point.value}%</title>
              </circle>)}
            </g>;
          })}
          {chartPolls.length > 0 && <>
            <text x={margin.left} y={height - 8} textAnchor="start">{formatDate(chartPolls[0] ? pollDisplayDate(chartPolls[0]) : null)}</text>
            <text x={width - margin.right} y={height - 8} textAnchor="end">{formatDate(chartPolls.at(-1) ? pollDisplayDate(chartPolls.at(-1)) : null)}</text>
          </>}
          {!chartPolls.length && <text x={width / 2} y={height / 2} textAnchor="middle">No observations match these filters</text>}
        </svg>
      </div>
      <ul className="poll-chart-legend">{parties.map((party) => <li key={party}><span style={{ background: PARTY_COLOURS[party] || '#c8cedb' }} />{party}</li>)}</ul>
      <p className="count" role="status">{visiblePolls.length} observations displayed · MRP models are marked and excluded from averages</p>

      <h3 className="sub">Transparent descriptive average</h3>
      <div className="polling-filters average-filters">
        <label>Average geography<select value={averageGeography} onChange={(event) => setAverageGeography(event.target.value)}><option value="GB">Great Britain</option><option value="UK">United Kingdom</option></select></label>
        <label>Average window<select value={averageWindow} onChange={(event) => setAverageWindow(Number(event.target.value))}><option value={30}>Latest 30 days</option><option value={60}>Latest 60 days</option><option value={90}>Latest 90 days</option><option value={365}>Latest year</option><option value={9999}>All dates</option></select></label>
        <div className="poll-average-count"><strong>{average.pollsterCount}</strong><span>pollsters included</span></div>
      </div>
      <p className="note">{average.method} Window: {average.windowDays >= 9999 ? 'all available dates' : average.windowDays + ' days'} through {formatDate(asOf)}. MRP and other-geography rows are excluded.</p>
      {!average.pollsterCount && <p className="boundary-warning">No verified non-MRP polls are available for this geography and date window.</p>}
      <div className="compare-table-wrap">
        <table className="compare-table poll-average-table"><thead><tr><th scope="col">Party</th><th scope="col">Average</th><th scope="col">Polls</th></tr></thead><tbody>
          {Object.entries(average.shares).map(([party, row]) => <tr key={party}><th scope="row">{party}</th><td className="num">{row.value === null ? '—' : row.value.toFixed(1) + '%'}</td><td className="num">{num(row.pollCount)}</td></tr>)}
          {!Object.keys(average.shares).length && <tr><td colSpan="3">No published shares in this window.</td></tr>}
        </tbody></table>
      </div>
      <p className="note">Reported average total: {average.reportedAverageTotal.toFixed(1)}%. Rounded values and omitted parties can leave this below or above 100%; party averages are not rescaled.</p>
      <button type="button" className="primary-action" disabled={!canFeedAverage} onClick={useAverage}>Use GB average in 2024 scenario</button>
      {averageGeography !== 'GB' && <p className="note">UK figures stay separate from Great Britain scenario inputs.</p>}
      {status && <p role="status" className="share-status">{status}</p>}
      <details className="poll-exclusions"><summary>Included pollsters and exclusions ({average.exclusions.length})</summary>
        <h4>Included snapshots</h4>
        <ul>{average.includedPolls.map((poll) => <li key={poll.id}>{poll.pollster} · {formatDate(pollDisplayDate(poll))} · <a href={poll.sourceUrl || poll.providerUrl || data.provider?.datasetUrl} target="_blank" rel="noreferrer">source</a></li>)}</ul>
        <h4>Excluded from this average</h4>
        <ul>{average.exclusions.map(({ poll, reason }) => <li key={poll.id}>{poll.pollster} · {formatDate(pollDisplayDate(poll))}: {reason}</li>)}</ul>
      </details>

      <h3 className="sub">Poll observations and sources</h3>
      <div className="poll-table-wrap"><table className="compare-table poll-source-table">
        <caption className="sr-only">Poll observations, reported voting shares and available source metadata</caption>
        <thead><tr><th scope="col">Pollster / date</th><th scope="col">Geography</th><th scope="col">Sample</th><th scope="col">Shares as reported</th><th scope="col">Source / notes</th><th scope="col">Scenario</th></tr></thead>
        <tbody>{visiblePolls.slice().reverse().map((poll) => <tr key={poll.id}>
          <th scope="row"><strong>{poll.pollster}</strong><small>{formatDate(pollDisplayDate(poll))}{poll.fieldworkStart || poll.fieldworkEnd ? ' · fieldwork ' + formatDate(poll.fieldworkStart) + '–' + formatDate(poll.fieldworkEnd) : ''}{poll.publishedDate ? ' · published ' + formatDate(poll.publishedDate) : ''}{isMrpPoll(poll) && <span className="mrp-badge">MRP · not VI</span>}</small></th>
          <td>{poll.geography === 'unverified' ? 'Unverified' : poll.geography || 'Not reported'}</td>
          <td>{poll.sampleSize ? num(poll.sampleSize) : 'Not reported'}{poll.population && <small>{poll.population}</small>}</td>
          <td><div className="poll-shares">{Object.entries(poll.shares || {}).map(([party, value]) => <span key={party}><b>{party}</b> {Number(value).toFixed(1)}%</span>)}</div></td>
          <td><a href={poll.sourceUrl || data.provider?.datasetUrl} target="_blank" rel="noreferrer">{poll.sourceLevel || 'Source'}</a><small>{poll.sourceNote || 'Method or original source metadata not verified in this snapshot.'}</small></td>
          <td><button type="button" className="link" disabled={poll.geography !== 'GB' || isMrpPoll(poll) || !scenarioBaseline} onClick={() => usePoll(poll)}>Use</button></td>
        </tr>)}</tbody>
      </table></div>
      <p className="note">Averages are descriptive and not a pooled estimate. The pollster archive and <a href="https://www.britishpollingcouncil.org/rules-of-disclosure/" target="_blank" rel="noreferrer">BPC disclosure rules</a> explain why fieldwork, sample, population, commissioner and method details are shown where available. Attribution and reuse: <a href={data.provider?.sourceUrl} target="_blank" rel="noreferrer">BritPolls dataset</a> ({data.provider?.license}) and each linked poll publisher.</p>
    </section>
  );
}
