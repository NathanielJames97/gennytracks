import React, { useMemo, useState } from 'react';
import { num, pct } from '../lib/analysis';
import { canonicalPartyName } from '../lib/parties.mjs';

const PARTY_COLOURS = {
  Labour: '#E4003B', Conservative: '#0087DC', 'Liberal Democrats': '#FAA61A',
  'Scottish National': '#FDF38E', 'Sinn Féin': '#326760', Independent: '#DCDCDC',
  'Reform UK': '#12B6CF', 'Democratic Unionist': '#D46A4C', Green: '#02A95B',
  'Plaid Cymru': '#005B54', 'Social Democratic and Labour': '#2AA82C', Speaker: '#9E9E9E',
  Alliance: '#F6CB2F', 'Traditional Unionist Voice': '#0C3A6A', 'Ulster Unionist': '#48A5EE',
};
const FALLBACK_COLOURS = ['#9b7ede', '#56b4e9', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#8c9aaf'];
const CHART = { width: 340, height: 176, left: 34, right: 10, top: 10, bottom: 28 };

function usableNumber(value) {
  return value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function partyRowsFor(seat) {
  if (Array.isArray(seat.partyTotals) && seat.partyTotals.length) return seat.partyTotals;
  if (Array.isArray(seat.candidates) && seat.candidates.length) return seat.candidates;
  return null;
}

function chartSnapshot(row) {
  const rows = partyRowsFor(row.seat);
  const validVotes = usableNumber(row.seat.validVotes) ? Number(row.seat.validVotes) : null;
  let shares = null;
  if (rows && validVotes > 0 && rows.every((item) => usableNumber(item.votes))) {
    shares = new Map();
    rows.forEach((item) => {
      const party = canonicalPartyName(item.partyGroup || item.partyOfficial || item.party || 'Other');
      shares.set(party, (shares.get(party) || 0) + Number(item.votes) / validVotes);
    });
  }
  return {
    ...row,
    turnout: usableNumber(row.seat.turnout) ? Number(row.seat.turnout) : null,
    shares,
  };
}

function colourForParty(party, index) {
  return PARTY_COLOURS[party] || FALLBACK_COLOURS[index % FALLBACK_COLOURS.length];
}

function xAt(index, count) {
  const plotWidth = CHART.width - CHART.left - CHART.right;
  return count <= 1 ? CHART.left + plotWidth / 2 : CHART.left + (index / (count - 1)) * plotWidth;
}

function yAt(value) {
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  return CHART.top + (1 - value) * plotHeight;
}

function HistoryChart({ title, snapshots, series, valueLabel, formatValue, chartId }) {
  return (
    <figure>
      <h3 className="sub">{title}</h3>
      <div className="poll-chart-scroll">
        <svg
          className="poll-chart"
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-labelledby={`${chartId}-title ${chartId}-description`}
          style={{ display: 'block', width: '100%', height: 'auto', minWidth: 0 }}
        >
          <title id={`${chartId}-title`}>{title}</title>
          <desc id={`${chartId}-description`}>{valueLabel} by election for {snapshots[0]?.seat.name}.</desc>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1={CHART.left} x2={CHART.width - CHART.right} y1={yAt(tick)} y2={yAt(tick)} stroke="#343946" />
              <text x={CHART.left - 6} y={yAt(tick) + 4} textAnchor="end" fill="#98a0b3" fontSize="10">{Math.round(tick * 100)}%</text>
            </g>
          ))}
          {series.keys.map((key, keyIndex) => {
            const colour = colourForParty(key, keyIndex);
            return (
              <g key={key}>
                {snapshots.slice(1).map((snapshot, index) => {
                  const previous = snapshots[index];
                  const from = series(previous, index, key);
                  const to = series(snapshot, index + 1, key);
                  if (from === null || to === null) return null;
                  return <line key={`${key}-${index}`} x1={xAt(index, snapshots.length)} y1={yAt(from)} x2={xAt(index + 1, snapshots.length)} y2={yAt(to)} stroke={colour} strokeWidth="2" />;
                })}
                {snapshots.map((snapshot, index) => {
                  const value = series(snapshot, index, key);
                  return value === null ? null : (
                    <circle key={`${key}-${snapshot.election.id}`} cx={xAt(index, snapshots.length)} cy={yAt(value)} r="3.5" fill={colour}>
                      <title>{snapshot.election.label} · {key}: {formatValue(value)}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
          {snapshots.map((snapshot, index) => (
            <text key={snapshot.election.id} x={xAt(index, snapshots.length)} y={CHART.height - 7} textAnchor="middle" fill="#98a0b3" fontSize="9">
              {snapshot.election.isNotional ? '2019*' : snapshot.election.year}
            </text>
          ))}
        </svg>
      </div>
    </figure>
  );
}

function VoteShareTable({ snapshots, parties }) {
  return (
    <div className="compare-table-wrap">
      <table className="compare-table" aria-label="Party vote share by election">
        <thead><tr><th scope="col">Party</th>{snapshots.map((snapshot) => <th scope="col" key={snapshot.election.id}>{snapshot.election.label}</th>)}</tr></thead>
        <tbody>{parties.map((party, index) => (
          <tr key={party}>
            <th scope="row"><span aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, marginRight: 6, borderRadius: '50%', background: colourForParty(party, index) }} />{party}</th>
            {snapshots.map((snapshot) => <td className="num" key={snapshot.election.id}>{snapshot.shares ? pct(snapshot.shares.get(party) ?? 0, 1) : '—'}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TurnoutTable({ snapshots }) {
  return (
    <div className="compare-table-wrap">
      <table className="compare-table" aria-label="Turnout by election">
        <thead><tr><th scope="col">Election</th><th scope="col">Turnout</th></tr></thead>
        <tbody>{snapshots.map((snapshot) => (
          <tr key={snapshot.election.id}>
            <th scope="row">{snapshot.election.label}</th>
            <td className="num">{pct(snapshot.turnout, 1)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const OVERLAP_MEASURES = [
  { id: 'population', label: 'Population', fromField: 'fromPopulationShare', toField: 'toPopulationShare' },
  { id: 'residential', label: 'Residential', fromField: 'fromResidentialShare', toField: 'toResidentialShare' },
  { id: 'area', label: 'Land area', fromField: 'fromAreaShare', toField: 'toAreaShare' },
];

export default function HistoryPanel({
  seat, election, elections, boundarySets = [], resultSets, crosswalks = [], onSelectElection, onSelectPlace,
}) {
  const [overlapMeasure, setOverlapMeasure] = useState('population');
  const history = useMemo(() => {
    if (!seat) return [];
    return elections.map((item, index) => {
      if (item.boundarySetId !== election?.boundarySetId) return null;
      const match = resultSets[index]?.find((record) => record.id === seat.id);
      return match ? { election: item, seat: match } : null;
    }).filter(Boolean);
  }, [seat, election, elections, resultSets]);
  const chartHistory = useMemo(() => history.map(chartSnapshot), [history]);
  const trendParties = useMemo(() => {
    const totals = new Map();
    chartHistory.forEach((snapshot) => snapshot.shares?.forEach((share, party) => {
      totals.set(party, (totals.get(party) || 0) + share);
    }));
    return [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a) || a.localeCompare(b));
  }, [chartHistory]);
  const boundaryNames = useMemo(() => new Map(boundarySets.map((item) => [item.id, item.label])), [boundarySets]);
  const overlaps = useMemo(() => {
    if (!seat) return [];
    const measure = OVERLAP_MEASURES.find((item) => item.id === overlapMeasure) || OVERLAP_MEASURES[0];
    return crosswalks.flatMap((crosswalk) => {
      const isFrom = crosswalk.fromBoundarySetId === election?.boundarySetId;
      const isTo = crosswalk.toBoundarySetId === election?.boundarySetId;
      if (!isFrom && !isTo) return [];
      return (crosswalk.overlaps || []).flatMap((row) => {
        if (isFrom && row.fromCode === seat.id) {
          return [{
            key: `${crosswalk.id}:${row.toCode}`,
            linkedCode: row.toCode,
            linkedName: row.toName,
            linkedBoundarySetId: crosswalk.toBoundarySetId,
            share: row[measure.fromField],
          }];
        }
        if (isTo && row.toCode === seat.id) {
          return [{
            key: `${crosswalk.id}:${row.fromCode}`,
            linkedCode: row.fromCode,
            linkedName: row.fromName,
            linkedBoundarySetId: crosswalk.fromBoundarySetId,
            share: row[measure.toField],
          }];
        }
        return [];
      });
    }).filter((row) => Number.isFinite(row.share))
      .sort((a, b) => b.share - a.share || String(a.linkedName || a.linkedCode).localeCompare(String(b.linkedName || b.linkedCode)));
  }, [seat, election, crosswalks, overlapMeasure]);

  if (!seat) return <p className="hint">Choose a constituency to trace its results through elections.</p>;

  const measureLabel = OVERLAP_MEASURES.find((item) => item.id === overlapMeasure)?.label.toLowerCase();
  const shareSnapshots = chartHistory.filter((row) => row.shares !== null);
  const turnoutSnapshots = chartHistory.filter((row) => row.turnout !== null);
  const shareSeries = (snapshot, _index, party) => snapshot.shares === null ? null : (snapshot.shares.get(party) ?? 0);
  shareSeries.keys = trendParties;
  const turnoutSeries = (snapshot) => snapshot.turnout;
  turnoutSeries.keys = ['Turnout'];
  return (
    <section className="history-panel">
      <h2>{seat.name}</h2>
      <p className="note">The timeline compares results that use the same constituency boundary set.</p>
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
        <p className="hint">{history.length === 1
          ? 'One result is available on these boundaries. History trends need at least two election snapshots.'
          : 'No other results on this boundary set are available for this constituency.'}</p>
      )}
      {history.length > 1 && (
        <section aria-label="Seat history trends">
          {shareSnapshots.length > 1 ? (
            <>
              <HistoryChart
                title="Party vote share"
                snapshots={chartHistory}
                series={shareSeries}
                valueLabel="Party vote share"
                formatValue={(value) => pct(value, 1)}
                chartId="history-party-share"
              />
              <p className="note">Party totals use votes divided by valid votes; spelling aliases are combined by party. Parties absent from a complete result are shown at 0%. Missing result totals remain blank in the table.</p>
              <VoteShareTable snapshots={chartHistory} parties={trendParties} />
            </>
          ) : (
            <p className="hint">Party-share trends need at least two snapshots with complete party and valid-vote totals.</p>
          )}
          {turnoutSnapshots.length > 1 ? (
            <>
              <HistoryChart
                title="Turnout"
                snapshots={chartHistory}
                series={turnoutSeries}
                valueLabel="Turnout"
                formatValue={(value) => pct(value, 1)}
                chartId="history-turnout"
              />
              <TurnoutTable snapshots={chartHistory} />
            </>
          ) : (
            <p className="hint">Turnout trends need at least two reported turnout values.</p>
          )}
          {chartHistory.some((row) => row.election.isNotional) && (
            <p className="note">2019 notional is an estimate on 2024 boundaries; 2024 is the declared result. The notional estimate has no named candidates.</p>
          )}
        </section>
      )}
      {overlaps.length > 0 && (
        <>
          <h3 className="sub">Across a boundary change</h3>
          <label className="overlap-measure">
            <span>Rank links by</span>
            <select value={overlapMeasure} onChange={(event) => setOverlapMeasure(event.target.value)} aria-label="Overlap measure">
              {OVERLAP_MEASURES.map((measure) => <option key={measure.id} value={measure.id}>{measure.label}</option>)}
            </select>
          </label>
          <p className="note">Official {measureLabel} overlap describes how these areas relate. It does not allocate past votes between seats.</p>
          <ul className="place-overlaps">
            {overlaps.slice(0, 8).map((row) => (
              <li key={row.key}>
                <button type="button" onClick={() => onSelectPlace(row.linkedCode, row.linkedBoundarySetId)}>
                  <span>{row.linkedName || row.linkedCode}<small>{boundaryNames.get(row.linkedBoundarySetId) || row.linkedBoundarySetId}</small></span>
                  <strong>{(row.share * 100).toFixed(1)}%</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="note muted">Seat-level result comparisons are shown only where both elections share a boundary set. Cross-boundary links describe geography, not electoral change.</p>
    </section>
  );
}
