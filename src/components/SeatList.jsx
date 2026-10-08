import React, { useMemo } from 'react';
import { num, pct } from '../lib/analysis';

/**
 * Searchable, sortable table of all 650 seats.
 *
 * Sorting covers the measures that matter for analysis rather than just
 * alphabetically: seats won, vote share, margin, turnout.
 */
const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  majority: (a, b) => (a.majority ?? Infinity) - (b.majority ?? Infinity),
  share: (a, b) => (b.winnerShare ?? -1) - (a.winnerShare ?? -1),
  turnout: (a, b) => (b.turnout ?? -1) - (a.turnout ?? -1),
  electorate: (a, b) => (b.electorate ?? 0) - (a.electorate ?? 0),
};

const COLUMNS = [
  { key: 'name', label: 'Seat', sortable: true },
  { key: 'majority', label: 'Maj', sortable: true, numeric: true, title: 'Winning margin in votes' },
  { key: 'share', label: 'Share', sortable: true, numeric: true, title: 'Winner’s share of the vote' },
  { key: 'turnout', label: 'Turnout', sortable: true, numeric: true },
];

export default function SeatList({ seats, query, onQuery, selected, onSelect }) {
  const [sort, setSort] = React.useState({ key: 'majority', dir: 1 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return seats;
    return seats.filter(
      (s) => s.name.toLowerCase().includes(q)
        || (s.member || '').toLowerCase().includes(q)
        || (s.partyGroup || '').toLowerCase().includes(q)
        || (s.region || '').toLowerCase().includes(q),
    );
  }, [seats, query]);

  const sorted = useMemo(() => {
    const cmp = SORTS[sort.key] || SORTS.name;
    const list = [...filtered].sort((a, b) => cmp(a, b) * sort.dir);
    // Name sorts read best ascending; measures read best descending, so invert
    // only the alphabetical case when the user flips direction.
    return list;
  }, [filtered, sort]);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }));
  };

  return (
    <div className="list-wrap">
      <div className="list-head">
        <label className="search">
          <span className="sr-only">Search seats, MPs, parties or regions</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search seat, MP, party or region…"
          />
        </label>
        <p className="count" aria-live="polite">
          {filtered.length === seats.length
            ? `${seats.length} seats`
            : `${filtered.length} of ${seats.length} seats`}
        </p>
      </div>

      <table className="seats">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={c.numeric ? 'num' : undefined}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
              >
                {c.sortable ? (
                  <button type="button" onClick={() => toggleSort(c.key)} title={c.title}>
                    {c.label}
                    {sort.key === c.key && <span aria-hidden="true">{sort.dir === 1 ? ' ▲' : ' ▼'}</span>}
                  </button>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.id}
              className={selected?.id === s.id ? 'on' : undefined}
              onClick={() => onSelect(selected?.id === s.id ? null : s)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(selected?.id === s.id ? null : s);
                }
              }}
            >
              <th scope="row">
                <span className="dot" style={{ background: s.colour }} aria-hidden="true" />
                {s.name}
              </th>
              <td className="num">{num(s.majority)}</td>
              <td className="num">{pct(s.winnerShare, 1)}</td>
              <td className="num">{pct(s.turnout, 1)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={COLUMNS.length} className="empty">No seats match “{query}”.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
