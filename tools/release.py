#!/usr/bin/env python3
"""Manage public release version + internal build id, regenerate derived data, validate, and optionally zip.

Public version format: proud.default.shame
- proud: bump when the update is genuinely worth being proud of.
- default: bump for ordinary updates.
- shame: bump when fixing an embarrassingly obvious problem.

Build id format: YYYYMMDD-HHMMSS (Asia/Taipei). The build may change while the
public version stays fixed. Published changes should use --new-build so clients can
update only when version/build differs.

Examples:
  python tools/release.py
  python tools/release.py --new-build
  python tools/release.py --bump default --new-build
  python tools/release.py --new-build --zip ../ChinaYunnan.zip
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "tools" / "release.json"
INDEX = ROOT / "index.html"
SW = ROOT / "sw.js"
VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
BUILD_RE = re.compile(r"^\d{8}-\d{6}$")
BUMP_INDEX = {"proud": 0, "default": 1, "shame": 2}
TAIPEI = timezone(timedelta(hours=8))


def read_release() -> tuple[str, str]:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    version = str(config.get("version") or "") if isinstance(config, dict) else ""
    build = str(config.get("build") or "") if isinstance(config, dict) else ""
    if not VERSION_RE.fullmatch(version):
        raise SystemExit('tools/release.json must contain version "N.N.N"')
    if not BUILD_RE.fullmatch(build):
        raise SystemExit('tools/release.json must contain build "YYYYMMDD-HHMMSS"')
    return version, build


def write_release(version: str, build: str) -> None:
    if not VERSION_RE.fullmatch(version):
        raise SystemExit("version must be N.N.N")
    if not BUILD_RE.fullmatch(build):
        raise SystemExit("build must be YYYYMMDD-HHMMSS")
    with CONFIG.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"version": version, "build": build}, ensure_ascii=False, indent=2) + "\n")


def new_build_id() -> str:
    return datetime.now(TAIPEI).strftime("%Y%m%d-%H%M%S")


def bump_version(version: str, kind: str) -> str:
    match = VERSION_RE.fullmatch(version)
    if not match or kind not in BUMP_INDEX:
        raise SystemExit("invalid version or bump kind")
    parts = [int(x) for x in match.groups()]
    parts[BUMP_INDEX[kind]] += 1
    return ".".join(map(str, parts))


def sync_identification(version: str, build: str) -> None:
    html = INDEX.read_text(encoding="utf-8")
    html, attr_count = re.subn(r'(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)', rf'\g<1>{version}\g<2>', html, count=1)
    if attr_count != 1:
        raise SystemExit("Unable to find data-app-version in index.html")
    if re.search(r'<html\b[^>]*\bdata-app-build="[^"]*"', html):
        html, build_count = re.subn(r'(<html\b[^>]*\bdata-app-build=")[^"]+("[^>]*>)', rf'\g<1>{build}\g<2>', html, count=1)
    else:
        html, build_count = re.subn(r'(<html\b[^>]*\bdata-app-version="[^"]+")', rf'\1 data-app-build="{build}"', html, count=1)
    if build_count != 1:
        raise SystemExit("Unable to synchronize data-app-build in index.html")
    pattern = re.compile(r'((?:css/(?:style|banner)\.css|js/(?:network|core|analytics|weather|offline|settings|reader|journey|map|library|banner|app)\.js)\?v=)[^"\']+')
    html, count = pattern.subn(lambda m: m.group(1) + version, html)
    if count != 14:
        raise SystemExit(f"Expected 14 versioned local CSS/JS references in index.html, found {count}")
    with INDEX.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)

    sw = SW.read_text(encoding="utf-8")
    sw, version_count = re.subn(r"const RELEASE_VERSION = '[^']+';", f"const RELEASE_VERSION = '{version}';", sw, count=1)
    sw, build_count = re.subn(r"const BUILD_ID = '[^']+';", f"const BUILD_ID = '{build}';", sw, count=1)
    if version_count != 1:
        raise SystemExit("Unable to find RELEASE_VERSION in sw.js")
    if build_count != 1:
        raise SystemExit("Unable to find BUILD_ID in sw.js")
    with SW.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(sw)


def run_tool(name: str, *args: str) -> None:
    command = [sys.executable, str(ROOT / "tools" / name), *args]
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)


def make_zip(destination: Path) -> None:
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    excluded_dirs = {".git", "__pycache__", "dist"}
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        # Preserve canonical image categories even when a category (for example pose)
        # has not been localized yet. This keeps the extracted project layout deterministic.
        for directory in ("food", "shopping", "hotels", "places", "pose", "airlines", "handbook"):
            archive.writestr("images/%s/" % directory, b"")
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file() or any(part in excluded_dirs for part in path.relative_to(ROOT).parts):
                continue
            if path.resolve() == destination:
                continue
            archive.write(path, path.relative_to(ROOT).as_posix())
    print(f"Created {destination}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bump", choices=tuple(BUMP_INDEX), help="Increment proud, default, or shame counter")
    parser.add_argument("--new-build", action="store_true", help="Generate a new internal build id without requiring a public version bump")
    parser.add_argument("--zip", nargs="?", const="", help="Create release zip; optional output path")
    args = parser.parse_args()

    version, build = read_release()
    changed = False
    if args.bump:
        old = version
        version = bump_version(version, args.bump)
        changed = True
        print(f"Version bump ({args.bump}): {old} -> {version}")
    if args.new_build:
        old_build = build
        build = new_build_id()
        changed = True
        print(f"Build refresh: {old_build} -> {build}")
    if changed:
        write_release(version, build)

    sync_identification(version, build)
    run_tool("generate_source_index.py")
    run_tool("generate_image_sources.py")
    run_tool("generate_pose_sources.py")
    run_tool("generate_offline_manifest.py")
    run_tool("generate_build_manifest.py")
    run_tool("validate_project.py")

    if args.zip is not None:
        destination = Path(args.zip) if args.zip else ROOT / "dist" / f"yunnan_{version}_{build}.zip"
        if not destination.is_absolute():
            destination = ROOT / destination
        make_zip(destination)

    print(f"Release synchronized: {version} / build {build}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
