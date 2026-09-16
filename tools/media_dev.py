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
    images = trip.get("images", {})
    local_paths: list[str] = []
    remote: list[tuple[str, str]] = []
    pending_sync: list[tuple[str, str, str]] = []
    broken: list[tuple[str, str]] = []

    for image_id, image in images.items():
        local = str(image.get("local") or "")
        remote_url = str(image.get("remote") or "")
        if local:
            local_paths.append(local)
        if remote_url:
            remote.append((image_id, remote_url))
        if local and not (ROOT / local).is_file():
            if remote_url:
                pending_sync.append((image_id, local, remote_url))
            else:
                broken.append((image_id, local))

    unique_local = sorted(set(local_paths))
    local_bytes = sum((ROOT / src).stat().st_size for src in unique_local if (ROOT / src).is_file())
    duplicate_refs = [(src, count) for src, count in Counter(local_paths).items() if count > 1]

    print("Yunnan media dev report")
    print(f"  image records : {len(images)}")
    print(f"  local records : {len(local_paths)} ({len(unique_local)} unique files)")
    print(f"  local payload : {local_bytes/1024/1024:.2f} MiB")
    print(f"  remote fallback: {len(remote)}")
    print(f"  pending sync   : {len(pending_sync)}")
    print(f"  broken records : {len(broken)}")
    print(f"  reused local  : {len(duplicate_refs)} paths")
    if pending_sync:
        print("\nPending exact-image sync (browser currently falls back to the listed remote URL):")
        for image_id, local, remote_url in pending_sync:
            print(f"  {image_id:34} {local} <- {remote_url}")
    if broken:
        print("\nBroken image records (missing local file and no remote fallback):")
        for image_id, local in broken:
            print(f"  {image_id}: {local}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
