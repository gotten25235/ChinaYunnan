#!/usr/bin/env python3
"""Generate selective offline manifest from the unified image registry.

Per image record choose exactly one offline source:
- packaged local WebP when it exists;
- otherwise the exact remote URL when declared.
"""
from __future__ import annotations
import hashlib, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'offline-manifest.json'
CONFIG=ROOT/'tools'/'release.json'

def release_version():
    config=json.loads(CONFIG.read_text(encoding='utf-8'));version=str(config.get('version') or '') if isinstance(config,dict) else ''
    if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise SystemExit('tools/release.json version must be N.N.N')
    return version
VERSION=release_version()
BUILD=str(json.loads(CONFIG.read_text(encoding='utf-8')).get('build') or '')
if not re.fullmatch(r'\d{8}-\d{6}',BUILD):raise SystemExit('tools/release.json build must be YYYYMMDD-HHMMSS')

def core_assets():
    assets=['./','./index.html','./manifest.webmanifest','./offline-manifest.json',f'./css/style.css?b={BUILD}',f'./css/banner.css?b={BUILD}',f'./js/banner.js?b={BUILD}']
    for name in ('network','core','analytics','weather','offline','settings','reader','journey','map','library','app'):assets.append(f'./js/{name}.js?b={BUILD}')
    for path in sorted((ROOT/'data').glob('*.json')):
        if path.name!='analytics-config.json':assets.append('./'+path.relative_to(ROOT).as_posix())
    for path in sorted((ROOT/'icons').rglob('*')) if (ROOT/'icons').exists() else []:
        if path.is_file():assets.append('./'+path.relative_to(ROOT).as_posix())
    return list(dict.fromkeys(assets))

def is_remote(v):return isinstance(v,str) and v.startswith(('http://','https://'))

def image_records():
    trip=json.loads((ROOT/'data'/'trip-data.json').read_text(encoding='utf-8'))
    local=[];by_url={}
    for image_id,image in (trip.get('images') or {}).items():
        if not isinstance(image,dict):continue
        local_path=image.get('local');remote=image.get('remote')
        if isinstance(local_path,str) and local_path and not is_remote(local_path):
            normalized='./'+local_path.lstrip('./')
            if (ROOT/local_path).is_file():
                if normalized not in local:local.append(normalized)
                continue
        if is_remote(remote):
            label=image.get('alt') or image.get('caption') or image_id;record=by_url.get(remote)
            if record is None:
                record={'id':image_id,'ids':[image_id],'url':str(remote),'label':str(label),'source':str(image.get('source') or ''),'local':str(local_path or '')};by_url[remote]=record
            elif image_id not in record['ids']:record['ids'].append(image_id)
            continue
        if isinstance(local_path,str) and local_path:
            normalized='./'+local_path.lstrip('./')
            if normalized not in local:local.append(normalized)
    return local,list(by_url.values())

def sha256(path):
    digest=hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda:fh.read(1024*1024),b''):
            digest.update(chunk)
    return digest.hexdigest()

def generated():
    local,remote=image_records()
    image_hashes={}
    for asset in local:
        path=ROOT/asset.lstrip('./')
        if path.is_file():image_hashes[asset]=sha256(path)
    return {'schemaVersion':'v1','coreAssets':core_assets(),'imageAssets':local,'imageHashes':image_hashes,'remoteImages':remote,'optionalRuntime':['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','https://unpkg.com.cn/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com.cn/leaflet@1.9.4/dist/leaflet.js']}

def generated_text():return json.dumps(generated(),ensure_ascii=False,indent=2)+'\n'
def main():
    OUT.write_text(generated_text(),encoding='utf-8');data=generated();print(f"Generated {OUT.relative_to(ROOT)}: {len(data['coreAssets'])} core assets, {len(data['imageAssets'])} packaged local images with SHA-256, {len(data['remoteImages'])} exact remote fallbacks");return 0
if __name__=='__main__':raise SystemExit(main())
