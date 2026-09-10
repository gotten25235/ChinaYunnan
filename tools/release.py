#!/usr/bin/env python3
"""Apply the fixed V1 identification, regenerate derived data, validate, and optionally zip.

Examples:
  python tools/release.py
  python tools/release.py --zip
  python tools/release.py --zip ../yunnan_v1.zip
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


def read_identification() -> str:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if config != {"version": "v1"}:
        raise SystemExit('tools/release.json must contain only {"version": "v1"}')
    return config["version"]


def sync_identification(version: str) -> None:
    html = INDEX.read_text(encoding="utf-8")
    pattern = re.compile(r'((?:css/style\.css|js/(?:network|core|weather|offline|reader|journey|map|library|app)\.js)\?v=)[^"\']+')
    html, count = pattern.subn(lambda m: m.group(1) + version, html)
    if count != 10:
        raise SystemExit(f"Expected 10 identified local CSS/JS references in index.html, found {count}")
    INDEX.write_text(html, encoding="utf-8", newline="\n")

    sw = SW.read_text(encoding="utf-8")
    sw, count = re.subn(r"const VERSION = '[^']+';", f"const VERSION = '{version}';", sw, count=1)
    if count != 1:
        raise SystemExit("Unable to find VERSION in sw.js")
    SW.write_text(sw, encoding="utf-8", newline="\n")


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
    parser.add_argument("--zip", nargs="?", const="", help="Create V1 release zip; optional output path")
    args = parser.parse_args()

    version = read_identification()
    sync_identification(version)
    run_tool("generate_source_index.py")
    run_tool("generate_photo_sources.py")
    run_tool("generate_offline_manifest.py")
    run_tool("validate_project.py")

    if args.zip is not None:
        destination = Path(args.zip) if args.zip else ROOT / "dist" / "yunnan_v1.zip"
        if not destination.is_absolute():
            destination = ROOT / destination
        make_zip(destination)

    print(f"Release synchronized: {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
