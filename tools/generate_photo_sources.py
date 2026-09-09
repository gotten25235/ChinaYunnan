#!/usr/bin/env python3
"""Generate docs/sources/PHOTO_SOURCES.md from trip-data.json photo metadata."""
from __future__ import annotations

import argparse
import json
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRIP_PATH = ROOT / "data" / "trip-data.json"
OUTPUT_PATH = ROOT / "docs" / "sources" / "PHOTO_SOURCES.md"


def load_photos() -> dict[str, dict]:
    with TRIP_PATH.open("r", encoding="utf-8") as fh:
        trip = json.load(fh)
    photos = trip.get("photos")
    if not isinstance(photos, dict):
        raise SystemExit("data/trip-data.json > photos must be an object")
    return photos


def clean(value: object) -> str:
    if value is None:
        return "—"
    text = str(value).replace("\n", " ").strip()
    return text or "—"


def cell(value: object) -> str:
    return clean(value).replace("|", "\\|")


def code_list(values: list[str]) -> str:
    return ", ".join(f"`{cell(v)}`" for v in values)


def generated_text() -> str:
    photos = load_photos()
    groups: "OrderedDict[tuple[str, str, str, str], list[tuple[str, dict]]]" = OrderedDict()
    for photo_id, photo in photos.items():
        if not isinstance(photo, dict):
            continue
        key = (
            clean(photo.get("source")),
            clean(photo.get("author")),
            clean(photo.get("license")),
            clean(photo.get("licenseUrl")),
        )
        groups.setdefault(key, []).append((photo_id, photo))

    local_records = sum(
        1 for photo in photos.values()
        if isinstance(photo, dict) and isinstance(photo.get("src"), str)
        and not photo["src"].startswith(("http://", "https://"))
    )
    remote_records = len(photos) - local_records

    lines = [
        "# 圖片來源與授權",
        "",
        "此檔由 `data/trip-data.json > photos` 自動生成，不可手改。網站顯示用圖片、作者、來源、授權與修改註記均以 photo metadata 為準。",
        "",
        f"目前共有 **{len(photos)}** 個 photo records、**{len(groups)}** 組來源；其中 **{local_records}** 個 records 使用本地圖片、**{remote_records}** 個保留遠端原圖。",
        "",
        "規則：具名地點／飯店／景點／店家以 `exact` / `verified` 主體圖為原則；交通／未指定單一場地活動可用 `illustrative`、料理可用 `representative`、文化故事可用 `context`，介面必須標示「示意圖」或「背景圖」。`reference_only` 不作 UI 主圖。兩種連網模式都嘗試 photo registry 的同一張正確來源圖；遠端失敗只顯示無圖，絕不拿其他地點補位。手冊截圖以頁碼與裁切註記追溯。",
        "",
        "| Photo IDs | 說明 | 作者／提供者 | 授權 | 原始來源 | 網站圖片 | 修改／使用註記 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]

    for (source, author, license_name, license_url), rows in groups.items():
        ids = [photo_id for photo_id, _ in rows]
        first = rows[0][1]
        descriptions: list[str] = []
        site_images: list[str] = []
        notes: list[str] = []
        for _, photo in rows:
            description = clean(photo.get("caption") or photo.get("alt"))
            if description != "—" and description not in descriptions:
                descriptions.append(description)
            src = clean(photo.get("src"))
            if src != "—" and src not in site_images:
                site_images.append(src)
            note = clean(photo.get("changes"))
            if note != "—" and note not in notes:
                notes.append(note)

        description_text = descriptions[0]
        if len(descriptions) > 1:
            description_text += f"（另有 {len(descriptions) - 1} 個情境 caption）"
        license_text = cell(license_name)
        if license_url != "—":
            license_text = f"[{license_text}]({cell(license_url)})"
        source_text = f"[來源]({cell(source)})" if source != "—" else "—"
        images_text = code_list(site_images)
        note_text = "；".join(notes) if notes else "—"

        lines.append(
            "| " + " | ".join([
                code_list(ids),
                cell(description_text),
                cell(author),
                license_text,
                source_text,
                images_text,
                cell(note_text),
            ]) + " |"
        )

    lines += [
        "",
        "## 維護",
        "",
        "更新 `trip-data.json > photos` 後執行：",
        "",
        "```bash",
        "python tools/generate_photo_sources.py",
        "python tools/validate_project.py",
        "```",
        "",
        "正式發版使用 `python tools/release.py --zip`，會自動重建此檔。",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Exit non-zero when the generated file is stale")
    args = parser.parse_args()
    text = generated_text()
    if args.check:
        actual = OUTPUT_PATH.read_text(encoding="utf-8") if OUTPUT_PATH.exists() else ""
        if actual != text:
            print(f"STALE {OUTPUT_PATH.relative_to(ROOT)}")
            return 1
        print(f"OK {OUTPUT_PATH.relative_to(ROOT)}")
        return 0
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(text, encoding="utf-8", newline="\n")
    print(f"Generated {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
