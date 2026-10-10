#!/usr/bin/env python3
"""Build a derived land-area crosswalk between the committed 2001 and 2010 boundary sets.

This is an offline preparation step. Normal app builds consume its committed JSON and do not
require Shapely or pyproj. Run npm run build:data first to create the map boundary files.
"""
from __future__ import annotations

import gzip
import hashlib
import html
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

try:
    import shapely
    from pyproj import Transformer
    from shapely import is_valid, make_valid, union_all
    from shapely.geometry import shape
    from shapely.strtree import STRtree
except ImportError as error:
    raise SystemExit(
        "Install the offline geography tools with: "
        "python -m pip install -r scripts/requirements-geography.txt"
    ) from error

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "source" / "boundaries"
GENERATED = ROOT / "public" / "data" / "boundaries"
OUTPUT = SOURCE / "crosswalk-2001-to-2010.json"
PROJECTION = "EPSG:3035"  # ETRS89 / LAEA Europe, equal-area for area weighting.
MIN_COVERAGE = 0.995
MAX_COVERAGE = 1.005
MIN_INTERSECTION_M2 = 0.1


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized(value: object) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", str(value)))
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = re.sub(r"['\u2018\u2019]", "", value)
    value = re.sub(r"[^\w,;]+", " ", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip().lower()


def polygon_parts(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type == "MultiPolygon":
        return list(geometry.geoms)
    parts = []
    for child in getattr(geometry, "geoms", ()):
        parts.extend(polygon_parts(child))
    return parts


def repair_polygonal(geometry, label: str):
    repaired = not is_valid(geometry)
    if repaired:
        geometry = make_valid(geometry)
    parts = polygon_parts(geometry)
    if not parts:
        raise ValueError(f"{label} has no polygonal area after validity repair")
    geometry = union_all(parts) if len(parts) > 1 else parts[0]
    if not is_valid(geometry):
        geometry = make_valid(geometry)
        parts = polygon_parts(geometry)
        if not parts:
            raise ValueError(f"{label} could not be repaired to polygonal geometry")
        geometry = union_all(parts) if len(parts) > 1 else parts[0]
    if not is_valid(geometry) or geometry.area <= 0:
        raise ValueError(f"{label} remains invalid or has zero area")
    return geometry, repaired


def read_ni_assignments(wards_path: Path, order_path: Path):
    wards = json.loads(wards_path.read_text(encoding="utf-8"))["features"]
    by_district = defaultdict(list)
    by_id = {}
    for ward in wards:
        props = ward["properties"]
        by_district[normalized(props["LGD"])].append(ward)
        by_id[props["WARD93_ID"]] = ward

    order = order_path.read_text(encoding="utf-8")
    assignments = []
    rows = re.findall(r"<tr\b[^>]*>([\s\S]*?)</tr>", order, re.IGNORECASE)
    for row in rows:
        cells = re.findall(r"<td\b[^>]*>([\s\S]*?)</td>", row, re.IGNORECASE)
        if len(cells) < 2 or not re.search(r"(following wards|local government district)", cells[1], re.IGNORECASE):
            continue
        name = html.unescape(re.sub(r"<[^>]+>", " ", cells[0]))
        name = re.sub(r"\s*\([^)]*\)\s*$", "", re.sub(r"\s+", " ", name).strip())
        paragraphs = re.findall(r"<Text>([\s\S]*?)</Text>", cells[1], re.IGNORECASE) or [cells[1]]
        assigned = []
        for raw in paragraphs:
            text = re.sub(r";\s*and\s*$", "", normalized(raw), flags=re.IGNORECASE).strip()
            whole = re.match(r"^the local government district of (.+?)[.;]?$", text, re.IGNORECASE)
            if whole:
                district = by_district.get(normalized(whole.group(1).rstrip(".;")))
                if district is None:
                    raise ValueError(f"Order names missing LGD {whole.group(1)}")
                assigned.extend(district)
                continue
            group = re.match(
                r"^the following wards of the local government district of (.+?),\s*namely,?\s*(.+?)[.;]?$",
                text,
                re.IGNORECASE,
            )
            if not group:
                raise ValueError(f"Cannot parse statutory NI ward assignment: {text}")
            district = by_district.get(normalized(group.group(1)))
            if district is None:
                raise ValueError(f"Order names missing ward district {group.group(1)}")
            aliases = {}
            if normalized(district[0]["properties"]["LGD"]) == "lisburn":
                aliases["lisnagarvey"] = "lisnagarvy"
            candidates = sorted(
                set(normalized(item["properties"]["WARDS"]) for item in district) | set(aliases),
                key=len,
                reverse=True,
            )
            remaining = re.sub(r";\s*and\s*$", "", normalized(group.group(2)), flags=re.IGNORECASE)
            remaining = remaining.rstrip(".;").strip()
            selected = []
            while remaining:
                found = next(
                    (candidate for candidate in candidates
                     if remaining == candidate
                     or remaining.startswith(candidate + ", ")
                     or remaining.startswith(candidate + " and ")),
                    None,
                )
                if not found:
                    raise ValueError(f"Unmatched statutory NI ward list item: {remaining}")
                selected.append(aliases.get(found, found))
                remaining = remaining[len(found):].strip()
                if remaining.startswith(","):
                    remaining = remaining[1:].strip()
                elif remaining.startswith("and "):
                    remaining = remaining[4:].strip()
                elif remaining:
                    raise ValueError(f"Unexpected statutory text after {found}: {remaining}")
            by_name = {normalized(item["properties"]["WARDS"]): item for item in district}
            assigned.extend(by_name[item] for item in selected)

        ids = [item["properties"]["WARD93_ID"] for item in assigned]
        if not ids or len(ids) != len(set(ids)):
            raise ValueError(f"Empty or duplicate ward assignment for {name}")
        assignments.append({"name": name, "wardIds": ids})

    counts = defaultdict(int)
    for item in assignments:
        for ward_id in item["wardIds"]:
            counts[ward_id] += 1
    expected = {item["properties"]["WARD93_ID"] for item in wards}
    if len(assignments) != 18 or set(counts) != expected or any(count != 1 for count in counts.values()):
        raise ValueError(
            f"NI order coverage failed: seats={len(assignments)}, wards={len(counts)}/{len(expected)}, "
            f"repeated={sum(count != 1 for count in counts.values())}"
        )
    return wards, by_id, assignments


def load_geometries():
    old_collection = json.loads((GENERATED / "2001.geojson").read_text(encoding="utf-8"))
    new_collection = json.loads((GENERATED / "2010.geojson").read_text(encoding="utf-8"))
    if len(old_collection["features"]) != 659 or len(new_collection["features"]) != 650:
        raise ValueError("Run npm run build:data first; expected 659 2001 and 650 2010 features")

    ward_path = SOURCE / "northern-ireland-wards-1993.geojson"
    order_path = SOURCE / "parliamentary-constituencies-ni-1995.xml"
    wards, ward_by_id, assignments = read_ni_assignments(ward_path, order_path)
    ward_geometries = {}
    repaired_wards = 0
    for ward in wards:
        ward_id = ward["properties"]["WARD93_ID"]
        geom, repaired = repair_polygonal(shape(ward["geometry"]), f"NI ward {ward_id}")
        ward_geometries[ward_id] = geom
        repaired_wards += int(repaired)
    ni_by_name = {}
    for assignment in assignments:
        geometries = [ward_geometries[ward_id] for ward_id in assignment["wardIds"]]
        ni_by_name[normalized(assignment["name"])] = union_all(geometries)

    transformer = Transformer.from_crs("EPSG:4326", PROJECTION, always_xy=True)
    repair_counts = {"2001": 0, "2010": 0}

    def projected_features(features, epoch):
        projected = []
        for feature in features:
            props = feature["properties"]
            label = f"{epoch} {props['id']} {props['name']}"
            if epoch == "2001" and str(props["id"]).startswith("NI1995-"):
                geom = ni_by_name.get(normalized(props["name"]))
                if geom is None:
                    raise ValueError(f"No statutory NI geometry found for {props['name']}")
            else:
                geom = shape(feature["geometry"])
            geom, repaired = repair_polygonal(geom, label)
            repair_counts[epoch] += int(repaired)
            geom = shapely.transform(geom, transformer.transform, interleaved=False)
            if not is_valid(geom) or geom.area <= 0:
                raise ValueError(f"Projected geometry is invalid for {label}")
            projected.append({"id": str(props["id"]), "name": props["name"], "geometry": geom})
        return projected

    return (
        projected_features(old_collection["features"], "2001"),
        projected_features(new_collection["features"], "2010"),
        repair_counts,
        repaired_wards,
    )


def main():
    if sys.version_info < (3, 11):
        raise SystemExit("The offline geography step requires Python 3.11 or later")
    old_features, new_features, repairs, repaired_wards = load_geometries()
    new_geometries = [item["geometry"] for item in new_features]
    tree = STRtree(new_geometries)
    from_area = {item["id"]: item["geometry"].area for item in old_features}
    to_area = {item["id"]: item["geometry"].area for item in new_features}
    covered_from = defaultdict(float)
    covered_to = defaultdict(float)
    overlaps = []

    for old in old_features:
        for index in tree.query(old["geometry"]):
            new = new_features[int(index)]
            if not old["geometry"].intersects(new["geometry"]):
                continue
            area_m2 = old["geometry"].intersection(new["geometry"]).area
            if area_m2 <= MIN_INTERSECTION_M2:
                continue
            covered_from[old["id"]] += area_m2
            covered_to[new["id"]] += area_m2
            overlaps.append({
                "fromCode": old["id"],
                "fromName": old["name"],
                "toCode": new["id"],
                "toName": new["name"],
                "fromAreaShare": round(area_m2 / from_area[old["id"]], 10),
                "toAreaShare": round(area_m2 / to_area[new["id"]], 10),
                "overlapAreaKm2": round(area_m2 / 1_000_000, 8),
            })

    old_ids = {item["id"] for item in old_features}
    new_ids = {item["id"] for item in new_features}
    if {item["fromCode"] for item in overlaps} != old_ids:
        raise ValueError("At least one 2001 constituency has no positive-area successor")
    if {item["toCode"] for item in overlaps} != new_ids:
        raise ValueError("At least one 2010 constituency has no positive-area predecessor")

    from_coverage = {code: covered_from[code] / from_area[code] for code in old_ids}
    to_coverage = {code: covered_to[code] / to_area[code] for code in new_ids}
    min_from = min(from_coverage.items(), key=lambda item: item[1])
    max_from = max(from_coverage.items(), key=lambda item: item[1])
    min_to = min(to_coverage.items(), key=lambda item: item[1])
    max_to = max(to_coverage.items(), key=lambda item: item[1])
    print(f"Shapely {shapely.__version__}; pyproj {Transformer.__module__}")
    print(f"Projected to {PROJECTION}; repaired invalid seat polygons: {repairs}; repaired source wards: {repaired_wards}")
    print(f"Positive-area links: {len(overlaps)}")
    print(f"2001 coverage range: {min_from[1]:.6%} ({min_from[0]}) to {max_from[1]:.6%} ({max_from[0]})")
    print(f"2010 coverage range: {min_to[1]:.6%} ({min_to[0]}) to {max_to[1]:.6%} ({max_to[0]})")
    if min_from[1] < MIN_COVERAGE or max_from[1] > MAX_COVERAGE or min_to[1] < MIN_COVERAGE or max_to[1] > MAX_COVERAGE:
        raise ValueError(
            f"Overlay coverage is outside {MIN_COVERAGE:.3%}–{MAX_COVERAGE:.3%}; "
            "review geometry sources before publishing links"
        )

    overlaps.sort(key=lambda row: (row["fromCode"], row["toCode"]))
    metadata = {
        "schemaVersion": 1,
        "sourceId": "constructed-2001-election-boundaries",
        "inputSourceIds": ["constructed-2001-election-boundaries", "ons-2010-boundaries"],
        "classification": "derived",
        "measures": ["area"],
        "method": "Pairwise polygon intersection in EPSG:3035 (ETRS89 / LAEA Europe); shares are intersected land area divided by the source-seat land area.",
        "geometryNote": "The overlay uses the simplified boundary files generated for the map. Invalid simplified polygons are repaired with GEOS MakeValid for this calculation. Northern Ireland 2001 shapes are dissolved directly from the 1995 Order's assigned OSNI 1993 wards.",
        "projection": PROJECTION,
        "shareTolerance": 0.005,
        "coverage": {
            "fromMin": round(min_from[1], 8), "fromMax": round(max_from[1], 8),
            "toMin": round(min_to[1], 8), "toMax": round(max_to[1], 8),
            "minimumRequired": MIN_COVERAGE, "maximumAllowed": MAX_COVERAGE,
        },
        "repairs": {"seatPolygons": repairs, "sourceWards": repaired_wards},
        "sourceHashes": {
            "2001Boundary": sha256(SOURCE / "constituencies-2001.geojson.gz"),
            "2010Boundary": sha256(SOURCE / "constituencies-2019.geojson.gz"),
            "northernIrelandOrder": sha256(SOURCE / "parliamentary-constituencies-ni-1995.xml"),
            "northernIrelandWards": sha256(SOURCE / "northern-ireland-wards-1993.geojson"),
        },
        "fromBoundarySetId": "2001",
        "toBoundarySetId": "2010",
        "overlaps": overlaps,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(overlaps)} area links to {OUTPUT}")


if __name__ == "__main__":
    main()