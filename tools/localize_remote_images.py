#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRIP_PATH = ROOT / "data" / "trip-data.json"
REMOTE_DIR = ROOT / "images" / "remote"
OUT_ZIP = ROOT.parent / "yunnan_v1_all_local.zip"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36"


def is_remote(src: object) -> bool:
    return isinstance(src, str) and src.startswith(("http://", "https://"))


def safe_name(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")
    return value or "image"


def wsrv_url(source: str) -> str:
    # Server-side resize/re-encode keeps the package compact and ensures WebP-only media.
    encoded = urllib.parse.quote(source, safe="")
    return f"https://wsrv.nl/?url={encoded}&w=1280&we=1&output=webp&q=82"


def download_webp(source: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    req = urllib.request.Request(
        wsrv_url(source),
        headers={
            "User-Agent": UA,
            "Accept": "image/webp,image/*,*/*;q=0.8",
        },
    )
    print(f"  GET {source}")
    with urllib.request.urlopen(req, timeout=90) as response, tmp.open("wb") as fh:
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            fh.write(chunk)
    head = tmp.read_bytes()[:12]
    if len(head) < 12 or head[:4] != b"RIFF" or head[8:12] != b"WEBP":
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded payload is not WebP: {source}")
    if tmp.stat().st_size < 1024:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded image is unexpectedly small: {source}")
    os.replace(tmp, target)


def run_tool(name: str) -> None:
    path = ROOT / "tools" / name
    if not path.is_file():
        return
    print(f"\n> {name}")
    proc = subprocess.run([sys.executable, str(path)], cwd=ROOT)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def build_zip() -> None:
    if OUT_ZIP.exists():
        OUT_ZIP.unlink()
    with zipfile.ZipFile(OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file():
                continue
            if "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            zf.write(path, path.relative_to(ROOT).as_posix())
    print(f"\nZIP: {OUT_ZIP}")


def main() -> None:
    data = json.loads(TRIP_PATH.read_text(encoding="utf-8"))
    photos = data.get("photos")
    if not isinstance(photos, dict):
        raise SystemExit("trip-data.json: photos must be an object")

    remote_records = [(pid, p) for pid, p in photos.items() if isinstance(p, dict) and is_remote(p.get("src"))]
    if not remote_records:
        print("No remote photo URLs found. Building ZIP from the current V1 tree.")
        build_zip()
        return

    by_url: dict[str, list[str]] = {}
    for pid, photo in remote_records:
        by_url.setdefault(photo["src"], []).append(pid)

    print(f"Remote photo records: {len(remote_records)}")
    print(f"Unique remote images: {len(by_url)}")
    REMOTE_DIR.mkdir(parents=True, exist_ok=True)

    url_to_local: dict[str, str] = {}
    for index, (source, ids) in enumerate(by_url.items(), 1):
        base_id = safe_name(ids[0])
        rel = f"images/remote/{base_id}.webp"
        target = ROOT / rel
        print(f"[{index}/{len(by_url)}] {', '.join(ids)} -> {rel}")
        if target.is_file():
            head = target.read_bytes()[:12]
            if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                print("  existing valid WebP; reuse")
            else:
                target.unlink(missing_ok=True)
                download_webp(source, target)
        else:
            download_webp(source, target)
        url_to_local[source] = rel

    change_note = "本地化時重新編碼為 WebP（最長邊不超過 1280px），供離線與節省手機流量使用。"
    for pid, photo in remote_records:
        old = photo["src"]
        photo["src"] = url_to_local[old]
        existing = str(photo.get("changes") or "").strip()
        if change_note not in existing:
            photo["changes"] = (existing + (" " if existing else "") + change_note).strip()

    TRIP_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Regenerate derived documentation/index and validate the finalized tree.
    run_tool("generate_source_index.py")
    run_tool("generate_photo_sources.py")
    run_tool("validate_project.py")
    build_zip()

    remaining = [pid for pid, p in photos.items() if isinstance(p, dict) and is_remote(p.get("src"))]
    if remaining:
        raise SystemExit("Remote photo URLs remain: " + ", ".join(remaining))
    print("\nDone: all photo src values are local WebP files.")


if __name__ == "__main__":
    main()
