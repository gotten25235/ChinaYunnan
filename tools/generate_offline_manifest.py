#!/usr/bin/env python3
"""Generate the selective offline-preparation manifest for the static PWA.

Photo rule: prefer a local photo.src when that file exists. If the local file is not
present yet and photo.remoteSrc exists, prepare the exact remote fallback instead.
Never require both copies for the same photo record.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "offline-manifest.json"
CONFIG = ROOT / "tools" / "release.json"


def release_version() -> str:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    version = str(config.get("version") or "") if isinstance(config, dict) else ""
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise SystemExit("tools/release.json version must be N.N.N")
    return version


VERSION = release_version()


def core_assets() -> list[str]:
    """Required app/data resources. Travel photos are intentionally excluded."""
    assets = [
        "./",
        "./index.html",
        "./manifest.webmanifest",
        "./offline-manifest.json",
        f"./css/style.css?v={VERSION}",
        f"./css/banner.css?v={VERSION}",
        f"./js/banner.js?v={VERSION}",
    ]
    for name in ("network", "core", "analytics", "weather", "offline", "settings", "reader", "journey", "map", "library", "app"):
        assets.append(f"./js/{name}.js?v={VERSION}")
    for path in sorted((ROOT / "data").glob("*.json")):
        if path.name == "analytics-config.json":
            continue
        assets.append("./" + path.relative_to(ROOT).as_posix())
    for path in sorted((ROOT / "icons").rglob("*")) if (ROOT / "icons").exists() else []:
        if path.is_file():
            assets.append("./" + path.relative_to(ROOT).as_posix())
    return list(dict.fromkeys(assets))


def is_remote(value: object) -> bool:
    return isinstance(value, str) and value.startswith(("http://", "https://"))


def photo_records() -> tuple[list[str], list[dict]]:
    """Return one offline-preparation source per photo: local first, exact remote fallback second."""
    trip = json.loads((ROOT / "data" / "trip-data.json").read_text(encoding="utf-8"))
    local: list[str] = []
    by_url: dict[str, dict] = {}
    for photo_id, photo in (trip.get("photos") or {}).items():
        if not isinstance(photo, dict):
            continue
        src = photo.get("src")
        if not isinstance(src, str) or not src:
            continue

        # src is a local-first contract. Include it only when the packaged file exists.
        if not is_remote(src):
            normalized = "./" + src.lstrip("./")
            if (ROOT / src).is_file():
                if normalized not in local:
                    local.append(normalized)
                continue

        # If the local file is intentionally not packaged yet, prepare the same-subject remoteSrc.
        remote = photo.get("remoteSrc")
        if is_remote(remote):
            remote = str(remote)
            label = photo.get("alt") or photo.get("caption") or photo_id
            record = by_url.get(remote)
            if record is None:
                record = {
                    "id": photo_id,
                    "ids": [photo_id],
                    "url": remote,
                    "label": str(label),
                    "source": str(photo.get("source") or ""),
                    "localSrc": str(src),
                }
                by_url[remote] = record
            elif photo_id not in record["ids"]:
                record["ids"].append(photo_id)
            continue

        # Keep an actually-missing local asset visible to the offline checker when no remote fallback exists.
        if not is_remote(src):
            normalized = "./" + src.lstrip("./")
            if normalized not in local:
                local.append(normalized)

    # Pose reference visuals may be packaged locally when a stable copy is needed.
    # Keep those local WebP files in selective offline preparation; remote pose visuals
    # still rely on the runtime image cache after their first successful network load.
    for spot in trip.get("photoSpots", []):
        if not isinstance(spot, dict):
            continue
        for tip in spot.get("poseTips", []):
            if not isinstance(tip, dict):
                continue
            source_image = tip.get("sourceImage")
            if isinstance(source_image, str) and not is_remote(source_image):
                normalized = "./" + source_image.lstrip("./")
                if (ROOT / source_image).is_file() and normalized not in local:
                    local.append(normalized)

    return local, list(by_url.values())


def generated() -> dict:
    local_photos, remote_photos = photo_records()
    return {
        "schemaVersion": "v1",
        "coreAssets": core_assets(),
        "photoAssets": local_photos,
        "remotePhotos": remote_photos,
        "optionalRuntime": [
            "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
            "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
            "https://unpkg.com.cn/leaflet@1.9.4/dist/leaflet.css",
            "https://unpkg.com.cn/leaflet@1.9.4/dist/leaflet.js"
        ]
    }


def generated_text() -> str:
    return json.dumps(generated(), ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    with OUT.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(generated_text())
    data = generated()
    print(
        f"Generated {OUT.relative_to(ROOT)}: "
        f"{len(data['coreAssets'])} core assets, "
        f"{len(data['photoAssets'])} packaged local photos, "
        f"{len(data['remotePhotos'])} remote fallbacks used only where local src is absent"
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
