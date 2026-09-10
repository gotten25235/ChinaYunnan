#!/usr/bin/env python3
"""Generate the selective offline-preparation manifest for the static PWA."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "offline-manifest.json"
VERSION = "v1"


def core_assets() -> list[str]:
    """Required app/data resources. Travel photos are intentionally excluded."""
    assets = [
        "./",
        "./index.html",
        "./manifest.webmanifest",
        "./offline-manifest.json",
        f"./css/style.css?v={VERSION}",
    ]
    for name in ("network", "core", "weather", "offline", "settings", "reader", "journey", "map", "library", "app"):
        assets.append(f"./js/{name}.js?v={VERSION}")
    for path in sorted((ROOT / "data").glob("*.json")):
        assets.append("./" + path.relative_to(ROOT).as_posix())
    for path in sorted((ROOT / "icons").rglob("*")) if (ROOT / "icons").exists() else []:
        if path.is_file():
            assets.append("./" + path.relative_to(ROOT).as_posix())
    return list(dict.fromkeys(assets))


def photo_records() -> tuple[list[str], list[dict]]:
    """Return local travel-photo assets and unique remote travel-photo records."""
    trip = json.loads((ROOT / "data" / "trip-data.json").read_text(encoding="utf-8"))
    local: list[str] = []
    by_url: dict[str, dict] = {}
    for photo_id, photo in (trip.get("photos") or {}).items():
        if not isinstance(photo, dict):
            continue
        src = photo.get("src")
        if not isinstance(src, str) or not src:
            continue
        if src.startswith(("http://", "https://")):
            label = photo.get("alt") or photo.get("caption") or photo_id
            record = by_url.get(src)
            if record is None:
                record = {
                    "id": photo_id,
                    "ids": [photo_id],
                    "url": src,
                    "label": str(label),
                    "source": str(photo.get("source") or ""),
                }
                by_url[src] = record
            elif photo_id not in record["ids"]:
                record["ids"].append(photo_id)
            continue
        normalized = "./" + src.lstrip("./")
        if normalized not in local:
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
    OUT.write_text(generated_text(), encoding="utf-8", newline="\n")
    data = generated()
    print(
        f"Generated {OUT.relative_to(ROOT)}: "
        f"{len(data['coreAssets'])} core assets, "
        f"{len(data['photoAssets'])} local photos, "
        f"{len(data['remotePhotos'])} unique remote photos"
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
