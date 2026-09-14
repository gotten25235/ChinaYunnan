#!/usr/bin/env python3
"""Manage the public release version, regenerate derived data, validate, and optionally zip.

Version format: proud.default.shame
- proud: bump when the update is genuinely worth being proud of.
- default: bump for ordinary updates.
- shame: bump when fixing an embarrassingly obvious problem.

Counters are independent: 2.7.123 -> proud 3.7.123 / default 2.8.123 / shame 2.7.124.

Examples:
  python tools/release.py
  python tools/release.py --bump default
  python tools/release.py --bump shame --zip
  python tools/release.py --bump proud --zip ../yunnan_release.zip
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "tools" / "release.json"
INDEX = ROOT / "index.html"
SW = ROOT / "sw.js"
VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
BUMP_INDEX = {"proud": 0, "default": 1, "shame": 2}


def read_version() -> str:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    version = str(config.get("version") or "") if isinstance(config, dict) else ""
    if not VERSION_RE.fullmatch(version):
        raise SystemExit('tools/release.json must contain {"version":"N.N.N"}')
    return version


def write_version(version: str) -> None:
    if not VERSION_RE.fullmatch(version):
        raise SystemExit("version must be N.N.N")
    with CONFIG.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"version": version}, ensure_ascii=False, indent=2) + "\n")


def bump_version(version: str, kind: str) -> str:
    match = VERSION_RE.fullmatch(version)
    if not match or kind not in BUMP_INDEX:
        raise SystemExit("invalid version or bump kind")
    parts = [int(x) for x in match.groups()]
    parts[BUMP_INDEX[kind]] += 1
    return ".".join(map(str, parts))


def sync_identification(version: str) -> None:
    html = INDEX.read_text(encoding="utf-8")
    html, attr_count = re.subn(r'(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)', rf'\g<1>{version}\g<2>', html, count=1)
    if attr_count != 1:
        raise SystemExit("Unable to find data-app-version in index.html")
    pattern = re.compile(r'((?:css/(?:style|banner)\.css|js/(?:network|core|analytics|weather|offline|settings|reader|journey|map|library|banner|app)\.js)\?v=)[^"\']+')
    html, count = pattern.subn(lambda m: m.group(1) + version, html)
    if count != 14:
        raise SystemExit(f"Expected 14 versioned local CSS/JS references in index.html, found {count}")
    with INDEX.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)

    sw = SW.read_text(encoding="utf-8")
    sw, count = re.subn(r"const RELEASE_VERSION = '[^']+';", f"const RELEASE_VERSION = '{version}';", sw, count=1)
    if count != 1:
        raise SystemExit("Unable to find RELEASE_VERSION in sw.js")
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
    parser.add_argument("--zip", nargs="?", const="", help="Create release zip; optional output path")
    args = parser.parse_args()

    version = read_version()
    if args.bump:
        old = version
        version = bump_version(version, args.bump)
        write_version(version)
        print(f"Version bump ({args.bump}): {old} -> {version}")

    sync_identification(version)
    run_tool("generate_source_index.py")
    run_tool("generate_photo_sources.py")
    run_tool("generate_offline_manifest.py")
    run_tool("validate_project.py")

    if args.zip is not None:
        destination = Path(args.zip) if args.zip else ROOT / "dist" / f"yunnan_{version}.zip"
        if not destination.is_absolute():
            destination = ROOT / destination
        make_zip(destination)

    print(f"Release synchronized: {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
