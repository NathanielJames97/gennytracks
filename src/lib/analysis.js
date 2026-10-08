// Presentation helpers: number/percent formatting and the colour scales used
// to shade each constituency for every map mode.

/** Thousands-separated integer, e.g. 75806 -> "75,806". */
export const num = (n) => (Number.isFinite(n) ? n.toLocaleString('en-GB') : '—');

/** Fraction to a percentage string, e.g. 0.597 -> "59.7%". */
export const pct = (n, digits = 1) =>
  (Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—');

/** Signed percentage-point delta, e.g. +3.4 / -1.2 */
export const pp = (n, digits = 1) =>
  Number.isFinite(n) ? `${n > 0 ? '+' : ''}${(n * 100).toFixed(digits)}` : '—';

/**
 * Percentage that keeps small values legible.
 *
 * Takes a fraction (0.384) rather than a pre-multiplied percentage, and adapts
 * precision to magnitude: the closest seat, Hendon, was decided by 15 votes out
 * of 41,256 — 0.036% — which a fixed single decimal would render as "0.0%".
 */
export function pctAdaptive(fraction) {
  if (!Number.isFinite(fraction)) return '—';
  const percent = fraction * 100;
  const v = Math.abs(percent);
  if (v >= 10) return `${percent.toFixed(1)}%`;
  if (v >= 1) return `${percent.toFixed(2)}%`;
  if (v >= 0.1) return `${percent.toFixed(3)}%`;
  return `${percent.toFixed(4)}%`;
}

/** Clamp a number into a range. */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Build a continuous colour ramp from a list of [stop, colour] pairs.
 * Interpolates in RGB. Returned function takes 0..1.
 */
function ramp(stops) {
  return (t) => {
    const x = clamp(t, 0, 1);
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ca] = stops[i];
      const [b, cb] = stops[i + 1];
      if (x >= a && x <= b) {
        const f = b === a ? 0 : (x - a) / (b - a);
        return mix(ca, cb, f);
      }
    }
    return stops[stops.length - 1][1];
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, f) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const to = (x) => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(ar + (br - ar) * f)}${to(ag + (bg - ag) * f)}${to(ab + (bb - ab) * f)}`;
}

// Sequential ramp: pale -> saturated, single hue family. Used where a value's
// magnitude is the point (turnout, vote share).
const SEQUENTIAL = ramp([
  [0, '#0d1b2a'],
  [0.35, '#1b4965'],
  [0.65, '#2a7f9e'],
  [0.85, '#5cc8d7'],
  [1, '#c9f2f7'],
]);

// For majorities we want close races to read as alarming, so the ramp runs from
// red (knife-edge) through to calm blue (safe seat).
const MARGIN = ramp([
  [0, '#d7263d'],
  [0.2, '#f46036'],
  [0.45, '#f8a51b'],
  [0.7, '#5bb8a9'],
  [1, '#2c7bb6'],
]);

// Diverging ramp available for continuous swing measures (vote-share change).
// The categorical swing map instead keys off the losing party's colour, since
// "who held this seat before" is a category rather than a magnitude.

/** Neutral fill for seats missing the metric a mode needs. */
export const NO_DATA = '#3a3f4b';

/** Seats the incumbent won again: no movement, so they read as neutral. */
export const HELD = '#5c6270';

export const MAP_MODES = [
  { id: 'winner', label: 'Winner', hint: 'Party that won the seat' },
  { id: 'share', label: 'Vote share', hint: 'Winning candidate’s share of the vote' },
  { id: 'swing', label: 'Swing', hint: 'Which party took each seat from whom' },
  { id: 'majority', label: 'Margin', hint: 'Closest races first' },
  { id: 'turnout', label: 'Turnout', hint: 'Votes cast as a share of the electorate' },
];

/**
 * Census modes are declared in the generated summary rather than hardcoded
 * here, so adding an ONS table to the pipeline is enough to surface it.
 */
export const CENSUS_GROUP = 'census';

/**
 * Resolve the fill colour for one seat under the active mode.
 * @param {object} seat  record from constituencies.json
 * @param {string} mode  one of MAP_MODES
 */
export function colourFor(seat, mode) {
  if (!seat) return NO_DATA;

  switch (mode) {
    case 'share': {
      // Winning share sits between roughly 0.28 and 0.72 in practice, so anchor
      // the ramp there rather than 0..1 or every seat looks the same.
      if (!Number.isFinite(seat.winnerShare)) return NO_DATA;
      return SEQUENTIAL((seat.winnerShare - 0.25) / 0.5);
    }
    case 'turnout': {
      if (!Number.isFinite(seat.turnout)) return NO_DATA;
      return SEQUENTIAL((seat.turnout - 0.35) / 0.35);
    }
    case 'majority': {
      if (!Number.isFinite(seat.majority)) return NO_DATA;
      // Log scale: the gap between 15 and 150 votes matters as much as 1k-5k.
      const t = Math.log10(Math.max(seat.majority, 1)) / Math.log10(30000);
      return MARGIN(t);
    }
    case 'swing': {
      // Colour by the party that LOST the seat, so one colour consistently
      // means "this seat used to be theirs". Seats with no swing data are
      // distinct from seats that were simply held, which render neutral grey.
      if (seat.resultType !== 'gain') return HELD;
      if (!seat.swingColour) return NO_DATA;
      return seat.swingColour;
    }
    case CENSUS_GROUP:
    default:
      // Census modes ('census:deprived' etc.) fall through to the census branch.
      if (mode && mode.startsWith('census:')) {
        const value = seat.census?.[seat.censusMetric];
        if (!Number.isFinite(value)) return NO_DATA;
        const d = seat.censusDomain || [0, 1];
        return SEQUENTIAL((value - d[0]) / (d[1] - d[0] || 1));
      }
      return seat.colour || NO_DATA;
  }
}

/** Legend swatches for the active mode, as [colour, label, value] rows. */
export function legendFor(seat, mode, scale) {
  if (mode === 'winner' || mode === 'swing') {
    return [{ colour: seat?.colour || NO_DATA, label: seat?.partyGroup || '—', value: seat?.result }];
  }
  const value = { share: seat?.winnerShare, turnout: seat?.turnout }[mode]
    ?? (Number.isFinite(seat?.majority) ? scale : null);
  return [{ colour: NO_DATA, label: 'No data', value: value === null ? null : value }];
}

/** Contiguous bands for the map legend on continuous modes. */
export const BANDS = {
  share: [
    { label: '< 35%', from: 0.25, to: 0.35 },
    { label: '35–45%', from: 0.35, to: 0.45 },
    { label: '45–55%', from: 0.45, to: 0.55 },
    { label: '55–65%', from: 0.55, to: 0.65 },
    { label: '> 65%', from: 0.65, to: 0.8 },
  ],
  turnout: [
    { label: '< 45%', from: 0.35, to: 0.45 },
    { label: '45–55%', from: 0.45, to: 0.55 },
    { label: '55–65%', from: 0.55, to: 0.65 },
    { label: '> 65%', from: 0.65, to: 0.7 },
  ],
  majority: [
    { label: '< 1k', from: 0, to: 0.62 },
    { label: '1–2k', from: 0.62, to: 0.71 },
    { label: '2–5k', from: 0.71, to: 0.8 },
    { label: '5–10k', from: 0.8, to: 0.88 },
    { label: '10k+', from: 0.88, to: 1 },
  ],
};
