#!/usr/bin/env python3
"""Report image delivery status for the Yunnan site without modifying files."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRIP = ROOT / "data" / "trip-data.json"


def main() -> int:
    trip = json.loads(TRIP.read_text(encoding="utf-8"))
    photos = trip.get("photos", {})
    local_paths: list[str] = []
    remote: list[tuple[str, str]] = []
    missing: list[tuple[str, str]] = []

    for photo_id, photo in photos.items():
        src = str(photo.get("src") or "")
        if src.startswith(("http://", "https://")):
            remote.append((photo_id, src))
        else:
            local_paths.append(src)
            if not (ROOT / src).is_file():
                missing.append((photo_id, src))

    unique_local = sorted(set(local_paths))
    local_bytes = sum((ROOT / src).stat().st_size for src in unique_local if (ROOT / src).is_file())
    duplicate_refs = [(src, count) for src, count in Counter(local_paths).items() if count > 1]

    print("Yunnan media audit")
    print(f"  photo records : {len(photos)}")
    print(f"  local records : {len(local_paths)} ({len(unique_local)} unique files)")
    print(f"  local payload : {local_bytes/1024/1024:.2f} MiB")
    print(f"  remote records: {len(remote)}")
    print(f"  missing local : {len(missing)}")
    print(f"  reused local  : {len(duplicate_refs)} paths")
    if remote:
        print("\nRemote photo records (first-load network; runtime Image Cache is Cache First):")
        for photo_id, src in remote:
            print(f"  {photo_id:34} {src}")
    if missing:
        print("\nMissing local images:")
        for photo_id, src in missing:
            print(f"  {photo_id}: {src}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
