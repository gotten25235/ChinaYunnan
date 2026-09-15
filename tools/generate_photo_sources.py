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


def load_trip() -> dict:
    with TRIP_PATH.open("r", encoding="utf-8") as fh:
        trip = json.load(fh)
    photos = trip.get("photos")
    if not isinstance(photos, dict):
        raise SystemExit("data/trip-data.json > photos must be an object")
    return trip


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
    trip = load_trip()
    photos = trip["photos"]
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
    remote_fallback_records = sum(
        1 for photo in photos.values()
        if isinstance(photo, dict) and isinstance(photo.get("remoteSrc"), str)
        and photo["remoteSrc"].startswith(("http://", "https://"))
    )

    lines = [
        "# 圖片來源與授權",
        "",
        "此檔由 `data/trip-data.json > photos` 自動生成，不可手改。網站顯示用圖片、作者、來源、授權與修改註記均以 photo metadata 為準。",
        "",
        f"目前共有 **{len(photos)}** 個 photo records、**{len(groups)}** 組來源；**{local_records}** 個 records 的 `src` 全部固定為本地路徑，其中 **{remote_fallback_records}** 個另保留 `remoteSrc` 作同一張圖片的網路備援。",
        "",
        "讀圖契約固定為 `src 本地 WebP → remoteSrc（若有）→ 無此圖`。`LOCALIZE_IMAGES_ANACONDA_SSL_FIX.bat` 只負責把 `remoteSrc` 下載／轉碼到 `src` 指定位置，不會把 metadata 在本地／網路模式之間切換，也不使用其他地點或自製示意圖當備援。具名地點／飯店／景點／店家仍以 `exact` / `verified` 主體圖為原則；交通／未指定單一場地活動可用 `illustrative`、料理可用 `representative`、文化故事可用 `context`，介面必須標示「示意圖」或「背景圖」。`reference_only` 不作 UI 主圖。",
        "",
        "| Photo IDs | 說明 | 作者／提供者 | 授權 | 原始來源 | 本地 `src` | 網路 `remoteSrc` | 修改／使用註記 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    for (source, author, license_name, license_url), rows in groups.items():
        ids = [photo_id for photo_id, _ in rows]
        first = rows[0][1]
        descriptions: list[str] = []
        site_images: list[str] = []
        remote_images: list[str] = []
        notes: list[str] = []
        for _, photo in rows:
            description = clean(photo.get("caption") or photo.get("alt"))
            if description != "—" and description not in descriptions:
                descriptions.append(description)
            src = clean(photo.get("src"))
            if src != "—" and src not in site_images:
                site_images.append(src)
            remote_src = clean(photo.get("remoteSrc"))
            if remote_src != "—" and remote_src not in remote_images:
                remote_images.append(remote_src)
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
        remote_text = "<br>".join(f"[網路圖]({cell(url)})" for url in remote_images) if remote_images else "—"
        note_text = "；".join(notes) if notes else "—"

        lines.append(
            "| " + " | ".join([
                code_list(ids),
                cell(description_text),
                cell(author),
                license_text,
                source_text,
                images_text,
                remote_text,
                cell(note_text),
            ]) + " |"
        )

    # Pose references use actual public-source visuals with explicit provenance. They are
    # separate from the site's primary photo records and do not imply reusable licensing.
    spots = trip.get("photoSpots") if isinstance(trip.get("photoSpots"), list) else []
    pose_rows: list[tuple[str, list[dict]]] = []
    for spot in spots:
        if not isinstance(spot, dict):
            continue
        tips = [tip for tip in spot.get("poseTips", []) if isinstance(tip, dict) and tip.get("sourceImage")]
        if tips:
            pose_rows.append((clean(spot.get("name") or spot.get("id")), tips))

    lines += [
        "",
        "## 旅拍 Pose 來源實拍",
        "",
        "旅拍指南的 Pose 卡改為直接顯示可追溯的公開來源實拍，不再使用本地重畫 Pose 圖。小紅書／抖音／大眾點評仍用於機位研究；若原貼連結不穩定，視覺參考可採用能正常載入且可追溯的攜程、Trip.com、旅遊部落格等公開來源。每張參考圖的完整 URL、來源頁、平台、已知作者／日期另列於 `POSE_SCREENSHOT_SOURCES.md`。這些參考圖不納入一般景點主圖授權表，也不宣稱具有可重用授權。",
        "",
        f"目前共有 **{sum(len(tips) for _, tips in pose_rows)}** 張來源實拍參考，涵蓋 **{len(pose_rows)}** 個旅拍地點。",
        "",
        "| 旅拍地點 | 視覺來源平台 | 機位研究平台 | 用途 |",
        "| --- | --- | --- | --- |",
    ]
    for place_name, tips in pose_rows:
        visual_platforms: list[str] = []
        research_platforms: list[str] = []
        for tip in tips:
            for key, target in (("sourcePlatform", visual_platforms), ("platform", research_platforms)):
                platform = clean(tip.get(key))
                if platform != "—" and platform not in target:
                    target.append(platform)
        lines.append(
            "| " + " | ".join([
                cell(place_name),
                cell("、".join(visual_platforms) if visual_platforms else "—"),
                cell("、".join(research_platforms) if research_platforms else "—"),
                "來源實拍＋Pose／攝影位置／鏡頭建議；來源頁供追溯",
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
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print(f"Generated {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
