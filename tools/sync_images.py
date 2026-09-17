#!/usr/bin/env python3
"""Synchronize exact remote image fallbacks into their declared local WebP files.

Single image contract used by the whole site:
    imageId -> local -> remote -> no image

Safety rules:
- Only data/trip-data.json > images[*].remote is downloaded.
- The downloader never searches for substitutes and never chooses a different picture.
- Every image record keeps both local and remote. A packaged local file is trusted only when
  image-sync-cache.json proves that the declared remote + local path + SHA-256 match.
- If refresh fails, an unverified local file is quarantined so the website falls back
  to the exact remote URL instead of showing a possibly wrong local image.
- After sync, width/height are refreshed from the actual local WebP files; no other image metadata is changed.

Python 3.8+ compatible.
"""
from __future__ import print_function

import hashlib
import html
import io
import json
import os
import subprocess
import sys
import time
import urllib.request
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRIP_PATH = ROOT / "data" / "trip-data.json"
RELEASE_CONFIG = ROOT / "tools" / "release.json"
CACHE_PATH = ROOT / "tools" / "image-sync-cache.json"
LOG_PATH = ROOT / "sync_images.log"
FAIL_PATH = ROOT / "sync_failures.txt"
REPORT_PATH = ROOT / "docs" / "IMAGE_SYNC_REPORT.html"
SUMMARY_PATH = ROOT / "sync_summary.txt"
QUARANTINE_ROOT = ROOT / "images" / "_quarantine"

try:
    _release_version = json.loads(RELEASE_CONFIG.read_text(encoding="utf-8")).get("version", "unknown")
except Exception:
    _release_version = "unknown"
OUT_ZIP = ROOT.parent / ("yunnan_%s_all_local.zip" % _release_version)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
)
MAX_EDGE = 1280
WEBP_QUALITY = 82

RUN_STATS = {
    "total": 0,
    "success": 0,
    "ignored": 0,
    "failed": 0,
    "errors": 0,
}


def final_summary_text():
    return "\n".join([
        "FINAL IMAGE SYNC SUMMARY",
        "Total   : %d" % RUN_STATS["total"],
        "Success : %d" % RUN_STATS["success"],
        "Ignored : %d" % RUN_STATS["ignored"],
        "Failed  : %d" % RUN_STATS["failed"],
        "Errors  : %d" % RUN_STATS["errors"],
        "",
        "Success = downloaded and converted in this run (SYNCED)",
        "Ignored = local + exact remote + SHA-256 already verified; download skipped (VERIFIED)",
        "Failed = individual image download/decode/convert failed; exact remote fallback remains active",
        "Errors = sync pipeline, generated artifacts, validation, or ZIP tool-level errors",
    ])


def write_final_summary():
    text = final_summary_text()
    SUMMARY_PATH.write_text(text + "\n", encoding="utf-8-sig")
    print("\n" + "=" * 60)
    print(text)
    print("=" * 60)


def is_remote(value):
    return isinstance(value, str) and value.startswith(("http://", "https://"))


def is_local_webp(value):
    return isinstance(value, str) and bool(value) and not is_remote(value) and value.lower().endswith(".webp")


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_valid_webp(path):
    if not path.is_file() or path.stat().st_size < 256:
        return False
    with path.open("rb") as fh:
        head = fh.read(12)
    return len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def load_cache():
    try:
        raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and isinstance(raw.get("images"), dict):
            return raw
    except Exception:
        pass
    return {"schemaVersion": 1, "images": {}}


def save_cache(cache):
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cache_matches(cache, image_id, remote, local_rel, target):
    if not is_valid_webp(target):
        return False
    entry = (cache.get("images") or {}).get(image_id)
    if not isinstance(entry, dict):
        return False
    if str(entry.get("remote") or "") != remote or str(entry.get("local") or "") != local_rel:
        return False
    expected = str(entry.get("sha256") or "")
    return bool(expected) and expected == sha256_file(target)


def request_bytes(url, referer="", attempts=3, timeout=75):
    headers = {
        "User-Agent": UA,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
        "Cache-Control": "no-cache",
    }
    if referer:
        headers["Referer"] = referer
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                payload = response.read()
                ctype = str(response.headers.get("Content-Type") or "").lower()
                final_url = response.geturl()
                if not payload:
                    raise RuntimeError("empty response")
                if "text/html" in ctype:
                    raise RuntimeError("origin returned HTML instead of an image")
                return payload, ctype, final_url
        except Exception as exc:
            last_error = exc
            if attempt < attempts:
                print("    retry %d/%d: %s: %s" % (attempt, attempts - 1, type(exc).__name__, exc))
                time.sleep(1.2 * attempt)
    raise last_error


def bytes_are_webp(payload):
    return len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP"


def convert_to_webp(payload, target):
    from PIL import Image, ImageOps
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    try:
        if tmp.exists():
            tmp.unlink()
        if bytes_are_webp(payload):
            # Re-open/re-save even WebP payloads so decoding is verified.
            source = Image.open(io.BytesIO(payload))
        else:
            source = Image.open(io.BytesIO(payload))
        with source as im:
            im = ImageOps.exif_transpose(im)
            if getattr(im, "is_animated", False):
                im.seek(0)
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "transparency" in im.info else "RGB")
            if max(im.size) > MAX_EDGE:
                im.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
            im.save(str(tmp), "WEBP", quality=WEBP_QUALITY, method=6)
        if not is_valid_webp(tmp):
            raise RuntimeError("converted file is not a valid WebP")
        os.replace(str(tmp), str(target))
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise


def refresh_registry_dimensions(data):
    """Refresh width/height from packaged local WebP files; pending locals stay 0x0."""
    from PIL import Image
    changed = False
    images = data.get("images") if isinstance(data.get("images"), dict) else {}
    for image_id, image in images.items():
        if not isinstance(image, dict):
            continue
        local = image.get("local")
        target = ROOT / str(local or "")
        width = height = 0
        if is_valid_webp(target):
            try:
                with Image.open(target) as im:
                    width, height = map(int, im.size)
            except Exception:
                width = height = 0
        if image.get("width") != width or image.get("height") != height:
            image["width"], image["height"] = width, height
            changed = True
    if changed:
        TRIP_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def quarantine(target, image_id):
    if not target.exists():
        return ""
    QUARANTINE_ROOT.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    dest = QUARANTINE_ROOT / ("%s_%s%s" % (image_id, stamp, target.suffix))
    counter = 2
    while dest.exists():
        dest = QUARANTINE_ROOT / ("%s_%s_%d%s" % (image_id, stamp, counter, target.suffix))
        counter += 1
    target.replace(dest)
    return dest.relative_to(ROOT).as_posix()


def run_tool(name, *args):
    label = " ".join([name] + list(args))
    print("\n> %s" % label)
    proc = subprocess.run([sys.executable, str(ROOT / "tools" / name)] + list(args), cwd=str(ROOT))
    if proc.returncode != 0:
        raise RuntimeError("%s failed with exit code %s" % (label, proc.returncode))


def build_zip():
    if OUT_ZIP.exists():
        OUT_ZIP.unlink()
    with zipfile.ZipFile(str(OUT_ZIP), "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for directory in ("food", "shopping", "hotels", "places", "culture", "pose", "airlines", "handbook"):
            zf.writestr("images/%s/" % directory, b"")
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT)
            if "__pycache__" in rel.parts or "_quarantine" in rel.parts or path.suffix == ".pyc":
                continue
            if path.name in {LOG_PATH.name, FAIL_PATH.name, SUMMARY_PATH.name}:
                continue
            zf.write(str(path), rel.as_posix())
    print("\nZIP: %s" % OUT_ZIP)


def write_text_report(rows):
    failures = [r for r in rows if r["status"] == "FAILED"]
    if failures:
        lines = [
            "Yunnan image sync failures",
            "",
            "Rule: imageId -> local -> remote -> no image",
            "The sync tool never searches for a replacement picture.",
            "",
        ]
        for row in failures:
            lines.extend([
                "ID: %s" % row["id"],
                "Remote: %s" % row["remote"],
                "Local: %s" % row["local"],
                "Reason: %s" % row.get("reason", ""),
                "",
            ])
        FAIL_PATH.write_text("\n".join(lines), encoding="utf-8-sig")
    elif FAIL_PATH.exists():
        FAIL_PATH.unlink()


def write_html_report(rows):
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    preferred_order = ["food", "shopping", "hotels", "places", "culture", "pose", "airlines", "handbook"]
    grouped = {}
    for row in rows:
        local_rel = str(row.get("local") or "")
        parts = local_rel.replace("\\", "/").split("/")
        folder = parts[1] if len(parts) >= 3 and parts[0] == "images" else "other"
        grouped.setdefault(folder, []).append(row)

    ordered_groups = [name for name in preferred_order if name in grouped]
    ordered_groups.extend(sorted(name for name in grouped if name not in preferred_order))

    def render_card(row):
        status = row["status"]
        local_exists = bool(row.get("localExists"))
        if local_exists:
            preview = '<img src="../%s" alt="%s">' % (
                html.escape(row["local"], quote=True),
                html.escape(row["id"], quote=True),
            )
        else:
            preview = '<div class="missing">LOCAL MISSING<br><small>網站會改讀 remote</small></div>'
        return (
            '<article><div class="preview">%s</div><div class="copy"><b>%s</b>'
            '<span class="%s">%s</span><code>%s</code><a href="%s">remote exact URL</a>%s</div></article>'
            % (
                preview,
                html.escape(row["id"]),
                "ok" if status in ("SYNCED", "VERIFIED") else "bad",
                html.escape(status),
                html.escape(row["local"]),
                html.escape(row["remote"], quote=True),
                ("<small>%s</small>" % html.escape(row.get("reason", ""))) if row.get("reason") else "",
            )
        )

    nav_items = []
    sections = []
    for folder in ordered_groups:
        group_rows = grouped[folder]
        counts = {
            "SYNCED": sum(1 for row in group_rows if row["status"] == "SYNCED"),
            "VERIFIED": sum(1 for row in group_rows if row["status"] == "VERIFIED"),
            "FAILED": sum(1 for row in group_rows if row["status"] == "FAILED"),
        }
        anchor = "folder-" + "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in folder.lower())
        nav_items.append(
            '<a class="folder-link" href="#%s"><b>images/%s/</b><span>%d</span></a>'
            % (html.escape(anchor, quote=True), html.escape(folder), len(group_rows))
        )
        status_bits = []
        if counts["SYNCED"]:
            status_bits.append("SYNCED %d" % counts["SYNCED"])
        if counts["VERIFIED"]:
            status_bits.append("VERIFIED %d" % counts["VERIFIED"])
        if counts["FAILED"]:
            status_bits.append("FAILED %d" % counts["FAILED"])
        sections.append(
            '<section class="folder-section" id="%s">'
            '<div class="folder-head"><div><h2>images/%s/</h2><p>%d records</p></div>'
            '<div class="folder-stats">%s</div></div>'
            '<div class="cards">%s</div></section>'
            % (
                html.escape(anchor, quote=True),
                html.escape(folder),
                len(group_rows),
                " · ".join(status_bits) if status_bits else "—",
                "".join(render_card(row) for row in group_rows),
            )
        )

    overall = {
        "SYNCED": sum(1 for row in rows if row["status"] == "SYNCED"),
        "VERIFIED": sum(1 for row in rows if row["status"] == "VERIFIED"),
        "FAILED": sum(1 for row in rows if row["status"] == "FAILED"),
    }

    REPORT_PATH.write_text("""<!doctype html>
<html lang="zh-Hant">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Image Sync Report</title>
<style>
:root{color-scheme:light dark}*{box-sizing:border-box}html{scroll-behavior:smooth}body{font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f6f5f1;color:#18211f}header{padding:24px max(20px,calc((100vw - 1500px)/2));background:#fff;border-bottom:1px solid #d9dfdc;position:sticky;top:0;z-index:10}h1{font-size:22px;margin:0 0 6px}header p{color:#5c6864;margin:4px 0}.overall{font-weight:700;color:#34423e}.folder-nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.folder-link{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #cfd8d4;border-radius:999px;background:#f8faf9;color:#176b4b;text-decoration:none}.folder-link span{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:#e5efea;color:#164f3a;font-weight:800}.report{max-width:1500px;margin:0 auto;padding:22px 20px 48px}.folder-section{scroll-margin-top:190px;margin:0 0 34px}.folder-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #cfd8d4}.folder-head h2{font-size:19px;margin:0}.folder-head p{margin:2px 0 0;color:#5c6864}.folder-stats{font-size:12px;font-weight:700;color:#5c6864;text-align:right}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}article{background:#fff;border:1px solid #d9dfdc;border-radius:14px;overflow:hidden}.preview{height:220px;display:grid;place-items:center;background:#e8ecea}.preview img{width:100%%;height:100%%;object-fit:contain}.missing{text-align:center;color:#7b4a3f}.copy{padding:12px;display:grid;gap:6px}.copy b{font-size:15px}.copy span{font-weight:700}.ok{color:#176b4b}.bad{color:#a33d2c}code{font-size:11px;overflow-wrap:anywhere}a{color:#176b4b;overflow-wrap:anywhere}small{color:#66736f}
@media(prefers-color-scheme:dark){body{background:#111715;color:#e5ece9}header,article{background:#18201d;border-color:#34413c}.folder-link{background:#1d2824;border-color:#3c4a45;color:#8ed9b8}.folder-link span{background:#263831;color:#b9efd8}.preview{background:#202a26}.folder-head{border-color:#34413c}.overall,.folder-stats,.folder-head p,header p,small{color:#aab8b2}}
</style>
<body>
<header>
<h1>Image Sync Report</h1>
<p>唯一規則：imageId → local → remote → 無此圖。同步器只下載資料中指定的 remote，不搜尋替代圖。</p>
<p class="overall">Total %d · SYNCED %d · VERIFIED %d · FAILED %d</p>
<nav class="folder-nav">%s</nav>
</header>
<main class="report">%s</main>
</body></html>""" % (
        len(rows),
        overall["SYNCED"],
        overall["VERIFIED"],
        overall["FAILED"],
        "".join(nav_items),
        "".join(sections),
    ), encoding="utf-8")


def main():
    data = json.loads(TRIP_PATH.read_text(encoding="utf-8"))
    images = data.get("images")
    if not isinstance(images, dict):
        raise RuntimeError("trip-data.json: images must be an object")

    records = []
    for image_id, image in images.items():
        if not isinstance(image, dict):
            continue
        remote = image.get("remote")
        if not is_remote(remote):
            continue
        local = image.get("local")
        if not is_local_webp(local):
            raise RuntimeError("images.%s: remote requires a local WebP path; found %r" % (image_id, local))
        records.append((image_id, image, str(remote), str(local)))

    RUN_STATS["total"] = len(records)
    print("Remote-backed image records: %d" % len(records))
    print("Browser: imageId -> local -> remote -> no image")
    print("SYNC: exact remote URL only -> decode/convert -> local WebP")
    print("No search, no substitute image, no data-mode switching.")

    cache = load_cache()
    cache["schemaVersion"] = 2
    cache_images = cache.setdefault("images", {})
    if not isinstance(cache_images, dict):
        cache_images = {}
        cache["images"] = cache_images

    rows = []
    unresolved = []
    project_changed = False
    for index, (image_id, image, remote, local_rel) in enumerate(records, 1):
        target = ROOT / local_rel
        referer = str(image.get("source") or image.get("licenseUrl") or "")
        if not is_remote(referer):
            referer = ""
        print("\n[%d/%d] %s" % (index, len(records), image_id))
        print("  local:  %s" % local_rel)
        print("  remote: %s" % remote)

        if cache_matches(cache, image_id, remote, local_rel, target):
            print("  VERIFIED: exact remote + local SHA-256 match cache")
            rows.append({"id": image_id, "remote": remote, "local": local_rel, "status": "VERIFIED", "localExists": True})
            RUN_STATS["ignored"] += 1
            continue

        had_unverified = target.exists()
        if had_unverified:
            print("  local exists but is NOT verified for this exact remote; refresh required")
        try:
            payload, ctype, final_url = request_bytes(remote, referer=referer)
            print("  downloaded: %.0f KiB (%s)" % (len(payload) / 1024.0, ctype or "unknown type"))
            if final_url != remote:
                print("  redirect: %s" % final_url)
            convert_to_webp(payload, target)
            cache_images[image_id] = {"remote": remote, "local": local_rel, "sha256": sha256_file(target)}
            save_cache(cache)
            print("  SYNCED -> %s" % local_rel)
            rows.append({"id": image_id, "remote": remote, "local": local_rel, "status": "SYNCED", "localExists": True})
            RUN_STATS["success"] += 1
            project_changed = True
        except Exception as exc:
            reason = "%s: %s" % (type(exc).__name__, exc)
            quarantined = ""
            if target.exists() and not cache_matches(cache, image_id, remote, local_rel, target):
                quarantined = quarantine(target, image_id)
                if quarantined:
                    project_changed = True
                print("  quarantined unverified local: %s" % quarantined)
            print("  FAILED: %s" % reason)
            unresolved.append(image_id)
            rows.append({"id": image_id, "remote": remote, "local": local_rel, "status": "FAILED", "reason": reason + (("; quarantined " + quarantined) if quarantined else ""), "localExists": False})
            RUN_STATS["failed"] += 1

    if refresh_registry_dimensions(data):
        project_changed = True
        print("\nUpdated image width/height from packaged local WebP files.")
    write_text_report(rows)
    write_html_report(rows)

    # Any change to packaged images or image registry dimensions must publish a new Build ID.
    # Otherwise installed clients would have no reliable signal that imageHashes changed.
    if project_changed:
        run_tool("release.py", "--new-build")
    else:
        run_tool("generate_image_sources.py")
        run_tool("generate_pose_sources.py")
        run_tool("generate_offline_manifest.py")
        run_tool("generate_build_manifest.py")
        run_tool("validate_project.py")

    if unresolved:
        print("\nSync incomplete: %d image(s) still use the exact remote fallback." % len(unresolved))
        print("No all-local ZIP was created. See:")
        print("  %s" % FAIL_PATH)
        print("  %s" % REPORT_PATH)
        return 2

    build_zip()
    print("\nDone. Every remote-backed image has a verified local WebP.")
    print("Report: %s" % REPORT_PATH)
    return 0


def entrypoint():
    with LOG_PATH.open("w", encoding="utf-8-sig") as log:
        class Tee(object):
            def __init__(self, *streams):
                self.streams = streams
            def write(self, data):
                for stream in self.streams:
                    stream.write(data)
                    stream.flush()
                return len(data)
            def flush(self):
                for stream in self.streams:
                    stream.flush()
        out = Tee(sys.__stdout__, log)
        err = Tee(sys.__stderr__, log)
        with redirect_stdout(out), redirect_stderr(err):
            try:
                rc = main()
            except KeyboardInterrupt:
                print("\nCancelled by user.")
                rc = 130
            except Exception as exc:
                RUN_STATS["errors"] += 1
                print("\nFATAL: %s: %s" % (type(exc).__name__, exc))
                import traceback
                traceback.print_exc()
                print("\nFull log: %s" % LOG_PATH)
                rc = 1
            write_final_summary()
            return rc


if __name__ == "__main__":
    raise SystemExit(entrypoint())
