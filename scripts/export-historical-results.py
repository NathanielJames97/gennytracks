#!/usr/bin/env python3
"""Export the Commons Library SQLite snapshot into build-friendly JSON.

The committed SQLite database is the primary input. This export deliberately
includes four declared results plus the Library's notional 2019 results on the
2024 boundary set. The latter allows a direct, same-boundary comparison with
the declared 2024 result.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "source" / "hoc" / "psephology.db"
DEFAULT_OUT = ROOT / "data" / "source" / "hoc" / "historical-results.json"

ELECTIONS = {
    1: {"id": "2010", "year": 2010, "boundarySetId": "2010"},
    2: {"id": "2015", "year": 2015, "boundarySetId": "2010"},
    3: {"id": "2017", "year": 2017, "boundarySetId": "2010"},
    4: {"id": "2019", "year": 2019, "boundarySetId": "2010"},
    5: {
        "id": "2019-notional-2024",
        "year": 2019,
        "boundarySetId": "2024",
        "isNotional": True,
        "label": "2019 notional on 2024 boundaries",
    },
}

EXPECTED_COUNTRY_BOUNDARIES = {
    "2010": {"England": 6, "Wales": 7, "Scotland": 8, "Northern Ireland": 5},
    "2024": {"England": 1, "Wales": 2, "Scotland": 3, "Northern Ireland": 4},
}


def rows_by_election(conn: sqlite3.Connection) -> list[dict]:
    ids = tuple(ELECTIONS)
    placeholders = ",".join("?" for _ in ids)

    areas = conn.execute(
        f"""
        SELECT
          ge.id AS general_election_id,
          ge.polling_on,
          ge.is_notional AS election_is_notional,
          e.id AS constituency_election_id,
          e.valid_vote_count,
          e.invalid_vote_count,
          e.is_invalid_vote_count_known,
          e.majority,
          e.declaration_at,
          eg.population_count AS electorate,
          ca.name,
          ca.geographic_code,
          ca.boundary_set_id,
          ca.english_region_id,
          countries.name AS country,
          area_types.area_type,
          regions.name AS region,
          rs.is_from_commons_speaker,
          rs.is_from_independent,
          rs.is_to_commons_speaker,
          rs.is_to_independent,
          from_party.name AS gained_from,
          to_party.name AS winner_party
        FROM general_elections ge
        JOIN elections e ON e.general_election_id = ge.id
        JOIN constituency_groups cg ON cg.id = e.constituency_group_id
        JOIN constituency_areas ca ON ca.id = cg.constituency_area_id
        JOIN countries ON countries.id = ca.country_id
        JOIN constituency_area_types area_types ON area_types.id = ca.constituency_area_type_id
        JOIN electorates eg ON eg.id = e.electorate_id
        LEFT JOIN english_regions regions ON regions.id = ca.english_region_id
        LEFT JOIN result_summaries rs ON rs.id = e.result_summary_id
        LEFT JOIN political_parties from_party ON from_party.id = rs.from_political_party_id
        LEFT JOIN political_parties to_party ON to_party.id = rs.to_political_party_id
        WHERE ge.id IN ({placeholders})
        ORDER BY ge.polling_on, ge.is_notional, ca.geographic_code
        """,
        ids,
    ).fetchall()

    candidates = conn.execute(
        f"""
        SELECT
          c.election_id,
          c.candidate_given_name,
          c.candidate_family_name,
          c.candidate_is_sitting_mp,
          c.candidate_is_former_mp,
          c.is_standing_as_commons_speaker,
          c.is_standing_as_independent,
          c.is_notional,
          c.is_notional_political_party_aggregate,
          c.result_position,
          c.is_winning_candidacy,
          c.vote_count,
          c.vote_share,
          c.vote_change,
          genders.gender,
          parties.name AS party,
          parties.abbreviation AS abbreviation
        FROM general_elections ge
        JOIN elections e ON e.general_election_id = ge.id
        JOIN candidacies c ON c.election_id = e.id
        LEFT JOIN genders ON genders.id = c.candidate_gender_id
        LEFT JOIN certifications cert
          ON cert.candidacy_id = c.id
          AND cert.adjunct_to_certification_id IS NULL
        LEFT JOIN political_parties parties ON parties.id = cert.political_party_id
        WHERE ge.id IN ({placeholders})
        ORDER BY ge.polling_on, ge.is_notional, c.election_id, c.result_position
        """,
        ids,
    ).fetchall()

    candidate_index: dict[int, list[dict]] = {}
    for row in candidates:
        candidate_index.setdefault(row[0], []).append(
            {
                "name": " ".join(
                    part for part in (row[1], row[2]) if part
                ) or None,
                "party": row[15] or ("Independent" if row[6] else "Unspecified"),
                "abbrev": row[16] or ("Ind" if row[6] else "—"),
                "gender": row[14],
                "votes": row[11],
                "share": row[12],
                "change": row[13],
                "rank": row[9],
                "winner": bool(row[10]),
                "sittingMp": bool(row[3]),
                "formerMp": bool(row[4]),
                "speaker": bool(row[5]),
                "notional": bool(row[7]),
                "notionalAggregate": bool(row[8]),
            }
        )

    elections: dict[int, dict] = {}
    for row in areas:
        (
            general_id,
            polling_on,
            election_is_notional,
            constituency_election_id,
            valid_vote_count,
            invalid_vote_count,
            invalid_vote_count_known,
            majority,
            declaration_at,
            electorate,
            name,
            geographic_code,
            boundary_set_id,
            _english_region_id,
            country,
            area_type,
            region,
            from_speaker,
            from_independent,
            to_speaker,
            to_independent,
            gained_from,
            winner_party,
        ) = row

        metadata = ELECTIONS[general_id]
        expected_boundary = EXPECTED_COUNTRY_BOUNDARIES[metadata["boundarySetId"]].get(country)
        if boundary_set_id != expected_boundary:
            raise ValueError(
                f"Unexpected boundary set {boundary_set_id} for {metadata['id']} / {country}; "
                f"expected {expected_boundary}"
            )

        result_candidates = candidate_index.get(constituency_election_id, [])
        if not result_candidates:
            raise ValueError(f"No candidates for {metadata['id']} / {name}")
        result_candidates.sort(key=lambda candidate: candidate["rank"] or 999)
        valid_votes_from_candidates = sum(candidate["votes"] for candidate in result_candidates)
        if valid_votes_from_candidates != valid_vote_count:
            raise ValueError(
                f"Vote total mismatch for {metadata['id']} / {name}: "
                f"{valid_votes_from_candidates} != {valid_vote_count}"
            )
        if not geographic_code:
            raise ValueError(f"Missing geographic code for {metadata['id']} / {name}")

        result = {
            "id": geographic_code,
            "areaCode": geographic_code,
            "name": name,
            "country": country,
            "region": region or country,
            "type": area_type,
            "electorate": electorate,
            "validVotes": valid_vote_count,
            "invalidVotes": invalid_vote_count,
            "invalidVotesKnown": bool(invalid_vote_count_known),
            "majority": majority,
            "majorityShare": majority / valid_vote_count if valid_vote_count else None,
            "turnout": valid_vote_count / electorate if electorate else None,
            "winnerVotes": result_candidates[0]["votes"],
            "winnerShare": result_candidates[0]["share"],
            "party": result_candidates[0]["party"],
            "partyGroup": result_candidates[0]["party"],
            "firstParty": result_candidates[0]["party"],
            "secondParty": result_candidates[1]["party"] if len(result_candidates) > 1 else None,
            "resultType": None if metadata.get("isNotional") else (
                "gain" if gained_from and gained_from != winner_party else "hold"
            ),
            "gainedFrom": gained_from if gained_from and gained_from != winner_party else None,
            "declarationTime": declaration_at,
            "member": result_candidates[0]["name"],
            "memberGender": result_candidates[0]["gender"],
            "colour": None,
            "photo": None,
            "notes": None,
            "candidates": result_candidates,
        }

        if metadata.get("isNotional"):
            result["resultType"] = "notional"
            result["gainedFrom"] = None
            result["member"] = None
            result["memberGender"] = None
        elections.setdefault(
            general_id,
            {
                **metadata,
                "date": polling_on,
                "isNotional": bool(election_is_notional),
                "seats": [],
            },
        )["seats"].append(result)

    output = []
    for general_id, metadata in ELECTIONS.items():
        election = elections.get(general_id)
        if not election:
            raise ValueError(f"Missing general election {metadata['id']}")
        if len(election["seats"]) != 650:
            raise ValueError(
                f"Expected 650 seats for {metadata['id']}, got {len(election['seats'])}"
            )
        codes = [seat["areaCode"] for seat in election["seats"]]
        if len(set(codes)) != 650:
            raise ValueError(f"Duplicate constituency codes for {metadata['id']}")
        output.append(election)

    return output


def boundary_crosswalk(conn: sqlite3.Connection) -> list[dict]:
    """Official population/residential/area overlap from 2010–19 to 2024 seats."""
    rows = conn.execute(
        """
        SELECT
          old.name,
          old.geographic_code,
          old_country.name,
          current.name,
          current.geographic_code,
          current_country.name,
          overlaps.from_constituency_population,
          overlaps.to_constituency_population,
          overlaps.from_constituency_residential,
          overlaps.to_constituency_residential,
          overlaps.from_constituency_geographical,
          overlaps.to_constituency_geographical
        FROM constituency_area_overlaps overlaps
        JOIN constituency_areas old
          ON old.id = overlaps.from_constituency_area_id
        JOIN constituency_areas current
          ON current.id = overlaps.to_constituency_area_id
        JOIN countries old_country ON old_country.id = old.country_id
        JOIN countries current_country ON current_country.id = current.country_id
        WHERE old.boundary_set_id IN (5, 6, 7, 8)
          AND current.boundary_set_id IN (1, 2, 3, 4)
        ORDER BY old.geographic_code, current.geographic_code
        """
    ).fetchall()

    output = [
        {
            "fromName": row[0],
            "fromCode": row[1],
            "fromCountry": row[2],
            "toName": row[3],
            "toCode": row[4],
            "toCountry": row[5],
            "fromPopulationShare": row[6],
            "toPopulationShare": row[7],
            "fromResidentialShare": row[8],
            "toResidentialShare": row[9],
            "fromAreaShare": row[10],
            "toAreaShare": row[11],
        }
        for row in rows
    ]
    old_codes = {row["fromCode"] for row in output}
    current_codes = {row["toCode"] for row in output}
    if len(old_codes) != 650 or len(current_codes) != 650:
        raise ValueError(
            f"Boundary crosswalk must span 650 old and new seats; got {len(old_codes)} and {len(current_codes)}"
        )

    for field, key in (
        ("fromPopulationShare", "fromCode"),
        ("toPopulationShare", "toCode"),
    ):
        totals: dict[str, float] = {}
        for row in output:
            totals[row[key]] = totals.get(row[key], 0.0) + row[field]
        if any(abs(total - 1.0) > 0.001 for total in totals.values()):
            raise ValueError(f"Boundary crosswalk {field} fractions do not sum to 1")

    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if not args.database.is_file():
        raise SystemExit(f"Missing source database: {args.database}")

    digest = hashlib.sha256(args.database.read_bytes()).hexdigest()
    with sqlite3.connect(args.database) as conn:
        conn.row_factory = None
        elections = rows_by_election(conn)
        overlaps = boundary_crosswalk(conn)

    document = {
        "schemaVersion": 1,
        "source": {
            "name": "UK Parliament Election Results",
            "url": "https://electionresults.parliament.uk/",
            "databaseUrl": "https://raw.githubusercontent.com/ukparliament/psephology-datasette/main/psephology.db",
            "license": "Open Parliament Licence v3.0",
            "databaseSha256": digest,
            "coverage": "2010, 2015, 2017, 2019 actual, and 2019 notional on 2024 boundaries",
        },
        "elections": elections,
        "boundaryCrosswalk": overlaps,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {args.output} ({len(elections)} election datasets, 650 seats each; "
        f"{len(overlaps)} official boundary-overlap links)"
    )


if __name__ == "__main__":
    main()
