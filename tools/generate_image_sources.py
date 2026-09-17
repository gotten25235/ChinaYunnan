#!/usr/bin/env python3
"""Generate docs/sources/IMAGE_SOURCES.md from the unified image registry."""
from __future__ import annotations
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRIP_PATH = ROOT / "data" / "trip-data.json"
OUTPUT_PATH = ROOT / "docs" / "sources" / "IMAGE_SOURCES.md"
SCHEMA_FIELDS = ("local","remote","alt","caption","source","author","license","licenseUrl","width","height","changes")
# Keep these shopping records in the runtime registry, but omit them from the public-facing Markdown ledger.
DOC_OMIT_IDS = {"souvenir-tamarind-cake", "souvenir-tamarind", "souvenir-wild-mushroom-beer"}


def clean(value):
    if value is None:
        return "—"
    text = str(value).replace("\n", " ").strip()
    return text or "—"


def cell(value):
    return clean(value).replace("|", "\\|")


def code(value):
    value = clean(value)
    return "—" if value == "—" else "`%s`" % cell(value)


def link(label, url):
    url = clean(url)
    return "[%s](%s)" % (label, cell(url)) if url != "—" else "—"


def generated_text():
    trip = json.loads(TRIP_PATH.read_text(encoding="utf-8"))
    images = trip.get("images")
    if not isinstance(images, dict):
        raise SystemExit("data/trip-data.json > images must be an object")

    local_present = 0
    pending = 0
    rows = []
    for image_id, image in images.items():
        if image_id in DOC_OMIT_IDS or not isinstance(image, dict):
            continue
        local = clean(image.get("local"))
        if local != "—" and (ROOT / local).is_file():
            local_present += 1
        else:
            pending += 1
        rows.append((image_id, image))

    lines = [
        "# 圖片來源與授權",
        "",
        "此檔由 `data/trip-data.json > images` 自動生成，不可手改。全站景點、飯店、美食、伴手禮、文化與旅拍 Pose 共用同一個 Image Registry。",
        "",
        "唯一讀圖規則：`imageId → local → remote → 無此圖`。每一筆 image record **都必須同時保留 `local` 與 `remote`**；本地化後也不可刪除 `remote`。`remote` 必須是同一張圖片的精確網路圖片 URL；`source` 才是用來追溯作者、來源頁與授權的頁面。",
        "",
        "Image Registry 固定只允許 11 個欄位：`local`、`remote`、`alt`、`caption`、`source`、`author`、`license`、`licenseUrl`、`width`、`height`、`changes`。內容 entity 只保存 `imageId`，不重複保存圖片 URL 或來源 metadata。",
        "",
        "圖片實體依用途分成 `images/food/`、`images/shopping/`、`images/hotels/`、`images/places/`、`images/culture/`、`images/pose/`、`images/airlines/`、`images/handbook/` 八類；`images/culture/` 是「風俗與故事」圖片的 canonical asset。其他 Domain 若使用同一張圖，直接引用既有 `culture-*` imageId，不在 `images/places/` 再存一份。",
        "",
        "本文件列出 **%d** 筆 image records；**%d** 筆本地 WebP 已存在；**%d** 筆等待由 exact remote 同步。" % (len(rows), local_present, pending),
        "",
        "| Image ID | 說明 | 本地 `local` | 精確 `remote` | 來源／作者 | 授權 | 尺寸 | 修改／使用註記 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    for image_id, image in rows:
        description = image.get("caption") or image.get("alt") or "—"
        source = clean(image.get("source"))
        author = clean(image.get("author"))
        source_cell = link(cell(author if author != "—" else "來源"), source)
        license_name = clean(image.get("license"))
        license_url = clean(image.get("licenseUrl"))
        license_cell = link(cell(license_name if license_name != "—" else "授權／來源"), license_url)
        dims = "%s×%s" % (clean(image.get("width")), clean(image.get("height")))
        lines.append("| " + " | ".join([
            code(image_id),
            cell(description),
            code(image.get("local")),
            link("remote", image.get("remote")),
            source_cell,
            license_cell,
            cell(dims),
            cell(image.get("changes")),
        ]) + " |")

    lines += [
        "",
        "## 維護規則",
        "",
        "- `remote` 是 runtime fallback 與 `SYNC_IMAGES.bat` 的唯一下載目標；不得拿 `source` 頁面猜圖。",
        "- `source` 只負責追溯來源頁；`author`、`license`、`licenseUrl` 記錄權利資訊；`changes` 記錄本地化／裁切／轉檔。",
        "- `width` / `height` 記錄目前 local WebP 的實際尺寸。local 尚未同步時兩者可暫為 `0`；同步成功後工具會自動回寫實際尺寸。",
        "- `images` object 的 key 即 imageId；record 只使用正式 Image Registry 欄位，不重複保存 `id`。",
        "- `SYNC_IMAGES.bat` 只下載 registry 中指定的 exact remote，不搜尋、不猜測、不替換成相似圖。",
        "",
        "```bash",
        "python tools/generate_image_sources.py",
        "python tools/generate_pose_sources.py",
        "python tools/generate_offline_manifest.py",
        "python tools/generate_build_manifest.py",
        "python tools/validate_project.py",
        "```",
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = generated_text()
    if args.check:
        actual = OUTPUT_PATH.read_text(encoding="utf-8") if OUTPUT_PATH.exists() else ""
        if actual != text:
            print("STALE", OUTPUT_PATH.relative_to(ROOT))
            return 1
        print("OK", OUTPUT_PATH.relative_to(ROOT))
        return 0
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(text, encoding="utf-8")
    print("Generated", OUTPUT_PATH.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
