import { regionName } from './comparison';

const WIDTH = 1600;
const PAD = 48;
const GAP = 24;
const MAP_TOP = 198;
const MAP_HEIGHT = 450;
const PARTY_ROW_HEIGHT = 24;
const SEAT_ROW_HEIGHT = 24;
const FONT = 'Arial, sans-serif';
const COLOURS = {
  background: '#10141c',
  panel: '#191f2b',
  panelAlt: '#151b25',
  line: '#394353',
  text: '#f3f5f8',
  muted: '#aab4c3',
  accent: '#7f9cff',
  highlight: '#ffe16b',
  noResult: '#596273',
};

function text(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function validRows(seat) {
  if (Array.isArray(seat?.partyTotals) && seat.partyTotals.length) return seat.partyTotals;
  if (Array.isArray(seat?.candidates) && seat.candidates.length) return seat.candidates;
  return [];
}

function hasCompleteVotes(seat) {
  const rows = validRows(seat);
  return Number.isFinite(seat?.validVotes) && rows.length > 0
    && rows.every((row) => Number.isFinite(row.votes));
}

function featureCollectionFeatures(boundaries) {
  return Array.isArray(boundaries?.features) ? boundaries.features : [];
}

function getBoundaryCoverage(seats, boundaries) {
  const seatIds = new Set((seats || []).map((seat) => seat.id));
  const featureIds = new Set(featureCollectionFeatures(boundaries)
    .map((feature) => feature?.properties?.id)
    .filter((id) => seatIds.has(id)));
  const completeVoteSeats = (seats || []).filter(hasCompleteVotes).length;
  return {
    seats: (seats || []).length,
    mappedSeats: featureIds.size,
    completeVoteSeats,
    featureCollectionPresent: Boolean(boundaries && Array.isArray(boundaries.features)),
  };
}

function boundaryCitation(election, boundarySets, sources) {
  const boundary = (boundarySets || []).find((item) => item.id === election?.boundarySetId);
  const source = (sources || []).find((item) => item.id === boundary?.sourceId);
  const boundaryLabel = boundary?.label || election?.boundaryLabel || election?.boundarySetId || 'Boundary set unavailable';
  const sourceLabel = source?.attribution || source?.name || election?.boundarySourceName || 'Boundary source unavailable';
  const license = source?.license ? ` · ${source.license}` : '';
  const boundaryUrl = source?.url || election?.boundarySourceUrl || 'Boundary source URL unavailable';
  const resultSource = election?.sourceName || 'Election result source unavailable';
  const resultUrl = election?.sourceUrl || 'Result source URL unavailable';
  const citation = [
    `${election?.label || election?.id || 'Election'} results: ${resultSource} · ${resultUrl}`,
    `Boundary set: ${boundaryLabel} · ${sourceLabel}${license} · ${boundaryUrl}`,
    election?.boundaryCaveat || '',
  ].filter(Boolean).join(' — ');
  return { boundaryLabel, sourceLabel, sourceUrl: boundaryUrl, citation };
}

function partyRowText(row) {
  const percentage = (share) => Number.isFinite(share) ? `${(share * 100).toFixed(1)}%` : 'n/a';
  const delta = Number.isFinite(row.shareDelta) ? `${row.shareDelta > 0 ? '+' : ''}${(row.shareDelta * 100).toFixed(1)} pp` : 'n/a';
  const seatDelta = row.selected - row.previous;
  return [
    row.party,
    text(row.selected),
    text(row.previous),
    `${seatDelta > 0 ? '+' : ''}${seatDelta}`,
    percentage(row.selectedShare),
    percentage(row.previousShare),
    delta,
  ];
}

function getFilteredSeatRows(model, pairs) {
  if (!model?.sameBoundaries) return [];
  return (pairs || []).map((pair) => ({
    id: pair.current.id,
    name: pair.current.name,
    previousName: pair.previous.name,
    previousParty: pair.previous.partyGroup,
    currentParty: pair.current.partyGroup,
    majority: pair.current.majority,
    turnoutDelta: pair.turnoutDelta,
    changed: pair.changed,
  }));
}

function mapFeatures(boundaries, seats, area, resultIds, changedIds, sameBoundaries) {
  const seatById = new Map((seats || []).map((seat) => [seat.id, seat]));
  return featureCollectionFeatures(boundaries).filter((feature) => {
    if (!area) return true;
    const seat = seatById.get(feature?.properties?.id);
    return Boolean(seat && regionName(seat) === area);
  }).map((feature) => {
    const id = feature?.properties?.id;
    const seat = seatById.get(id);
    return {
      feature,
      id,
      name: feature?.properties?.name || seat?.name || id || 'Unknown seat',
      colour: seat?.colour || COLOURS.noResult,
      active: !sameBoundaries || resultIds.has(id),
      changed: sameBoundaries && changedIds.has(id),
    };
  });
}

function filterDescription(filters, sameBoundaries) {
  const scope = filters?.area || 'United Kingdom';
  if (!sameBoundaries) return `${scope} · seat search and winner filters do not apply across boundary sets`;
  const winners = filters?.changesOnly ? 'winner changes only' : 'all winners';
  const query = filters?.query?.trim() ? `search “${filters.query.trim()}”` : 'no search';
  const sort = filters?.sort ? `ordered by ${filters.sort}` : 'default order';
  return `${scope} · ${winners} · ${query} · ${sort}`;
}

/** Prepare all data for the PNG; `pairs` must be the complete active filtered set. */
export function buildComparisonPngLayout({
  election,
  comparison,
  model,
  pairs = [],
  filters = {},
  boundaries,
  comparisonBoundaries,
  boundarySets = [],
  sources = [],
} = {}) {
  const currentSeats = model?.current || [];
  const previousSeats = model?.previous || [];
  const resultIds = new Set((pairs || []).map((pair) => pair.current.id));
  const changedIds = new Set((pairs || []).filter((pair) => pair.changed).map((pair) => pair.current.id));
  const sameBoundaries = Boolean(model?.sameBoundaries);
  const area = filters?.area || '';
  const currentCitation = boundaryCitation(election, boundarySets, sources);
  const comparisonCitation = boundaryCitation(comparison, boundarySets, sources);
  const partyRows = (model?.parties || []).map(partyRowText);
  const seatRows = getFilteredSeatRows(model, pairs);
  const currentCoverage = getBoundaryCoverage(currentSeats, boundaries);
  const comparisonCoverage = getBoundaryCoverage(previousSeats, comparisonBoundaries);
  const maps = [
    {
      title: election?.label || election?.id || 'Selected election',
      boundaryLabel: currentCitation.boundaryLabel,
      features: mapFeatures(boundaries, currentSeats, area, resultIds, changedIds, sameBoundaries),
      coverage: currentCoverage,
      seatCount: currentSeats.length,
    },
    {
      title: comparison?.label || comparison?.id || 'Comparison election',
      boundaryLabel: comparisonCitation.boundaryLabel,
      features: mapFeatures(comparisonBoundaries, previousSeats, area, resultIds, changedIds, sameBoundaries),
      coverage: comparisonCoverage,
      seatCount: previousSeats.length,
    },
  ];
  const mapTop = MAP_TOP;
  const mapBottom = mapTop + MAP_HEIGHT;
  const coverageTop = mapBottom + 18;
  const partyTitleTop = coverageTop + 136;
  const partyTableTop = partyTitleTop + 28;
  const partyRowsTop = partyTableTop + 34;
  const partyBottom = partyRowsTop + partyRows.length * PARTY_ROW_HEIGHT;
  const resultsTitleTop = sameBoundaries ? partyBottom + 54 : null;
  const resultsTableTop = sameBoundaries ? resultsTitleTop + 30 : null;
  const resultRowCount = Math.ceil(seatRows.length / 2);
  const resultsBottom = sameBoundaries ? resultsTableTop + 32 + resultRowCount * SEAT_ROW_HEIGHT : partyBottom;
  const citationTop = resultsBottom + 50;
  const height = citationTop + 224;

  return {
    width: WIDTH,
    height,
    padding: PAD,
    gap: GAP,
    mapTop,
    mapHeight: MAP_HEIGHT,
    coverageTop,
    partyTitleTop,
    partyTableTop,
    partyRowsTop,
    resultsTitleTop,
    resultsTableTop,
    citationTop,
    electionLabel: election?.label || election?.id || 'Selected election',
    comparisonLabel: comparison?.label || comparison?.id || 'Comparison election',
    electionType: election?.isNotional ? 'NOTIONAL' : 'DECLARED',
    comparisonType: comparison?.isNotional ? 'NOTIONAL' : 'DECLARED',
    filterDescription: filterDescription(filters, sameBoundaries),
    sameBoundaries,
    maps,
    partyRows,
    seatRows,
    resultRowCount,
    filteredPairCount: seatRows.length,
    unfilteredMatchedCount: model?.pairs?.length || 0,
    citations: [currentCitation, comparisonCitation],
    areaPartyTotals: !sameBoundaries,
  };
}

function setFont(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function fitText(ctx, value, x, y, maxWidth) {
  const content = text(value);
  if (ctx.measureText(content).width <= maxWidth) {
    ctx.fillText(content, x, y);
    return;
  }
  let result = content;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  ctx.fillText(`${result}…`, x, y);
}

function wrapText(ctx, value, x, y, maxWidth, lineHeight, maxLines = 6) {
  const words = text(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) visible[maxLines - 1] = `${visible[maxLines - 1].replace(/…?$/, '')}…`;
  visible.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
  return visible.length;
}

function drawFeatureGeometry(ctx, feature, project) {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!polygons.length) return false;
  ctx.beginPath();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 2) continue;
      const first = project(ring[0]);
      ctx.moveTo(first.x, first.y);
      for (let index = 1; index < ring.length; index += 1) {
        const point = project(ring[index]);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
    }
  }
  ctx.fill('evenodd');
  ctx.stroke();
  return true;
}

function featurePositions(features) {
  const positions = [];
  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      positions.push(coordinates);
      return;
    }
    coordinates.forEach(visit);
  };
  features.forEach(({ feature }) => visit(feature?.geometry?.coordinates));
  return positions;
}

function mapProjector(features, x, y, width, height) {
  const positions = featurePositions(features);
  if (!positions.length) return null;
  const meanLatitude = positions.reduce((sum, position) => sum + position[1], 0) / positions.length;
  const longitudeScale = Math.cos((meanLatitude * Math.PI) / 180);
  const values = positions.map(([longitude, latitude]) => [longitude * longitudeScale, latitude]);
  const extent = values.reduce((box, [pointX, pointY]) => ({
    minX: Math.min(box.minX, pointX),
    maxX: Math.max(box.maxX, pointX),
    minY: Math.min(box.minY, pointY),
    maxY: Math.max(box.maxY, pointY),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const { minX, maxX, minY, maxY } = extent;
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min(width / spanX, height / spanY);
  const offsetX = x + (width - spanX * scale) / 2;
  const offsetY = y + (height - spanY * scale) / 2;
  return ([longitude, latitude]) => ({
    x: offsetX + (longitude * longitudeScale - minX) * scale,
    y: offsetY + (maxY - latitude) * scale,
  });
}

function drawMapPanel(ctx, map, panel, width, activeFilters) {
  ctx.fillStyle = COLOURS.panel;
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
  ctx.strokeStyle = COLOURS.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  ctx.fillStyle = COLOURS.text;
  setFont(ctx, 21, 700);
  fitText(ctx, map.title, panel.x + 20, panel.y + 31, panel.width - 40);
  ctx.fillStyle = COLOURS.muted;
  setFont(ctx, 13);
  fitText(ctx, map.boundaryLabel, panel.x + 20, panel.y + 55, panel.width - 40);

  const plot = { x: panel.x + 16, y: panel.y + 70, width: panel.width - 32, height: panel.height - 124 };
  ctx.fillStyle = COLOURS.panelAlt;
  ctx.fillRect(plot.x, plot.y, plot.width, plot.height);
  const project = mapProjector(map.features, plot.x + 10, plot.y + 10, plot.width - 20, plot.height - 20);
  if (!project) {
    ctx.fillStyle = COLOURS.muted;
    setFont(ctx, 16);
    ctx.textAlign = 'center';
    ctx.fillText('Boundary geometry unavailable', plot.x + plot.width / 2, plot.y + plot.height / 2);
    ctx.textAlign = 'left';
  } else {
    for (const item of map.features) {
      ctx.save();
      ctx.globalAlpha = item.active ? 0.95 : 0.2;
      ctx.fillStyle = item.colour;
      ctx.strokeStyle = item.changed && activeFilters.sameBoundaries ? COLOURS.highlight : '#d5dae3';
      ctx.lineWidth = item.changed && activeFilters.sameBoundaries ? 1.8 : 0.65;
      drawFeatureGeometry(ctx, item.feature, project);
      ctx.restore();
    }
  }
  ctx.fillStyle = COLOURS.muted;
  setFont(ctx, 13);
  fitText(ctx, `${map.coverage.mappedSeats}/${map.coverage.seats} seats have boundary features`, panel.x + 20,
    panel.y + panel.height - 17, panel.width - 40);
}

function drawHeader(ctx, layout) {
  ctx.fillStyle = COLOURS.text;
  setFont(ctx, 36, 700);
  ctx.fillText(`${layout.electionLabel} versus ${layout.comparisonLabel}`, PAD, 63);
  ctx.fillStyle = COLOURS.muted;
  setFont(ctx, 16);
  ctx.fillText(`${layout.electionType} result  ·  ${layout.comparisonType} result  ·  ${layout.filterDescription}`, PAD, 96);
  ctx.fillStyle = COLOURS.accent;
  setFont(ctx, 14, 700);
  ctx.fillText(layout.sameBoundaries ? `${layout.filteredPairCount} FILTERED MATCHED SEATS` : 'CROSS-BOUNDARY AREA PARTY TOTALS', PAD, 128);
  ctx.fillStyle = COLOURS.muted;
  setFont(ctx, 13);
  ctx.fillText(layout.sameBoundaries
    ? 'Map outlines highlight winner changes in the complete filtered result list.'
    : 'Maps show separate boundary sets. Seat-by-seat changes are unavailable across these boundaries.', PAD, 153);
}

function drawCoverage(ctx, layout) {
  const x = PAD;
  const y = layout.coverageTop;
  const width = WIDTH - PAD * 2;
  const height = 108;
  ctx.fillStyle = COLOURS.panel;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = COLOURS.line;
  ctx.strokeRect(x, y, width, height);
  const half = width / 2;
  layout.maps.forEach((map, index) => {
    const coverage = map.coverage;
    const xOffset = x + index * half + 20;
    ctx.fillStyle = COLOURS.text;
    setFont(ctx, 16, 700);
    ctx.fillText(`${map.title} coverage`, xOffset, y + 28);
    ctx.fillStyle = COLOURS.muted;
    setFont(ctx, 14);
    ctx.fillText(`${coverage.seats} result seats · ${coverage.mappedSeats}/${coverage.seats} boundary features · ${coverage.completeVoteSeats}/${coverage.seats} complete party-vote rows`, xOffset, y + 54);
    ctx.fillText(coverage.featureCollectionPresent ? 'Boundary file loaded' : 'Boundary file unavailable; map placeholder shown', xOffset, y + 79);
  });
  ctx.strokeStyle = COLOURS.line;
  ctx.beginPath();
  ctx.moveTo(x + half, y + 14);
  ctx.lineTo(x + half, y + height - 14);
  ctx.stroke();
}

function drawPartyTable(ctx, layout) {
  const x = PAD;
  const width = WIDTH - PAD * 2;
  ctx.fillStyle = COLOURS.text;
  setFont(ctx, 24, 700);
  ctx.fillText(layout.sameBoundaries ? 'Party balance in the selected area' : 'Area party totals', x, layout.partyTitleTop);
  ctx.fillStyle = COLOURS.muted;
  setFont(ctx, 13);
  ctx.fillText('Vote shares are shown only when source totals are complete for every constituency in the selected area.', x, layout.partyTitleTop + 22);

  const top = layout.partyTableTop;
  const columns = [x, x + 520, x + 650, x + 780, x + 940, x + 1100, x + 1260];
  const labels = ['Party', 'Selected seats', 'Baseline seats', 'Seats ±', 'Selected vote', 'Baseline vote', 'Vote pp ±'];
  ctx.fillStyle = COLOURS.panel;
  ctx.fillRect(x, top, width, 30);
  ctx.fillStyle = COLOURS.muted;
  setFont(ctx, 13, 700);
  labels.forEach((label, index) => ctx.fillText(label, columns[index] + (index ? 8 : 10), top + 20));
  layout.partyRows.forEach((row, index) => {
    const y = layout.partyRowsTop + index * PARTY_ROW_HEIGHT;
    ctx.fillStyle = index % 2 ? COLOURS.panelAlt : COLOURS.panel;
    ctx.fillRect(x, y, width, PARTY_ROW_HEIGHT);
    ctx.fillStyle = COLOURS.text;
    setFont(ctx, 14, index === 0 ? 700 : 400);
    row.forEach((value, cellIndex) => fitText(ctx, value, columns[cellIndex] + (cellIndex ? 8 : 10), y + 17,
      [494, 124, 124, 154, 154, 154, 230][cellIndex]));
    ctx.strokeStyle = COLOURS.line;
    ctx.beginPath();
    ctx.moveTo(x, y + PARTY_ROW_HEIGHT);
    ctx.lineTo(x + width, y + PARTY_ROW_HEIGHT);
    ctx.stroke();
  });
}

function drawSeatResults(ctx, layout) {
  if (!layout.sameBoundaries) return;
  const x = PAD;
  const width = WIDTH - PAD * 2;
  ctx.fillStyle = COLOURS.text;
  setFont(ctx, 24, 700);
  ctx.fillText(`Complete filtered matched-seat results · ${layout.filteredPairCount}`, x, layout.resultsTitleTop);
  ctx.fillStyle = COLOURS.muted;
  setFont(ctx, 13);
  ctx.fillText(`${layout.filteredPairCount} of ${layout.unfilteredMatchedCount} matched seats included; all filtered rows are in this image.`, x, layout.resultsTitleTop + 22);
  const gap = 24;
  const panelWidth = (width - gap) / 2;
  const titleY = layout.resultsTableTop;
  const columns = [0, 180, 450, 580];
  for (let column = 0; column < 2; column += 1) {
    const panelX = x + column * (panelWidth + gap);
    ctx.fillStyle = COLOURS.panel;
    ctx.fillRect(panelX, titleY, panelWidth, 30);
    ctx.fillStyle = COLOURS.muted;
    setFont(ctx, 11, 700);
    ['Constituency', 'Baseline → selected winner', 'Margin', 'Turnout Δ'].forEach((label, index) => {
      ctx.fillText(label, panelX + columns[index] + 8, titleY + 20);
    });
  }
  layout.seatRows.forEach((row, index) => {
    const column = index % 2;
    const rowIndex = Math.floor(index / 2);
    const panelX = x + column * (panelWidth + gap);
    const y = titleY + 30 + rowIndex * SEAT_ROW_HEIGHT;
    ctx.fillStyle = rowIndex % 2 ? COLOURS.panelAlt : COLOURS.panel;
    ctx.fillRect(panelX, y, panelWidth, SEAT_ROW_HEIGHT);
    ctx.fillStyle = COLOURS.text;
    setFont(ctx, 11, 700);
    fitText(ctx, row.name, panelX + 8, y + 16, 164);
    setFont(ctx, 11);
    fitText(ctx, `${text(row.previousParty)} → ${text(row.currentParty)}`, panelX + columns[1] + 8, y + 16, 252);
    fitText(ctx, Number.isFinite(row.majority) ? `${Math.round(row.majority).toLocaleString('en-GB')} votes` : 'n/a', panelX + columns[2] + 8, y + 16, 112);
    fitText(ctx, Number.isFinite(row.turnoutDelta) ? `${row.turnoutDelta > 0 ? '+' : ''}${(row.turnoutDelta * 100).toFixed(1)} pp` : 'n/a', panelX + columns[3] + 8, y + 16, 132);
    ctx.strokeStyle = COLOURS.line;
    ctx.beginPath();
    ctx.moveTo(panelX, y + SEAT_ROW_HEIGHT);
    ctx.lineTo(panelX + panelWidth, y + SEAT_ROW_HEIGHT);
    ctx.stroke();
  });
}

function drawCitations(ctx, layout) {
  const x = PAD;
  const width = WIDTH - PAD * 2;
  ctx.fillStyle = COLOURS.line;
  ctx.fillRect(x, layout.citationTop, width, 1);
  ctx.fillStyle = COLOURS.text;
  setFont(ctx, 17, 700);
  ctx.fillText('Sources and boundary citations', x, layout.citationTop + 27);
  const gap = 32;
  const colWidth = (width - gap) / 2;
  layout.citations.forEach((citation, index) => {
    const colX = x + index * (colWidth + gap);
    const label = index === 0 ? 'Selected election' : 'Comparison election';
    ctx.fillStyle = COLOURS.accent;
    setFont(ctx, 13, 700);
    ctx.fillText(label, colX, layout.citationTop + 52);
    ctx.fillStyle = COLOURS.muted;
    setFont(ctx, 12);
    wrapText(ctx, citation.citation, colX, layout.citationTop + 72, colWidth - 10, 17, 8);
  });
  ctx.fillStyle = COLOURS.muted;
  setFont(ctx, 11);
  ctx.fillText('GennyTracks · comparison export', x, layout.height - 22);
}

export function renderComparisonPng({ ...data } = {}) {
  if (typeof document === 'undefined') throw new Error('PNG export requires a browser document.');
  const layout = buildComparisonPngLayout(data);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a canvas for the comparison PNG.');
  ctx.fillStyle = COLOURS.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawHeader(ctx, layout);

  const innerWidth = layout.width - PAD * 2;
  const panelWidth = (innerWidth - GAP) / 2;
  layout.maps.forEach((map, index) => drawMapPanel(ctx, map, {
    x: PAD + index * (panelWidth + GAP), y: layout.mapTop, width: panelWidth, height: layout.mapHeight,
  }, layout.width, { sameBoundaries: layout.sameBoundaries }));
  drawCoverage(ctx, layout);
  drawPartyTable(ctx, layout);
  drawSeatResults(ctx, layout);
  drawCitations(ctx, layout);
  return { canvas, layout };
}

export async function downloadComparisonPng(data) {
  const { canvas } = renderComparisonPng(data);
  const blob = await new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('This browser does not support PNG canvas export.'));
      return;
    }
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The comparison PNG could not be created.')), 'image/png');
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `genny-tracks-${data.election?.id || 'election'}-vs-${data.comparison?.id || 'comparison'}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
