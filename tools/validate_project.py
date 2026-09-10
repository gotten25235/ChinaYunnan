#!/usr/bin/env python3
"""Validate the Yunnan static site before packaging or deployment."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from generate_source_index import generated_text as generated_source_index_text  # noqa: E402
from generate_photo_sources import generated_text as generated_photo_sources_text  # noqa: E402
from generate_offline_manifest import generated_text as generated_offline_manifest_text  # noqa: E402

errors: list[str] = []
warnings: list[str] = []
passes: list[str] = []


def error(message: str) -> None:
    errors.append(message)


def warn(message: str) -> None:
    warnings.append(message)


def passed(message: str) -> None:
    passes.append(message)


def read_json(rel: str) -> Any:
    path = ROOT / rel
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        error(f"{rel}: JSON parse failed: {exc}")
        return {}


def collect_objects(value: Any, owner: str = "root"):
    if isinstance(value, dict):
        current = value.get("id") if isinstance(value.get("id"), str) else owner
        yield current, value
        for key, child in value.items():
            if key not in {"sourceRefs", "fieldSources"}:
                yield from collect_objects(child, current)
    elif isinstance(value, list):
        for child in value:
            yield from collect_objects(child, owner)


def validate_json_and_ids(trip: dict, social: dict) -> dict[str, dict]:
    if not trip or not social:
        return {}
    passed("all project JSON files parse")

    items: dict[str, dict] = {}
    ids: list[str] = []
    places = trip.get("places") if isinstance(trip.get("places"), dict) else {}
    for key, obj in places.items():
        if not isinstance(obj, dict):
            error(f"places.{key} is not an object")
            continue
        item_id = obj.get("id")
        if item_id != key:
            error(f"places.{key}.id must equal key (found {item_id!r})")
        if isinstance(item_id, str):
            ids.append(item_id); items[item_id] = obj
    for collection in ("foods", "shopping", "photoSpots"):
        rows = trip.get(collection) if isinstance(trip.get(collection), list) else []
        for index, obj in enumerate(rows):
            if not isinstance(obj, dict) or not isinstance(obj.get("id"), str):
                error(f"{collection}[{index}] must have a string id")
                continue
            item_id = obj["id"]
            ids.append(item_id)
            if item_id in items:
                error(f"duplicate item id across collections: {item_id}")
            items[item_id] = obj
    duplicates = [value for value, count in Counter(ids).items() if count > 1]
    if duplicates:
        error("duplicate item IDs: " + ", ".join(sorted(duplicates)))
    else:
        passed(f"item registry is unique ({len(items)} IDs)")

    priority_errors_before = len(errors)
    for obj in trip.get("foods", []):
        if obj.get("priority") not in (None, "必吃"):
            error(f"food {obj.get('id')!r} priority must be '必吃' when present")
    for obj in trip.get("shopping", []):
        if obj.get("priority") not in (None, "必買"):
            error(f"shopping {obj.get('id')!r} priority must be '必買' when present")
        if obj.get("priority") == "必買" and obj.get("group") != "必買":
            error(f"shopping {obj.get('id')!r} with priority='必買' must also use group='必買'")
    for story in trip.get("culture", []):
        if story.get("kind") == "鄉野奇談" and not story.get("source"):
            error(f"culture story {story.get('id')!r} kind='鄉野奇談' requires a source URL")
    if len(errors) == priority_errors_before:
        passed("food/shopping priority and folklore source contracts are valid")

    photos = trip.get("photos") if isinstance(trip.get("photos"), dict) else {}
    days = trip.get("days") if isinstance(trip.get("days"), list) else []
    expected_days = list(range(1, len(days) + 1))
    actual_days = [d.get("day") for d in days if isinstance(d, dict)]
    if actual_days != expected_days:
        error(f"days must be sequential {expected_days}, found {actual_days}")
    dates = [d.get("date") for d in days if isinstance(d, dict)]
    if len(dates) != len(set(dates)):
        error("day dates are not unique")

    day_ref_fields = ("itinerary", "nightRecommendations", "nightCandidates", "foods", "shopping", "nearby")
    for d in days:
        if not isinstance(d, dict):
            error("days contains a non-object")
            continue
        day_no = d.get("day")
        for field in day_ref_fields:
            values = d.get(field, [])
            if not isinstance(values, list):
                error(f"Day {day_no} {field} must be a list")
                continue
            for item_id in values:
                if item_id not in items:
                    error(f"Day {day_no} {field} references missing item {item_id!r}")
        hotel = d.get("hotel")
        if hotel is not None and hotel not in items:
            error(f"Day {day_no} hotel references missing item {hotel!r}")
        photo_id = d.get("photoId")
        if photo_id and photo_id not in photos:
            error(f"Day {day_no} photoId references missing photo {photo_id!r}")
        for item_id in d.get("itinerary", []):
            if item_id in items and items[item_id].get("pdfScheduled") is not True:
                error(f"Day {day_no} itinerary item {item_id} must keep pdfScheduled=true")
        if hotel in items and items[hotel].get("pdfScheduled") is not True:
            error(f"Day {day_no} hotel {hotel} must keep pdfScheduled=true")
    if not any("Day " in e for e in errors):
        passed(f"day references and pdfScheduled contracts are valid ({len(days)} days)")

    for item_id, obj in items.items():
        for field in ("photoId", "photoReferenceId"):
            ref = obj.get(field)
            if ref and ref not in photos:
                error(f"{item_id}.{field} references missing photo {ref!r}")
        for field in ("mapPlaceId", "taxiAnchorId"):
            ref = obj.get(field)
            if ref and ref not in items:
                error(f"{item_id}.{field} references missing item {ref!r}")
        lat_present, lng_present = "lat" in obj and obj.get("lat") is not None, "lng" in obj and obj.get("lng") is not None
        if lat_present != lng_present:
            error(f"{item_id} must provide lat/lng as a pair")
        if lat_present and lng_present:
            lat, lng = obj.get("lat"), obj.get("lng")
            if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)) or not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                error(f"{item_id} has invalid coordinates {lat!r}, {lng!r}")
    map_areas = trip.get("mapAreas") if isinstance(trip.get("mapAreas"), dict) else {}
    for city, item_id in map_areas.items():
        if item_id not in items:
            error(f"mapAreas[{city!r}] references missing item {item_id!r}")

    custom_default = trip.get("customMapDefault") if isinstance(trip.get("customMapDefault"), list) else []
    if len(custom_default) != len(set(custom_default)):
        error("customMapDefault contains duplicate IDs")
    missing_custom = [item_id for item_id in custom_default if item_id not in items]
    if missing_custom:
        error("customMapDefault references missing IDs: " + ", ".join(missing_custom))
    else:
        passed(f"customMapDefault is valid ({len(custom_default)} items)")

    social_meta = social.get("meta") if isinstance(social.get("meta"), dict) else {}
    social_sources = social.get("sources") if isinstance(social.get("sources"), dict) else {}
    if social_meta.get("schemaVersion") != "v1":
        error("social-sources meta.schemaVersion must equal 'v1'")
    parser_mismatches = []
    for source_id, source in social_sources.items():
        collection = source.get("collection") if isinstance(source, dict) and isinstance(source.get("collection"), dict) else {}
        if collection.get("parserVersion") != "v1":
            parser_mismatches.append(source_id)
    if parser_mismatches:
        error("source collection parserVersion must equal 'v1': " + ", ".join(parser_mismatches[:8]))
    else:
        passed("source schema and parser identification use V1")

    source_refs: dict[str, set[str]] = defaultdict(set)
    for owner, obj in collect_objects(trip):
        direct = obj.get("sourceRefs")
        direct_set = set(v for v in direct if isinstance(v, str)) if isinstance(direct, list) else set()
        fields = obj.get("fieldSources")
        field_set: set[str] = set()
        if isinstance(fields, dict):
            for field, values in fields.items():
                if not isinstance(values, list):
                    error(f"{owner}.fieldSources.{field} must be a list")
                    continue
                field_set.update(v for v in values if isinstance(v, str))
        missing_direct = field_set - direct_set
        if missing_direct:
            error(f"{owner}: fieldSources IDs missing from sourceRefs: {', '.join(sorted(missing_direct))}")
        for source_id in direct_set | field_set:
            source_refs[source_id].add(owner)
            if source_id not in social_sources:
                error(f"{owner}: missing source record {source_id}")
    for key, source in social_sources.items():
        if not isinstance(source, dict) or source.get("sourceId") != key:
            error(f"social-sources key/sourceId mismatch: {key}")
    if not any("source" in e.lower() or "fieldSources" in e for e in errors):
        passed(f"source references resolve ({len(source_refs)} referenced / {len(social_sources)} records)")
    return items


def validate_media(trip: dict) -> None:
    photos = trip.get("photos") if isinstance(trip.get("photos"), dict) else {}
    local_count = remote_count = 0
    local_bytes = 0
    for photo_id, photo in photos.items():
        if not isinstance(photo, dict):
            error(f"photos.{photo_id} is not an object")
            continue
        if "mainlandFallbackPhotoId" in photo:
            error(f"photos.{photo_id}: unrelated Mainland fallback fields are forbidden by strict photo policy")
        src = photo.get("src")
        if not isinstance(src, str) or not src:
            error(f"photos.{photo_id}.src is missing")
            continue
        width, height = photo.get("width"), photo.get("height")
        if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
            error(f"photos.{photo_id}: width/height must be positive integers")
        if src.startswith(("http://", "https://")):
            remote_count += 1
        else:
            local_count += 1
            path = ROOT / src
            if not path.is_file():
                error(f"photos.{photo_id}: local image missing: {src}")
            else:
                local_bytes += path.stat().st_size
            if path.suffix.lower() != ".webp":
                error(f"photos.{photo_id}: local primary image must be WebP: {src}")
    hero = trip.get("heroImage")
    if isinstance(hero, str) and not hero.startswith(("http://", "https://")):
        path = ROOT / hero
        if not path.is_file():
            error(f"heroImage missing: {hero}")
        elif path.suffix.lower() != ".webp":
            error(f"heroImage must be WebP: {hero}")
    non_webp_files = [p.relative_to(ROOT).as_posix() for p in (ROOT / "images").rglob("*") if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
    if non_webp_files:
        error("images/ must not contain JPEG/PNG primary assets: " + ", ".join(non_webp_files[:8]))
    else:
        passed(f"local image payload is WebP-only ({local_count} photo records, {local_bytes/1024/1024:.2f} MiB unique-record sum)")
    if remote_count:
        passed(f"{remote_count} remote exact/verified/context sources remain; both network profiles attempt the same subject image and never substitute another place")

    # Strict semantic matching: exact subjects stay exact; only broad activities/transit may use labeled context/illustration.
    strict_before = len(errors)
    allowed_generic_places = {"arrival", "carriage", "visit", "tea-diy", "city-free", "return", "night-live"}
    allowed_matches = {"exact", "verified", "illustrative", "context", "representative"}
    places = trip.get("places") if isinstance(trip.get("places"), dict) else {}
    for item_id, obj in places.items():
        if not isinstance(obj, dict):
            continue
        photo_id, match = obj.get("photoId"), obj.get("photoMatch")
        if not photo_id:
            error(f"places.{item_id}: photo coverage is required")
        if match == "reference_only":
            error(f"places.{item_id}: reference_only must never be displayed")
        if match in {"illustrative", "context", "representative"} and item_id not in allowed_generic_places:
            error(f"places.{item_id}: named subject cannot use {match}; require exact/verified")
        if match and match not in allowed_matches:
            error(f"places.{item_id}: unsupported photoMatch {match}")
    for collection in ("foods", "shopping"):
        for index, obj in enumerate(trip.get(collection, [])):
            if not isinstance(obj, dict):
                continue
            if not obj.get("photoId"):
                error(f"{collection}[{index}]: photo coverage is required")
            if obj.get("photoMatch") == "reference_only":
                error(f"{collection}[{index}]: reference_only must never be displayed")
    for index, obj in enumerate(trip.get("culture", [])):
        if not isinstance(obj, dict):
            continue
        if not obj.get("photoId"):
            error(f"culture[{index}]: photo coverage is required")
        if obj.get("photoMatch") in {"reference_only", "representative", "illustrative"}:
            error(f"culture[{index}]: culture photos must be exact/verified/context")
    for index, obj in enumerate(trip.get("photoSpots", [])):
        if not isinstance(obj, dict):
            continue
        if not obj.get("photoId"):
            error(f"photoSpots[{index}]: photo coverage is required")
        match = obj.get("photoMatch")
        if match == "reference_only" or match == "representative" or match == "illustrative":
            error(f"photoSpots[{index}]: photo spot requires exact/verified/context")
        if match == "context" and obj.get("id") != "photo-xizhou":
            error(f"photoSpots[{index}]: context is only allowed for the broad Xizhou courtyard/field composition")
    if len(errors) == strict_before:
        passed("photo coverage is complete and strict semantics hold: named subjects use exact/verified; broad imagery is explicitly labeled")


def validate_generated_index() -> None:
    path = ROOT / "data" / "source-index.json"
    actual = path.read_text(encoding="utf-8") if path.exists() else ""
    expected = generated_source_index_text()
    if actual != expected:
        error("data/source-index.json is stale; run python tools/generate_source_index.py")
    else:
        passed("source-index.json matches generated data")


def validate_generated_photo_sources() -> None:
    path = ROOT / "docs" / "sources" / "PHOTO_SOURCES.md"
    actual = path.read_text(encoding="utf-8") if path.exists() else ""
    expected = generated_photo_sources_text()
    if actual != expected:
        error("docs/sources/PHOTO_SOURCES.md is stale; run python tools/generate_photo_sources.py")
    else:
        passed("PHOTO_SOURCES.md matches trip-data photo metadata")


def validate_release_and_views() -> None:
    config = read_json("tools/release.json")
    version = config.get("version") if isinstance(config, dict) else None
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    app = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
    core = (ROOT / "js" / "core.js").read_text(encoding="utf-8")
    map_js = (ROOT / "js" / "map.js").read_text(encoding="utf-8")

    if config != {"version": "v1"}:
        error('tools/release.json must contain only {"version": "v1"}')

    versions = re.findall(r'(?:css/style\.css|js/(?:network|core|weather|offline|reader|journey|map|library|app)\.js)\?v=([^"\']+)', html)
    if len(versions) != 10 or any(v != "v1" for v in versions):
        error("index.html local CSS/JS identification must be ?v=v1")

    sw_version = re.search(r"const VERSION = '([^']+)';", sw)
    if not sw_version or sw_version.group(1) != "v1":
        error("sw.js VERSION must equal 'v1'")
    if "const APP_CACHE = `yunnan-app-${VERSION}`;" not in sw:
        error("sw.js APP_CACHE must use fixed V1 identification")
    if "const IMAGE_CACHE = `yunnan-images-${VERSION}`;" not in sw:
        error("sw.js IMAGE_CACHE must use fixed V1 identification")
    if "const OFFLINE_META_CACHE = `yunnan-offline-${VERSION}`;" not in sw:
        error("sw.js OFFLINE_META_CACHE must use fixed V1 identification")

    expected_shell = ["index.html", "manifest.webmanifest", "offline-manifest.json", "css/style.css", "js/network.js", "js/core.js", "js/weather.js", "js/offline.js", "js/reader.js", "js/journey.js", "js/map.js", "js/library.js", "js/app.js", "data/trip-data.json", "data/social-sources.json", "data/source-index.json", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"]
    for rel in expected_shell:
        if not (ROOT / rel).is_file():
            error(f"APP_SHELL file missing: {rel}")

    storage_contracts = (
        (core, "yunnan-2026-favorites-v1", "Favorites storage"),
        (core, "yunnan-2026-map-provider-v1", "Map provider storage"),
        (map_js, "yunnan-2026-custom-map-v1", "Custom map storage"),
    )
    for source, key, label in storage_contracts:
        if key not in source:
            error(f"{label} must use the V1 key {key!r}")

    release_markers = ("tools/release.json", "index.html local CSS/JS", "sw.js VERSION", "sw.js APP_CACHE", "sw.js IMAGE_CACHE", "sw.js OFFLINE_META_CACHE", "APP_SHELL", "storage")
    if not any(any(marker in e for marker in release_markers) for e in errors):
        passed("V1 identification, cache names, asset queries, and browser storage are synchronized")

    start = app.find("const VIEW_REGISTRY=Object.freeze({")
    end = app.find("  const VIEW_ORDER=Object.freeze(Object.keys(VIEW_REGISTRY));", start)
    if start < 0 or end < 0:
        error("app.js VIEW_REGISTRY / derived VIEW_ORDER not found")
    else:
        block = app[start:end]
        registry_views = re.findall(r"^\s{4}([a-z][a-z0-9-]*):\{", block, re.MULTILINE)
        html_views = re.findall(r'id="view-([a-z][a-z0-9-]*)"', html)
        nav_match = re.search(r'<nav class="section-nav"[^>]*>(.*?)</nav>', html, re.DOTALL)
        nav_views = re.findall(r'data-view="([a-z][a-z0-9-]*)"', nav_match.group(1)) if nav_match else []
        if set(registry_views) != set(html_views):
            error(f"VIEW_REGISTRY must cover exactly the HTML views: registry={registry_views}, html={html_views}")
        elif registry_views != nav_views:
            error(f"VIEW_REGISTRY order must match primary navigation order: registry={registry_views}, nav={nav_views}")
        else:
            passed("View Registry is the single ordered source for valid views and main swipe")
    if "['itinerary','map','night'" in app or ".includes(name))name='itinerary'" in app:
        error("app.js contains a hard-coded valid-view list that duplicates VIEW_REGISTRY")
    if "function bootstrapStaticViews()" not in app or "view.bootstrap" not in app:
        error("app.js must bootstrap stable non-map view DOM before gesture binding")
    clone_start = app.find("function cloneMainDocument(viewName)")
    clone_end = app.find("function makeSwipePane", clone_start)
    clone_block = app[clone_start:clone_end] if clone_start >= 0 and clone_end > clone_start else ""
    if not clone_block or ".render(" in clone_block or ".bootstrap(" in clone_block:
        error("main swipe preview must only clone existing DOM; it must not run a View renderer")
    map_entry = re.search(r"^\s{4}map:\{(.*?)^\s{4}night:\{", block, re.MULTILINE | re.DOTALL) if start >= 0 and end >= 0 else None
    if not map_entry or "requestAnimationFrame" not in map_entry.group(1) or "mapSystem.isCreated()" not in map_entry.group(1):
        error("Map view must initialize Leaflet only after the view becomes visible")
    lifecycle_errors = ("hard-coded valid-view", "stable non-map view DOM", "swipe preview", "Map view must initialize")
    if not any(any(marker in e for marker in lifecycle_errors) for e in errors):
        passed("runtime view lifecycle keeps stable DOM, gesture-safe swipe, and visible-only Map initialization")



def validate_offline_pwa(trip: dict) -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    offline_js = (ROOT / "js" / "offline.js").read_text(encoding="utf-8") if (ROOT / "js" / "offline.js").exists() else ""
    map_js = (ROOT / "js" / "map.js").read_text(encoding="utf-8")
    manifest = read_json("manifest.webmanifest")
    offline_manifest = read_json("offline-manifest.json")

    before = len(errors)
    if '<link rel="manifest" href="manifest.webmanifest">' not in html:
        error("index.html must link manifest.webmanifest")
    if 'js/offline.js?v=v1' not in html:
        error("index.html must load js/offline.js?v=v1")
    if 'id="connection-badge"' not in html:
        error("index.html must expose the connectivity badge")
    for key in ("name", "short_name", "start_url", "scope", "display", "icons"):
        if not manifest.get(key):
            error(f"manifest.webmanifest missing {key}")
    if manifest.get("display") != "standalone":
        error("manifest.webmanifest display must be standalone")
    for icon in manifest.get("icons", []) if isinstance(manifest.get("icons"), list) else []:
        src = icon.get("src") if isinstance(icon, dict) else None
        if not isinstance(src, str) or not (ROOT / src).is_file():
            error(f"PWA icon missing: {src!r}")

    expected = generated_offline_manifest_text()
    actual = (ROOT / "offline-manifest.json").read_text(encoding="utf-8") if (ROOT / "offline-manifest.json").exists() else ""
    if actual != expected:
        error("offline-manifest.json is stale; run python tools/generate_offline_manifest.py")
    else:
        passed("offline-manifest.json matches current runtime assets and remote photos")

    if offline_manifest.get("schemaVersion") != "v1":
        error("offline-manifest schemaVersion must equal v1")
    local_assets = offline_manifest.get("localAssets") if isinstance(offline_manifest.get("localAssets"), list) else []
    remote_photos = offline_manifest.get("remotePhotos") if isinstance(offline_manifest.get("remotePhotos"), list) else []
    for asset in local_assets:
        if not isinstance(asset, str):
            error("offline-manifest localAssets entries must be strings")
            continue
        if asset == "./":
            continue
        rel = asset[2:] if asset.startswith("./") else asset
        rel = rel.split("?", 1)[0]
        if not (ROOT / rel).is_file():
            error(f"offline local asset missing: {asset}")
    photo_urls = []
    for photo in (trip.get("photos") or {}).values():
        if isinstance(photo, dict):
            src = photo.get("src")
            if isinstance(src, str) and src.startswith(("http://", "https://")):
                photo_urls.append(src)
    manifest_urls=[]
    for record in remote_photos:
        if not isinstance(record, dict):
            error("offline-manifest remotePhotos entries must be diagnostic objects")
            continue
        url=record.get("url")
        if not isinstance(url,str) or not url.startswith(("http://","https://")):
            error("offline-manifest remote photo record missing valid url")
        else:
            manifest_urls.append(url)
        if not record.get("id") or not record.get("label"):
            error("offline-manifest remote photo record must include id and label")
    if set(manifest_urls) != set(photo_urls):
        error("offline-manifest remotePhotos must cover every remote primary photo exactly")

    forbidden_remote_tags = re.findall(r'<(?:script|link)\b[^>]+(?:src|href)=["\']https?://', html, re.I)
    if forbidden_remote_tags:
        error("index.html required scripts/styles must be local for offline PWA")
    for marker in ("PREPARE_OFFLINE", "RETRY_OFFLINE_PHOTOS", "CHECK_OFFLINE", "OFFLINE_PROGRESS", "remoteMissingItems", "offline-manifest.json"):
        if marker not in sw:
            error(f"sw.js offline preparation contract missing {marker}")
    for marker in ("data-offline-prepare", "data-offline-retry-missing", "data-offline-missing-list", "data-offline-check", "yunnan-offline-prep-state-v1"):
        if marker not in offline_js:
            error(f"offline.js UI/state contract missing {marker}")
    if "renderOfflineMap" not in map_js or "offline-map-marker" not in map_js:
        error("map.js must keep a no-tile offline schematic map fallback")
    if len(errors) == before:
        passed("PWA install shell, explicit offline download, photo cache verification and schematic offline map contracts are valid")


def validate_js_syntax() -> None:
    node = shutil.which("node")
    if not node:
        warn("node not found; JS syntax check skipped")
        return
    files = sorted((ROOT / "js").glob("*.js")) + [ROOT / "sw.js"]
    for path in files:
        result = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
        if result.returncode:
            error(f"node --check failed for {path.relative_to(ROOT)}: {result.stderr.strip()}")
    if not any("node --check" in e for e in errors):
        passed(f"node --check passes ({len(files)} JS files)")


def main() -> int:
    trip = read_json("data/trip-data.json")
    social = read_json("data/social-sources.json")
    _ = read_json("data/source-index.json")
    validate_json_and_ids(trip, social)
    validate_media(trip)
    validate_generated_index()
    validate_generated_photo_sources()
    validate_release_and_views()
    validate_offline_pwa(trip)
    validate_js_syntax()

    for message in passes:
        print(f"PASS  {message}")
    for message in warnings:
        print(f"WARN  {message}")
    for message in errors:
        print(f"ERROR {message}")
    print(f"\nSummary: {len(passes)} pass, {len(warnings)} warning, {len(errors)} error")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
