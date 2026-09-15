#!/usr/bin/env python3
"""Generate docs/sources/POSE_SCREENSHOT_SOURCES.md from photoSpots poseTips."""
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
    rows=[]
    for spot in trip.get('photoSpots',[]):
        if not isinstance(spot,dict):continue
        for tip in spot.get('poseTips',[]) or []:
            if not isinstance(tip,dict):continue
            rows.append((spot,tip))
    lines=[
        '# 旅拍指南｜來源實拍與機位研究',
        '',
        '此檔由 `data/trip-data.json > photoSpots > poseTips` 自動生成，不可手改。用途是讓旅途中能直接看到「別人實際怎麼拍」，並保留來源追溯資訊。',
        '',
        '## 使用原則',
        '',
        '- 機位／Pose 研究優先搜尋小紅書、抖音、大眾點評；原貼若有登入牆、App 跳轉或失效，不把它當成前台必要操作。',
        '- 前台圖片使用可直接讀取、可追溯的公開來源實拍；每張都標平台、來源頁、已知作者／日期與整理日期。',
        '- 同一拍照場景的不同 Pose 必須使用不同參考圖片；不可用同一張圖重複充當兩個 Pose。',
        '- 來源實拍第一次需要網路；Service Worker 會對成功載入的圖片使用 runtime image cache，但瀏覽器仍可能清除快取，因此不保證永久離線。',
        '- 這些圖片只作私人旅程中的拍照姿勢／構圖參考；註明出處與非商用不等於自動取得再利用授權，本專案不宣稱來源圖片可自由重製。',
        '',
        f'目前共 **{len(rows)}** 組 Pose 參考。',
        '',
        '| 地點 | Pose | 來源實拍 | 作者／日期 | 來源頁 | 機位研究 | 整理日期 |',
        '| --- | --- | --- | --- | --- | --- | --- |',
    ]
    for spot,tip in rows:
        platform=clean(tip.get('sourcePlatform'))
        image=link(platform+' 圖片',tip.get('sourceImage'))
        author=clean(tip.get('sourceAuthor'))
        date=clean(tip.get('sourceDate'))
        bydate=' · '.join(x for x in (author,date) if x!='—') or '—'
        source=link(cell(tip.get('sourceTitle') or '來源頁'),tip.get('sourceUrl'))
        research_platform=clean(tip.get('platform'))
        research_url=clean(tip.get('url'))
        research=link(cell(research_platform),research_url) if research_url!='—' else cell(research_platform)
        lines.append('| '+' | '.join([
            cell(spot.get('name') or spot.get('id')),
            cell(tip.get('title')),
            image,
            cell(bydate),
            source,
            research,
            cell(tip.get('sourceCaptured')),
        ])+' |')
    lines += ['', '## 維護', '', '更新旅拍來源後執行：', '', '```bash', 'python tools/generate_pose_sources.py', 'python tools/generate_photo_sources.py', 'python tools/validate_project.py', '```', '']
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
