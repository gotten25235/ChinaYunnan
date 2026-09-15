#!/usr/bin/env python3
"""Generate tiny build metadata plus hashed App Shell manifest.

build.json is fetched by clients as the only routine update probe.
asset-manifest.json is fetched only when a new Service Worker installs and lets it
copy unchanged App Shell responses from the previous build cache instead of
re-downloading them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "tools" / "release.json"
OFFLINE = ROOT / "offline-manifest.json"
BUILD_OUT = ROOT / "build.json"
ASSET_OUT = ROOT / "asset-manifest.json"
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
BUILD_RE = re.compile(r"^\d{8}-\d{6}$")


def release_info() -> tuple[str, str]:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    version = str(config.get("version") or "") if isinstance(config, dict) else ""
    build = str(config.get("build") or "") if isinstance(config, dict) else ""
    if not VERSION_RE.fullmatch(version):
        raise SystemExit("tools/release.json version must be N.N.N")
    if not BUILD_RE.fullmatch(build):
        raise SystemExit("tools/release.json build must be YYYYMMDD-HHMMSS")
    return version, build


def asset_file(asset: str) -> Path:
    clean = asset.split("?", 1)[0].split("#", 1)[0]
    if clean in (".", "./", ""):
        clean = "./index.html"
    path = ROOT / clean.lstrip("./")
    return path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def generated() -> tuple[dict, dict]:
    version, build = release_info()
    offline = json.loads(OFFLINE.read_text(encoding="utf-8"))
    core_assets = offline.get("coreAssets") if isinstance(offline, dict) else None
    if not isinstance(core_assets, list) or not core_assets:
        raise SystemExit("offline-manifest.json coreAssets is missing")
    hashes: dict[str, str] = {}
    for asset in core_assets:
        if not isinstance(asset, str) or not asset.startswith("./"):
            raise SystemExit(f"Unsupported core asset: {asset!r}")
        path = asset_file(asset)
        if not path.is_file():
            raise SystemExit(f"Core asset file missing: {asset} -> {path.relative_to(ROOT)}")
        hashes[asset] = sha256(path)
    return (
        {"version": version, "build": build},
        {"version": version, "build": build, "assets": hashes},
    )


def text(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated files are stale")
    args = parser.parse_args()
    build_data, asset_data = generated()
    expected = {BUILD_OUT: text(build_data), ASSET_OUT: text(asset_data)}
    if args.check:
        stale = [p.name for p, value in expected.items() if not p.is_file() or p.read_text(encoding="utf-8") != value]
        if stale:
            print("Stale generated build metadata: " + ", ".join(stale))
            return 1
        print("build.json and asset-manifest.json are current")
        return 0
    for path, value in expected.items():
        with path.open("w", encoding="utf-8", newline="\n") as fh:
            fh.write(value)
    print(f"Generated build metadata: {build_data['version']} / {build_data['build']} ({len(asset_data['assets'])} core assets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
