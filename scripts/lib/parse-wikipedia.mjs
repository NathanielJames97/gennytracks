// Parses the saved Wikipedia article
// "List of MPs elected in the 2024 United Kingdom general election"
// into structured per-constituency records.
//
// The page's MP table has a 5-column header but 7 <td> per row, because the
// two party columns each carry an empty colour-swatch cell:
//
//   header: Constituency | Party of notional incumbent at 2019 | Member returned
//           | Party of incumbent at 2024 | Notes
//   row:    constituency | swatch | party2019 | member | swatch | party2024 | notes
//
// So the member cell is located by its data-sort-value attribute and the
// remaining columns are read relative to it, which survives column reordering.

import { readFileSync } from 'node:fs';

const ANCHOR = 'Member returned';

/** Strip tags and collapse whitespace. */
function text(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function splitRows(tableHtml) {
  // Drop <thead> so header cells are never mistaken for data.
  const bodyStart = tableHtml.indexOf('<tbody');
  const body = bodyStart === -1 ? tableHtml : tableHtml.slice(bodyStart);
  return body.split(/(?=<tr[\s>])/).filter((r) => r.includes('<td'));
}

function cells(rowHtml) {
  return rowHtml.match(/<td[\s\S]*?<\/td>/g) || [];
}

/** Normalise a constituency name for cross-source matching. */
export function normaliseName(name) {
  return decodeEntities(name)
    .replace(/\s+/g, ' ')
    // geojson capitalises mid-name "The" ("South Holland and The Deepings")
    .replace(/\bthe\b/gi, 'The')
    .replace(/[‐-―]/g, '-')
    .trim()
    .toLowerCase();
}

// The article labels a few affiliations inconsistently ("Labour Co-op" vs
// "Labour", "Scottish National Party" vs "Scottish National"). Map every label
// onto the canonical party so seats aggregate correctly, and keep the raw label
// for display. "Speaker" is deliberately not merged into any party: the Speaker
// is elected by the House rather than fielded as a party candidate.
const PARTY_GROUPS = {
  Labour: 'Labour',
  'Labour Co-op': 'Labour',
  Conservative: 'Conservative',
  'Liberal Democrats': 'Liberal Democrats',
  'Scottish National': 'Scottish National',
  'Scottish National Party': 'Scottish National',
  'Reform UK': 'Reform UK',
  'Democratic Unionist': 'Democratic Unionist',
  'Sinn Féin': 'Sinn Féin',
  'Social Democratic and Labour': 'Social Democratic and Labour',
  Plaid: 'Plaid Cymru',
  'Plaid Cymru': 'Plaid Cymru',
  Green: 'Green',
  Independent: 'Independent',
  Speaker: 'Speaker',
  Alliance: 'Alliance',
  'Ulster Unionist': 'Ulster Unionist',
  'Traditional Unionist Voice': 'Traditional Unionist Voice',
};

export function partyGroup(party) {
  if (!party) return null;
  return PARTY_GROUPS[party] || party;
}

export function parseWikipediaHtml(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');

  const anchor = html.indexOf(ANCHOR);
  if (anchor === -1) throw new Error(`Could not find "${ANCHOR}" in ${htmlPath}`);

  const tableStart = html.lastIndexOf('<table', anchor);
  const tableEnd = html.indexOf('</table>', anchor);
  if (tableStart === -1 || tableEnd === -1) throw new Error('Could not isolate the MP table');
  const table = html.slice(tableStart, tableEnd);

  const rows = splitRows(table);
  const records = [];
  const problems = [];

  rows.forEach((row, idx) => {
    const tds = cells(row);

    // Locate the member cell. The name is always wrapped in <b>; most rows also
    // carry a data-sort-value="Surname, Forename" sort key, but photo-less rows
    // (e.g. Milton Keynes Central) have neither attribute, so <b> is the reliable
    // marker and the sort key is treated as optional extra detail.
    let mi = tds.findIndex((c) => c.includes('<b>'));
    if (mi === -1) mi = tds.findIndex((c) => c.includes('data-sort-value'));
    if (mi === -1) {
      problems.push({ row: idx, reason: 'no member cell' });
      return;
    }
    if (mi !== 3) {
      problems.push({ row: idx, reason: `member cell at unexpected index ${mi}` });
    }

    const constituency = text(tds[0] || '');
    if (!constituency) {
      problems.push({ row: idx, reason: 'empty constituency' });
      return;
    }

    const memberCell = tds[mi];

    // Display name is the <b><a>…</a></b>; the sort key is "Surname, Forename".
    const boldMatch = memberCell.match(/<b>[\s\S]*?<\/b>/);
    const memberName = boldMatch ? text(boldMatch[0]) : text(memberCell);

    const sortKey = decodeEntities(
      (memberCell.match(/data-sort-value="([^"]*)"/) || [, ''])[1],
    );

    // Resolve the person's article link layout-independently. Wikipedia marks
    // these up two ways:
    //   <a File:…><img …></a><br><b><a …/wiki/Person>Name</a></b>   (with photo)
    //   <a …/wiki/Person><b>Name</b></a>                            (no photo)
    // so instead of searching inside <b>, take the first /wiki/ link in the
    // cell that is not a File: (i.e. not the portrait image).
    const cellLinks = [
      ...memberCell.matchAll(/href="https:\/\/en\.wikipedia\.org\/wiki\/([^"#?]*)"/g),
    ].map((m) => m[1]);
    const memberLink = cellLinks.find((slug) => !/^File:/i.test(slug)) || null;

    const imgMatch = memberCell.match(/<img src="\.\/[^"]*_files\/([^"]+)"/);
    // Filenames can carry HTML entities for apostrophes (e.g. Brendan O&#39;Hara).
    const photoFile = imgMatch ? decodeEntities(decodeURIComponent(imgMatch[1])) : null;

    // 2024 party + colour sit in the two cells after the member cell.
    const swatchCell = tds[mi + 1] || '';
    const partyCell = tds[mi + 2] || '';
    const colourMatch = swatchCell.match(/background-color:\s*(#[0-9A-Fa-f]{3,6})/);

    const partyLink = (partyCell.match(/href="https:\/\/en\.wikipedia\.org\/wiki\/([^"#?]*)"/) || [, ''])[1];
    const party = text(partyCell) || null;

    const notes = text(tds[mi + 3] || '') || null;

    records.push({
      constituency,
      key: normaliseName(constituency),
      member: memberName || null,
      memberSort: sortKey || null,
      memberWiki: memberLink ? `https://en.wikipedia.org/wiki/${memberLink}` : null,
      photoFile,
      party,
      partyGroup: partyGroup(party),
      partySlug: partyLink || null,
      colour: colourMatch ? colourMatch[1] : null,
      notes,
    });
  });

  return { records, problems };
}

export default parseWikipediaHtml;
