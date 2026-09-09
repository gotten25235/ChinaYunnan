#!/usr/bin/env python3
"""Generate data/source-index.json from trip-data.json and social-sources.json.

source-index.json is a derived artifact. Do not edit it by hand.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TRIP_PATH = ROOT / "data" / "trip-data.json"
SOCIAL_PATH = ROOT / "data" / "social-sources.json"
INDEX_PATH = ROOT / "data" / "source-index.json"


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def source_ids_in_object(obj: dict[str, Any]) -> set[str]:
    refs: set[str] = set()
    direct = obj.get("sourceRefs")
    if isinstance(direct, list):
        refs.update(v for v in direct if isinstance(v, str) and v)
    fields = obj.get("fieldSources")
    if isinstance(fields, dict):
        for values in fields.values():
            if isinstance(values, list):
                refs.update(v for v in values if isinstance(v, str) and v)
    return refs


def collect_usage(value: Any, usage: dict[str, set[str]], owner_id: str | None = None) -> None:
    if isinstance(value, dict):
        current_owner = value.get("id") if isinstance(value.get("id"), str) and value.get("id") else owner_id
        refs = source_ids_in_object(value)
        if current_owner:
            for ref in refs:
                usage[ref].add(current_owner)
        for key, child in value.items():
            if key not in {"sourceRefs", "fieldSources"}:
                collect_usage(child, usage, current_owner)
    elif isinstance(value, list):
        for child in value:
            collect_usage(child, usage, owner_id)


def build_index(trip: dict[str, Any], social: dict[str, Any]) -> dict[str, Any]:
    usage: dict[str, set[str]] = defaultdict(set)
    collect_usage(trip, usage)

    sources = social.get("sources") if isinstance(social, dict) else None
    if not isinstance(sources, dict):
        sources = {}
    meta = social.get("meta") if isinstance(social, dict) else {}
    if not isinstance(meta, dict):
        meta = {}

    custom_default = trip.get("customMapDefault")
    if not isinstance(custom_default, list):
        custom_default = []
    custom_default = [v for v in custom_default if isinstance(v, str)]

    custom_research = trip.get("customResearch") if isinstance(trip.get("customResearch"), dict) else {}
    hotel_batch = custom_research.get("hotelNightBatch") if isinstance(custom_research.get("hotelNightBatch"), dict) else {}
    batch_ids = [
        custom_research.get("batchId"),
        hotel_batch.get("batchId"),
    ]
    batch_ids = [v for v in batch_ids if isinstance(v, str) and v]

    known_ids = set(sources)
    referenced_ids = set(usage)
    return {
        "generated": True,
        "generatedFrom": ["data/trip-data.json", "data/social-sources.json"],
        "checkedAt": meta.get("checkedAt") or custom_research.get("checkedAt") or trip.get("checkedAt"),
        "batchIds": batch_ids,
        "customItemCount": len(custom_default),
        "sourceCount": len(sources),
        "referencedSourceCount": len(referenced_ids),
        "defaultCustomIds": custom_default,
        "unreferencedSourceIds": sorted(known_ids - referenced_ids),
        "missingSourceIds": sorted(referenced_ids - known_ids),
        "sourceUsage": {source_id: sorted(usage[source_id]) for source_id in sorted(usage)},
    }


def generated_text() -> str:
    trip = read_json(TRIP_PATH)
    social = read_json(SOCIAL_PATH)
    return json.dumps(build_index(trip, social), ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Exit non-zero if source-index.json is stale")
    args = parser.parse_args()
    expected = generated_text()
    if args.check:
        actual = INDEX_PATH.read_text(encoding="utf-8") if INDEX_PATH.exists() else ""
        if actual != expected:
            print("ERROR data/source-index.json is stale. Run: python tools/generate_source_index.py")
            return 1
        print("PASS  source-index.json is generated and current")
        return 0
    INDEX_PATH.write_text(expected, encoding="utf-8", newline="\n")
    print(f"Generated {INDEX_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
