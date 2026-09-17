#!/usr/bin/env python3
"""Validate the Yunnan static site before packaging or deployment."""
from __future__ import annotations

import json
import re
import hashlib
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from generate_source_index import generated_text as generated_source_index_text  # noqa: E402
from generate_image_sources import generated_text as generated_image_sources_text  # noqa: E402
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
    review_fields = ("verdict", "aroma", "flavor", "texture", "bestWay", "caution", "forWhom")
    score_fields = ("aroma", "texture", "layers", "local", "rebuy")
    def validate_food_review(owner: str, obj: dict) -> None:
        review = obj.get("foodReview")
        if not isinstance(review, dict):
            error(f"{owner} must provide foodReview")
            return
        for field in review_fields:
            if not isinstance(review.get(field), str) or not review[field].strip():
                error(f"{owner}.foodReview.{field} must be non-empty text")
        scores = review.get("scores")
        if not isinstance(scores, dict):
            error(f"{owner}.foodReview.scores must be an object")
            return
        for field in score_fields:
            value = scores.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 5:
                error(f"{owner}.foodReview.scores.{field} must be an integer from 1 to 5")
        if not isinstance(obj.get("reviewBasis"), str) or not obj["reviewBasis"].strip():
            error(f"{owner}.reviewBasis must explain the review basis")
    for index, obj in enumerate(trip.get("foods", [])):
        if isinstance(obj, dict):
            validate_food_review(f"foods[{index}]", obj)
    for index, obj in enumerate(trip.get("shopping", [])):
        if isinstance(obj, dict) and obj.get("edible") is True:
            validate_food_review(f"shopping[{index}]", obj)
    for story in trip.get("culture", []):
        if story.get("kind") == "鄉野奇談" and not story.get("source"):
            error(f"culture story {story.get('id')!r} kind='鄉野奇談' requires a source URL")
    if len(errors) == priority_errors_before:
        passed("food/shopping priority, taste-review and folklore source contracts are valid")

    images = trip.get("images") if isinstance(trip.get("images"), dict) else {}
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
        image_id = d.get("imageId")
        if image_id and image_id not in images:
            error(f"Day {day_no} imageId references missing image {image_id!r}")
        for item_id in d.get("itinerary", []):
            if item_id in items and items[item_id].get("pdfScheduled") is not True:
                error(f"Day {day_no} itinerary item {item_id} must keep pdfScheduled=true")
        if hotel in items and items[hotel].get("pdfScheduled") is not True:
            error(f"Day {day_no} hotel {hotel} must keep pdfScheduled=true")
    if not any("Day " in e for e in errors):
        passed(f"day references and pdfScheduled contracts are valid ({len(days)} days)")

    for item_id, obj in items.items():
        for field in ("imageId", "imageReferenceId"):
            ref = obj.get(field)
            if ref and ref not in images:
                error(f"{item_id}.{field} references missing image {ref!r}")
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
    images = trip.get("images") if isinstance(trip.get("images"), dict) else {}
    required_fields = ("local", "remote", "alt", "caption", "source", "author", "license", "licenseUrl", "width", "height", "changes")
    required_set = set(required_fields)
    allowed_dirs = {"food", "shopping", "hotels", "places", "culture", "pose", "airlines", "handbook"}
    local_declared = pending_local_count = 0
    local_bytes = 0

    try:
        from PIL import Image
    except Exception:
        Image = None
        warn("Pillow unavailable; image dimension verification skipped")

    for image_id, image in images.items():
        if not isinstance(image, dict):
            error(f"images.{image_id} is not an object")
            continue
        keys = set(image.keys())
        missing = required_set - keys
        extra = keys - required_set
        if missing:
            error(f"images.{image_id}: missing required fields: " + ", ".join(sorted(missing)))
        if extra:
            error(f"images.{image_id}: unsupported fields: " + ", ".join(sorted(extra)))

        local = image.get("local")
        remote = image.get("remote")
        source = image.get("source")
        license_url = image.get("licenseUrl")
        if not isinstance(local, str) or not local:
            error(f"images.{image_id}.local is missing")
            continue
        if local.startswith(("http://", "https://")) or not local.endswith(".webp"):
            error(f"images.{image_id}.local must be a local WebP path")
            continue
        parts = Path(local).parts
        if len(parts) < 3 or parts[0] != "images" or parts[1] not in allowed_dirs:
            error(f"images.{image_id}.local must be under images/food|shopping|hotels|places|culture|pose|airlines|handbook: {local}")
        if not isinstance(remote, str) or not remote.startswith(("http://", "https://")):
            error(f"images.{image_id}.remote is required and must be an http(s) image URL")
        if remote == local:
            error(f"images.{image_id}: remote must not equal local")
        if not isinstance(source, str) or not source.startswith(("http://", "https://")):
            error(f"images.{image_id}.source must be a traceable http(s) source page")
        if not isinstance(license_url, str) or not license_url.startswith(("http://", "https://")):
            error(f"images.{image_id}.licenseUrl must be an http(s) URL")
        for field in ("alt", "caption", "author", "license", "changes"):
            if not isinstance(image.get(field), str) or not image[field].strip():
                error(f"images.{image_id}.{field} must be non-empty text")

        width, height = image.get("width"), image.get("height")
        if not isinstance(width, int) or isinstance(width, bool) or not isinstance(height, int) or isinstance(height, bool) or width < 0 or height < 0:
            error(f"images.{image_id}: width/height must be non-negative integers")
            width = height = -1

        path = ROOT / local
        local_declared += 1
        if path.is_file():
            local_bytes += path.stat().st_size
            if width <= 0 or height <= 0:
                error(f"images.{image_id}: packaged local image requires positive width/height")
            elif Image is not None:
                try:
                    with Image.open(path) as im:
                        actual = tuple(map(int, im.size))
                    if actual != (width, height):
                        error(f"images.{image_id}: width/height {width}x{height} do not match local file {actual[0]}x{actual[1]}")
                except Exception as exc:
                    error(f"images.{image_id}: cannot inspect local image dimensions: {exc}")
        else:
            pending_local_count += 1
            if (width, height) != (0, 0):
                error(f"images.{image_id}: missing local file must use width=0,height=0 until sync")

    # Hero uses the same registry rather than a second image path/credit schema.
    if "heroImage" in trip or "imageCredit" in trip:
        error("heroImage/imageCredit are obsolete; use heroImageId -> images registry")
    hero_id = trip.get("heroImageId")
    if not isinstance(hero_id, str) or hero_id not in images:
        error("heroImageId must reference the images registry")
    elif not (ROOT / images[hero_id]["local"]).is_file():
        error("heroImageId local image must be packaged")

    non_webp_files = [p.relative_to(ROOT).as_posix() for p in (ROOT / "images").rglob("*") if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png"} and "_quarantine" not in p.parts]
    if non_webp_files:
        error("images/ must not contain JPEG/PNG primary assets: " + ", ".join(non_webp_files[:8]))
    else:
        passed(f"unified image registry uses the strict 11-field schema ({len(images)} records, {local_bytes/1024/1024:.2f} MiB packaged)")
    passed(f"image fallback contract is local -> exact remote -> no image ({len(images)} remote-backed, {pending_local_count} pending local sync)")

    strict_before = len(errors)
    allowed_generic_places = {"arrival", "carriage", "visit", "tea-diy", "city-free", "return", "night-live", "night-nanzhao", "custom-dali-marshal", "custom-dali-north-market"}
    allowed_matches = {"exact", "verified", "illustrative", "context", "representative"}
    places = trip.get("places") if isinstance(trip.get("places"), dict) else {}
    for item_id, obj in places.items():
        if not isinstance(obj, dict):
            continue
        image_id, match = obj.get("imageId"), obj.get("imageMatch")
        if not image_id:
            error(f"places.{item_id}: image coverage is required")
        if match == "reference_only":
            error(f"places.{item_id}: reference_only must never be displayed")
        if match in {"illustrative", "context", "representative"} and item_id not in allowed_generic_places:
            error(f"places.{item_id}: named subject cannot use {match}; require exact/verified")
        if match and match not in allowed_matches:
            error(f"places.{item_id}: unsupported imageMatch {match}")
    for collection in ("foods", "shopping"):
        for index, obj in enumerate(trip.get(collection, [])):
            if not isinstance(obj, dict):
                continue
            if "imageUnavailable" in obj:
                error(f"{collection}[{index}]: imageUnavailable is obsolete; use imageId and registry fallback")
            if not obj.get("imageId"):
                error(f"{collection}[{index}]: imageId is required")
            if obj.get("imageMatch") == "reference_only":
                error(f"{collection}[{index}]: reference_only must never be displayed")
    for index, obj in enumerate(trip.get("culture", [])):
        if not isinstance(obj, dict):
            continue
        if not obj.get("imageId"):
            error(f"culture[{index}]: image coverage is required")
        if obj.get("imageMatch") in {"reference_only", "representative", "illustrative"}:
            error(f"culture[{index}]: culture images must be exact/verified/context")

    pose_image_ids = []
    pose_remote_urls = []
    retired_pose_fields = {"sourceImage", "sourcePlatform", "sourceTitle", "sourceUrl", "sourceAuthor", "sourceDate", "sourceAlt", "sourceCaptured"}
    for index, obj in enumerate(trip.get("photoSpots", [])):
        if not isinstance(obj, dict):
            continue
        if not obj.get("imageId"):
            error(f"photoSpots[{index}]: image coverage is required")
        match = obj.get("imageMatch")
        if match in {"reference_only", "representative", "illustrative"}:
            error(f"photoSpots[{index}]: photo spot requires exact/verified/context")
        if match == "context" and obj.get("id") != "photo-xizhou":
            error(f"photoSpots[{index}]: context is only allowed for broad Xizhou composition")
        tips = obj.get("poseTips")
        if not isinstance(tips, list) or not tips:
            error(f"photoSpots[{index}]: poseTips must be a non-empty list")
            continue
        per_spot_ids = []
        per_spot_urls = []
        for tip_index, tip in enumerate(tips):
            if not isinstance(tip, dict):
                error(f"photoSpots[{index}].poseTips[{tip_index}] must be an object")
                continue
            for field in sorted(retired_pose_fields.intersection(tip)):
                error(f"photoSpots[{index}].poseTips[{tip_index}]: obsolete image provenance field {field}; use images[imageId]")
            image_id = tip.get("imageId")
            image = images.get(image_id) if isinstance(image_id, str) else None
            if not isinstance(image, dict):
                error(f"photoSpots[{index}].poseTips[{tip_index}].imageId must reference images registry")
            else:
                remote = image.get("remote")
                if not isinstance(remote, str) or not remote.startswith(("http://", "https://")):
                    error(f"pose image {image_id} must keep an exact remote URL")
                else:
                    per_spot_urls.append(remote);pose_remote_urls.append(remote)
                local = image.get("local")
                if not isinstance(local, str) or not local.startswith("images/pose/") or not local.endswith(".webp"):
                    error(f"pose image {image_id} must declare images/pose/*.webp local path")
                per_spot_ids.append(image_id);pose_image_ids.append(image_id)
            if tip.get("url") and not str(tip.get("url")).startswith(("http://", "https://")):
                error(f"photoSpots[{index}].poseTips[{tip_index}].url must be an http(s) research URL when present")
        if len(per_spot_ids) != len(set(per_spot_ids)):
            error(f"photoSpots[{index}]: each poseTip must use a different imageId")
        if len(per_spot_urls) != len(set(per_spot_urls)):
            error(f"photoSpots[{index}]: each poseTip must use a different exact remote URL")
    if len(pose_image_ids) != len(set(pose_image_ids)):
        error("pose imageId values must be globally unique")
    if len(errors) == strict_before:
        passed("image coverage and strict semantics hold; all image provenance lives in the unified registry")

def validate_generated_index() -> None:
    path = ROOT / "data" / "source-index.json"
    actual = path.read_text(encoding="utf-8") if path.exists() else ""
    expected = generated_source_index_text()
    if actual != expected:
        error("data/source-index.json is stale; run python tools/generate_source_index.py")
    else:
        passed("source-index.json matches generated data")


def validate_generated_image_sources() -> None:
    path = ROOT / "docs" / "sources" / "IMAGE_SOURCES.md"
    actual = path.read_text(encoding="utf-8") if path.exists() else ""
    expected = generated_image_sources_text()
    if actual != expected:
        error("docs/sources/IMAGE_SOURCES.md is stale; run python tools/generate_image_sources.py")
    else:
        passed("IMAGE_SOURCES.md matches the unified image registry")


def validate_generated_pose_sources() -> None:
    path = ROOT / "docs" / "sources" / "POSE_SCREENSHOT_SOURCES.md"
    script = ROOT / "tools" / "generate_pose_sources.py"
    result = subprocess.run([sys.executable, str(script), "--check"], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        error("docs/sources/POSE_SCREENSHOT_SOURCES.md is stale; run python tools/generate_pose_sources.py")
    else:
        passed("POSE_SCREENSHOT_SOURCES.md matches photoSpots pose provenance")



def validate_generated_build_manifest() -> None:
    script = ROOT / "tools" / "generate_build_manifest.py"
    result = subprocess.run([sys.executable, str(script), "--check"], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        error("build.json / asset-manifest.json are stale; run python tools/generate_build_manifest.py")
    else:
        passed("build.json and asset-manifest.json match current release/build and App Shell hashes")

def validate_release_and_views() -> None:
    config = read_json("tools/release.json")
    trip = read_json("data/trip-data.json")
    version = config.get("version") if isinstance(config, dict) else None
    build = config.get("build") if isinstance(config, dict) else None
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    app = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
    core = (ROOT / "js" / "core.js").read_text(encoding="utf-8")
    map_js = (ROOT / "js" / "map.js").read_text(encoding="utf-8")

    if not isinstance(config, dict) or set(config) != {"version", "build"} or not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version) or not isinstance(build, str) or not re.fullmatch(r"\d{8}-\d{6}", build):
        error('tools/release.json must contain only {"version":"N.N.N","build":"YYYYMMDD-HHMMSS"}')

    html_version = re.search(r'<html\b[^>]*\bdata-app-version="([^"]+)"', html)
    if not html_version or html_version.group(1) != version:
        error("index.html data-app-version must equal tools/release.json version")
    html_build = re.search(r'<html\b[^>]*\bdata-app-build="([^"]+)"', html)
    if not html_build or html_build.group(1) != build:
        error("index.html data-app-build must equal tools/release.json build")

    build_refs = re.findall(r'(?:css/(?:style|banner)\.css|js/(?:network|core|analytics|weather|offline|settings|reader|journey|map|library|tips|banner|app)\.js)\?b=([^"\']+)', html)
    if len(build_refs) != 15 or any(v != build for v in build_refs):
        error(f"index.html local CSS/JS identification must be ?b={build}")

    sw_version = re.search(r"const RELEASE_VERSION = '([^']+)';", sw)
    if not sw_version or sw_version.group(1) != version:
        error("sw.js RELEASE_VERSION must equal tools/release.json version")
    sw_build = re.search(r"const BUILD_ID = '([^']+)';", sw)
    if not sw_build or sw_build.group(1) != build:
        error("sw.js BUILD_ID must equal tools/release.json build")
    if "const STORAGE_SCHEMA = 'v1';" not in sw:
        error("sw.js STORAGE_SCHEMA must remain v1 until a real storage/schema migration")
    if "const APP_CACHE = `yunnan-app-${RELEASE_VERSION}-${BUILD_ID}`;" not in sw:
        error("sw.js APP_CACHE must use public release version + internal build id")
    if "const IMAGE_CACHE = `yunnan-images-${STORAGE_SCHEMA}`;" not in sw:
        error("sw.js IMAGE_CACHE must use the stable storage schema")
    if "const OFFLINE_META_CACHE = `yunnan-offline-${STORAGE_SCHEMA}`;" not in sw:
        error("sw.js OFFLINE_META_CACHE must use the stable storage schema")

    expected_shell = ["index.html", "manifest.webmanifest", "offline-manifest.json", "build.json", "asset-manifest.json", "css/style.css", "css/banner.css", "js/network.js", "js/core.js", "js/analytics.js", "js/weather.js", "js/offline.js", "js/settings.js", "js/reader.js", "js/journey.js", "js/map.js", "js/library.js", "js/tips.js", "js/banner.js", "js/app.js", "data/trip-data.json", "data/social-sources.json", "data/source-index.json", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"]
    for rel in expected_shell:
        if not (ROOT / rel).is_file():
            error(f"APP_SHELL file missing: {rel}")

    storage_contracts = (
        (core, "yunnan-2026-favorites-v1", "Favorites storage"),
        (core, "yunnan-2026-map-provider-v1", "Map provider storage"),
        (map_js, "yunnan-2026-custom-map-v1", "Custom map storage"),
        ((ROOT / "js" / "settings.js").read_text(encoding="utf-8"), "yunnan-2026-ui-layout-v1", "UI layout storage"),
        ((ROOT / "js" / "settings.js").read_text(encoding="utf-8"), "yunnan-2026-color-theme-v1", "UI theme storage"),
    )
    for source, key, label in storage_contracts:
        if key not in source:
            error(f"{label} must use the V1 key {key!r}")

    nav_contract_errors = []
    if "createNavigationService({tripData,items,esc,networkProfile" not in core:
        nav_contract_errors.append("Core navigation service must accept networkProfile for AMap GCJ-02 destinations")
    if "createNavigationService({tripData,items,esc,networkProfile})" not in app:
        nav_contract_errors.append("app.js must pass networkProfile into the navigation service")
    required_amap_markers = (
        "'androidamap':'iosamap'",
        "://navi?",
        "https://uri.amap.com/navigation?",
        "sourceApplication:'ChinaYunnan'",
        "poiname:destName",
        "lat:gLat.toFixed(6)",
        "lon:gLng.toFixed(6)",
        "dev:'0'",
        "wgs84ToGcj02",
    )
    if any(marker not in core for marker in required_amap_markers):
        nav_contract_errors.append("AMap navigation must use official Android/iOS app schemes with coordinate payload and URI API web fallback")
    if "https://amap.com/dir?" in core or "to[lnglat]" in core:
        nav_contract_errors.append("AMap navigation must not use amap.com /dir internal web parameters because the app may open without carrying the destination")
    if "https://uri.amap.com/search?" not in core or "keyword:amapSearchKeyword(p)" not in core:
        nav_contract_errors.append("AMap no-coordinate fallback must use official URI search by city + place name")
    hotel = trip.get("places", {}).get("hotel-kmg-airport", {}) if isinstance(trip.get("places"), dict) else {}
    if hotel.get("amapPoiId") != "B0JGA5BN7V" or hotel.get("amapPoiName") != "澜颐酒店(昆明长水国际机场店)":
        nav_contract_errors.append("Kunming airport hotel must retain the verified AMap POI ID/name used for direct navigation")
    if (hotel.get("amapLat"), hotel.get("amapLng")) != (25.076817, 102.950275):
        nav_contract_errors.append("Kunming airport hotel must retain its verified AMap GCJ-02 coordinates")
    for message in nav_contract_errors:
        error(message)
    if not nav_contract_errors:
        passed("AMap navigation uses official app deep links with destination payload; Kunming airport hotel is pinned by verified AMap POI ID")

    release_markers = ("tools/release.json", "index.html data-app-version", "index.html data-app-build", "index.html local CSS/JS", "sw.js RELEASE_VERSION", "sw.js BUILD_ID", "sw.js APP_CACHE", "sw.js IMAGE_CACHE", "sw.js OFFLINE_META_CACHE", "APP_SHELL", "storage")
    if not any(any(marker in e for marker in release_markers) for e in errors):
        passed("release version/build, stable schema caches, asset queries, and browser storage are synchronized")

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
    config = read_json("tools/release.json")
    version = config.get("version") if isinstance(config, dict) else None
    build = config.get("build") if isinstance(config, dict) else None
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    offline_js = (ROOT / "js" / "offline.js").read_text(encoding="utf-8") if (ROOT / "js" / "offline.js").exists() else ""
    map_js = (ROOT / "js" / "map.js").read_text(encoding="utf-8")
    manifest = read_json("manifest.webmanifest")
    offline_manifest = read_json("offline-manifest.json")

    before = len(errors)
    if '<link rel="manifest" href="manifest.webmanifest">' not in html:
        error("index.html must link manifest.webmanifest")
    if f'js/offline.js?b={build}' not in html:
        error(f"index.html must load js/offline.js?b={build}")
    if f'js/settings.js?b={build}' not in html:
        error(f"index.html must load js/settings.js?b={build}")
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
        passed("offline-manifest.json matches core assets and unified image sources")

    if offline_manifest.get("schemaVersion") != "v1":
        error("offline-manifest schemaVersion must equal v1")
    core_assets = offline_manifest.get("coreAssets") if isinstance(offline_manifest.get("coreAssets"), list) else []
    image_assets = offline_manifest.get("imageAssets") if isinstance(offline_manifest.get("imageAssets"), list) else []
    image_hashes = offline_manifest.get("imageHashes") if isinstance(offline_manifest.get("imageHashes"), dict) else {}
    remote_images = offline_manifest.get("remoteImages") if isinstance(offline_manifest.get("remoteImages"), list) else []
    for group_name, assets in (("coreAssets", core_assets), ("imageAssets", image_assets)):
        for asset in assets:
            if not isinstance(asset, str):
                error(f"offline-manifest {group_name} entries must be strings")
                continue
            if asset == "./":
                continue
            rel = asset[2:] if asset.startswith("./") else asset
            rel = rel.split("?", 1)[0]
            if not (ROOT / rel).is_file():
                error(f"offline {group_name} asset missing: {asset}")

    expected_local_paths = []
    expected_remote_urls = []
    for image in (trip.get("images") or {}).values():
        if not isinstance(image, dict):
            continue
        local = image.get("local")
        remote = image.get("remote")
        if isinstance(local, str) and local and not local.startswith(("http://", "https://")):
            if (ROOT / local).is_file():
                expected_local_paths.append("./" + local.lstrip("./"))
            elif isinstance(remote, str) and remote.startswith(("http://", "https://")):
                expected_remote_urls.append(remote)
            else:
                expected_local_paths.append("./" + local.lstrip("./"))
    if set(image_assets) != set(expected_local_paths):
        error("offline-manifest imageAssets must match currently packaged local images")
    if set(image_hashes) != set(image_assets):
        error("offline-manifest imageHashes must contain exactly every packaged local image")
    else:
        import hashlib
        for asset in image_assets:
            digest=hashlib.sha256((ROOT / asset.lstrip('./')).read_bytes()).hexdigest()
            if image_hashes.get(asset) != digest:
                error(f"offline-manifest image hash mismatch: {asset}")
                break
    manifest_urls = []
    for record in remote_images:
        if not isinstance(record, dict):
            error("offline-manifest remoteImages entries must be diagnostic objects")
            continue
        url = record.get("url")
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            error("offline-manifest remote image record missing valid url")
        else:
            manifest_urls.append(url)
        if not record.get("id") or not record.get("label"):
            error("offline-manifest remote image record must include id and label")
    if set(manifest_urls) != set(expected_remote_urls):
        error("offline-manifest remoteImages must include exactly the exact remote fallbacks whose local file is absent")

    allowed_image_dirs = {"food", "shopping", "hotels", "places", "culture", "pose", "airlines", "handbook", "_quarantine"}
    unexpected_image_dirs = [p.name for p in (ROOT / "images").iterdir() if p.is_dir() and p.name not in allowed_image_dirs]
    if unexpected_image_dirs:
        error("images/ contains legacy/unexpected directories: " + ", ".join(sorted(unexpected_image_dirs)))
    if (ROOT / "LOCALIZE_IMAGES_ANACONDA_SSL_FIX.bat").exists() or (ROOT / "tools" / "localize_remote_images.py").exists():
        error("legacy image-localization tool names must be removed; use SYNC_IMAGES.bat / tools/sync_images.py")
    forbidden_remote_tags = re.findall(r'<(?:script|link)\b[^>]+(?:src|href)=["\']https?://', html, re.I)
    if forbidden_remote_tags:
        error("index.html required scripts/styles must be local for offline PWA")
    for marker in ("PREPARE_OFFLINE", "RETRY_OFFLINE_PHOTOS", "CHECK_OFFLINE", "OFFLINE_PROGRESS", "photoLocalMissingItems", "remoteMissingItems", "includePhotos", "offline-manifest.json", "remoteImageRecords", "imageAssets", "imageHashes", "remoteImages", "RECONCILE_IMAGES", "reconcilePackagedImages", "documentNetworkFirst"):
        if marker not in sw:
            error(f"sw.js offline preparation contract missing {marker}")
    for marker in ("data-offline-prepare", "data-offline-select-photos", "data-offline-select-weather", "data-offline-select-all", "data-offline-select-none", "data-offline-retry-missing", "data-offline-missing-list", "data-offline-check", "yunnan-offline-prep-state-v1"):
        if marker not in offline_js:
            error(f"offline.js UI/state contract missing {marker}")
    if "renderOfflineMap" not in map_js or "offline-map-marker" not in map_js:
        error("map.js must keep a no-tile offline schematic map fallback")
    if len(errors) == before:
        passed("PWA selective offline download uses the unified image manifest")


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
    validate_generated_image_sources()
    validate_generated_pose_sources()
    validate_generated_build_manifest()
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
