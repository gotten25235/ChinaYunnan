#!/usr/bin/env python3
"""Generate docs/sources/POSE_SCREENSHOT_SOURCES.md from poseTips + the unified image registry."""
from __future__ import annotations
import argparse, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TRIP=ROOT/'data/trip-data.json'
OUT=ROOT/'docs/sources/POSE_SCREENSHOT_SOURCES.md'

def clean(v):
    if v is None:return '—'
    t=str(v).replace('\n',' ').strip()
    return t or '—'

def cell(v):return clean(v).replace('|','\\|')
def link(label,url):
    url=clean(url)
    return f'[{label}]({url})' if url!='—' else '—'

def generated_text():
    trip=json.loads(TRIP.read_text(encoding='utf-8'))
    images=trip.get('images') if isinstance(trip.get('images'),dict) else {}
    rows=[]
    for spot in trip.get('photoSpots',[]):
        if not isinstance(spot,dict):continue
        for tip in spot.get('poseTips',[]) or []:
            if not isinstance(tip,dict):continue
            rows.append((spot,tip,images.get(tip.get('imageId')) if tip.get('imageId') else None))
    lines=[
        '# 旅拍指南｜來源實拍與機位研究','',
        '此檔由 `data/trip-data.json > photoSpots > poseTips` 與統一 `images` registry 自動生成，不可手改。','',
        '## 使用原則','',
        '- Pose 本身只保存 `imageId` 與姿勢／鏡頭／機位研究資料；圖片來源、作者、授權、local 與 remote 全部只放在 `images[imageId]`。',
        '- 唯一流程是 `imageId → local → remote → 無此圖`。`remote` 本地化後仍永久保留，`SYNC_IMAGES.bat` 只下載該 exact URL。',
        '- 同一拍照場景的不同 Pose 必須使用不同 imageId 與不同 exact remote URL。',
        '- 第三方圖片的來源標示不等於取得再利用授權；本專案只作私人旅程拍照參考。','',
        f'目前共 **{len(rows)}** 組 Pose 參考。','',
        '| 地點 | Pose | Image ID | 本地檔 | exact remote | 來源頁／作者 | 機位研究 |',
        '| --- | --- | --- | --- | --- | --- | --- |',
    ]
    for spot,tip,image in rows:
        image=image if isinstance(image,dict) else {}
        source_label=clean(image.get('author'))
        source=link(cell(source_label if source_label!='—' else '來源頁'),image.get('source'))
        research_platform=clean(tip.get('platform'));research_url=clean(tip.get('url'))
        research=link(cell(research_platform),research_url) if research_url!='—' else cell(research_platform)
        lines.append('| '+' | '.join([
            cell(spot.get('name') or spot.get('id')),
            cell(tip.get('title')),
            f'`{cell(tip.get("imageId"))}`',
            f'`{cell(image.get("local"))}`',
            link('remote',image.get('remote')),
            source,
            research,
        ])+' |')
    lines += ['', '## 維護', '', '更新旅拍來源後執行：', '', '```bash', 'python tools/generate_pose_sources.py', 'python tools/generate_image_sources.py', 'python tools/validate_project.py', '```', '']
    return '\n'.join(lines)

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--check',action='store_true');a=ap.parse_args();text=generated_text()
    if a.check:
        actual=OUT.read_text(encoding='utf-8') if OUT.exists() else ''
        if actual!=text:
            print('STALE',OUT.relative_to(ROOT));return 1
        print('OK',OUT.relative_to(ROOT));return 0
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(text,encoding='utf-8');print('Generated',OUT.relative_to(ROOT));return 0
if __name__=='__main__':raise SystemExit(main())
