#!/usr/bin/env python3
"""Optimize locally stored project images for mobile delivery.

The script is intentionally conservative: it never downloads remote media. It converts
local JPEG/PNG photo assets referenced by trip-data.json to WebP, updates local path
references in project text files, and deletes the replaced source files. The runtime
image contract accepts one primary `src` per photo record.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
TRIP_PATH = ROOT / "data" / "trip-data.json"
TEXT_EXTENSIONS = {".md", ".html", ".css", ".js", ".json", ".bat", ".txt"}


def load_trip() -> dict:
    with TRIP_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def local_path(value: object) -> Path | None:
    if not isinstance(value, str) or not value or value.startswith(("http://", "https://", "data:")):
        return None
    path = (ROOT / value).resolve()
    try:
        path.relative_to(ROOT.resolve())
    except ValueError:
        return None
    return path


def target_for(path: Path) -> Path:
    return path.with_suffix(".webp")


def convert_image(source: Path, target: Path, quality: int) -> tuple[int, int]:
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - explicit runtime diagnostic
        raise SystemExit("Pillow is required: python -m pip install Pillow") from exc

    with Image.open(source) as image:
        if "A" in image.getbands():
            rgba = image.convert("RGBA")
            canvas = Image.new("RGB", rgba.size, "white")
            canvas.paste(rgba, mask=rgba.getchannel("A"))
            image = canvas
        else:
            image = image.convert("RGB")
        width, height = image.size
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=quality, method=6)
        return width, height


def project_text_files() -> Iterable[Path]:
    for path in ROOT.rglob("*"):
        if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS and ".git" not in path.parts:
            yield path


def replace_text_paths(replacements: dict[str, str]) -> None:
    if not replacements:
        return
    for path in project_text_files():
        if path == TRIP_PATH:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        updated = text
        for old, new in replacements.items():
            updated = updated.replace(old, new)
        if updated != text:
            path.write_text(updated, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quality", type=int, default=78, help="WebP quality (default: 78)")
    parser.add_argument("--dry-run", action="store_true", help="Report planned work without writing files")
    args = parser.parse_args()
    if not 1 <= args.quality <= 100:
        parser.error("--quality must be between 1 and 100")

    trip = load_trip()
    photos = trip.get("photos", {})
    replacements: dict[str, str] = {}
    sources: dict[Path, str] = {}
    local_values: list[tuple[dict | None, str, str]] = []
    for photo in photos.values():
        src = photo.get("src")
        path = local_path(src)
        if path and path.exists():
            local_values.append((photo, "src", src))
    hero = trip.get("heroImage")
    hero_path = local_path(hero)
    if hero_path and hero_path.exists():
        local_values.append((None, "heroImage", hero))

    for owner, field, rel in local_values:
        source = local_path(rel)
        if not source or source.suffix.lower() == ".webp":
            continue
        target = target_for(source)
        new_rel = target.relative_to(ROOT).as_posix()
        sources[source] = new_rel
        replacements[rel] = new_rel
        if owner is not None:
            owner[field] = new_rel
        else:
            trip[field] = new_rel

    before = sum(path.stat().st_size for path in sources if path.exists())
    if args.dry_run:
        print(f"Would convert {len(sources)} image files")
        for source, rel in sorted(sources.items(), key=lambda x: x[0].as_posix()):
            print(f"  {source.relative_to(ROOT).as_posix()} -> {rel}")
        return 0

    for source, rel in sorted(sources.items(), key=lambda x: x[0].as_posix()):
        target = ROOT / rel
        width, height = convert_image(source, target, args.quality)
        # Keep metadata dimensions truthful for every photo that points to the optimized file.
        for photo in photos.values():
            if photo.get("src") == rel:
                photo["width"], photo["height"] = width, height

    TRIP_PATH.write_text(json.dumps(trip, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    replace_text_paths(replacements)

    # Remove superseded originals only after all replacements have been written.
    for source in sources:
        try:
            source.unlink()
        except FileNotFoundError:
            pass

    after = sum((ROOT / rel).stat().st_size for rel in set(sources.values()) if (ROOT / rel).exists())
    saved = max(0, before - after)
    print(f"Optimized {len(sources)} local images to WebP (quality={args.quality}).")
    print(f"Local optimized payload: {before/1024/1024:.2f} MiB -> {after/1024/1024:.2f} MiB (saved {saved/1024/1024:.2f} MiB).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
