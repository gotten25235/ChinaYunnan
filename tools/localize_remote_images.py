#!/usr/bin/env python3
"""Download photo.remoteSrc into the local WebP path declared by photo.src.

Contract:
- photo.src is always the browser's primary LOCAL WebP path.
- photo.remoteSrc, when present, is the exact NETWORK image fallback for the same subject.
- This tool never swaps src/remoteSrc and never changes trip-data.json.
- Existing local files are only treated as source-verified when the cache contains the
  same remoteSrc and matching SHA-256. A refresh failure never deletes a valid local file.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TRIP_PATH = ROOT / "data" / "trip-data.json"
RELEASE_CONFIG = ROOT / "tools" / "release.json"
try:
    _release_version = json.loads(RELEASE_CONFIG.read_text(encoding="utf-8")).get("version", "unknown")
except Exception:
    _release_version = "unknown"
OUT_ZIP = ROOT.parent / f"yunnan_{_release_version}_all_local.zip"
LOG_PATH = ROOT / "localize_images.log"
FAIL_PATH = ROOT / "localize_failures.txt"
CACHE_PATH = ROOT / "tools" / "remote-image-cache.json"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
)
MAX_EDGE = 1280
WEBP_QUALITY = 82


def is_remote(value: object) -> bool:
    return isinstance(value, str) and value.startswith(("http://", "https://"))


def is_local_webp(value: object) -> bool:
    return isinstance(value, str) and bool(value) and not is_remote(value) and value.lower().endswith(".webp")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_cache() -> dict[str, Any]:
    try:
        raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and isinstance(raw.get("photos"), dict):
            return raw
    except Exception:
        pass
    return {"schemaVersion": 1, "photos": {}}


def save_cache(cache: dict[str, Any]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_valid_webp(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1024:
        return False
    with path.open("rb") as fh:
        head = fh.read(12)
    return len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def cache_matches(cache: dict[str, Any], photo_id: str, source: str, rel: str, target: Path) -> bool:
    if not is_valid_webp(target):
        return False
    entry = (cache.get("photos") or {}).get(photo_id)
    if not isinstance(entry, dict):
        return False
    if str(entry.get("remoteSrc") or "") != source or str(entry.get("localPath") or "") != rel:
        return False
    expected = str(entry.get("sha256") or "")
    return bool(expected) and expected == sha256_file(target)


def normalize_source(source: str) -> str:
    if source.startswith("https://thumb.wikimedia.org/"):
        return "https://upload.wikimedia.org/" + source[len("https://thumb.wikimedia.org/"):]
    if source.startswith("http://thumb.wikimedia.org/"):
        return "https://upload.wikimedia.org/" + source[len("http://thumb.wikimedia.org/"):]
    return source


def wsrv_url(source: str) -> str:
    encoded = urllib.parse.quote(source, safe="")
    return f"https://wsrv.nl/?url={encoded}&w={MAX_EDGE}&we=1&output=webp&q={WEBP_QUALITY}"


def request_bytes(url: str, *, referer: str = "", attempts: int = 3, timeout: int = 75) -> tuple[bytes, str, str]:
    headers = {
        "User-Agent": UA,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
        "Cache-Control": "no-cache",
    }
    if referer:
        headers["Referer"] = referer
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                payload = response.read()
                ctype = str(response.headers.get("Content-Type") or "").lower()
                final_url = response.geturl()
                if not payload:
                    raise RuntimeError("empty response")
                return payload, ctype, final_url
        except Exception as exc:
            last_error = exc
            if attempt < attempts:
                print(f"    retry {attempt}/{attempts - 1}: {type(exc).__name__}: {exc}")
                time.sleep(1.2 * attempt)
    assert last_error is not None
    raise last_error


def ensure_pillow() -> Any | None:
    try:
        from PIL import Image, ImageOps  # type: ignore
        return Image, ImageOps
    except Exception:
        pass
    print("  Pillow not found; installing it once for local WebP conversion...")
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--user", "--disable-pip-version-check", "Pillow>=10,<13"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=240,
        )
        if proc.stdout:
            print("    " + proc.stdout.strip().replace("\n", "\n    "))
        if proc.returncode != 0:
            return None
        from PIL import Image, ImageOps  # type: ignore
        return Image, ImageOps
    except Exception as exc:
        print(f"    Pillow install failed: {type(exc).__name__}: {exc}")
        return None


def bytes_are_webp(payload: bytes) -> bool:
    return len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP"


def save_or_convert(payload: bytes, target: Path, pillow: Any | None) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    tmp.unlink(missing_ok=True)
    if bytes_are_webp(payload):
        tmp.write_bytes(payload)
    else:
        if pillow is None:
            raise RuntimeError("image is not WebP and Pillow is unavailable for conversion")
        Image, ImageOps = pillow
        try:
            with Image.open(io.BytesIO(payload)) as im:
                im = ImageOps.exif_transpose(im)
                if getattr(im, "is_animated", False):
                    im.seek(0)
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGBA" if "transparency" in im.info else "RGB")
                if max(im.size) > MAX_EDGE:
                    im.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
                im.save(tmp, "WEBP", quality=WEBP_QUALITY, method=6)
        except Exception as exc:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(f"Pillow could not decode/convert payload: {exc}") from exc
    if not is_valid_webp(tmp):
        tmp.unlink(missing_ok=True)
        raise RuntimeError("result is not a valid WebP or is unexpectedly small")
    os.replace(tmp, target)


def download_webp(source: str, target: Path, *, referer: str, pillow: Any | None) -> str:
    normalized = normalize_source(source)
    errors: list[str] = []
    print(f"  direct: {normalized}")
    try:
        payload, ctype, final_url = request_bytes(normalized, referer=referer)
        if "text/html" in ctype and not bytes_are_webp(payload):
            raise RuntimeError(f"origin returned HTML ({ctype or 'unknown content-type'})")
        save_or_convert(payload, target, pillow)
        print(f"    OK direct ({len(payload) / 1024:.0f} KiB) -> {final_url}")
        return "direct"
    except Exception as exc:
        msg = f"direct failed: {type(exc).__name__}: {exc}"
        print("    " + msg)
        errors.append(msg)
    print("  fallback downloader: wsrv.nl")
    try:
        payload, ctype, final_url = request_bytes(wsrv_url(normalized), referer="https://wsrv.nl/")
        if "text/html" in ctype and not bytes_are_webp(payload):
            raise RuntimeError(f"wsrv returned HTML ({ctype or 'unknown content-type'})")
        save_or_convert(payload, target, pillow)
        print(f"    OK wsrv ({len(payload) / 1024:.0f} KiB) -> {final_url}")
        return "wsrv"
    except Exception as exc:
        msg = f"wsrv failed: {type(exc).__name__}: {exc}"
        print("    " + msg)
        errors.append(msg)
    raise RuntimeError(" | ".join(errors))


def run_tool(name: str) -> None:
    path = ROOT / "tools" / name
    print(f"\n> {name}")
    proc = subprocess.run([sys.executable, str(path)], cwd=ROOT)
    if proc.returncode != 0:
        raise RuntimeError(f"{name} failed with exit code {proc.returncode}")


def build_zip() -> None:
    if OUT_ZIP.exists():
        OUT_ZIP.unlink()
    with zipfile.ZipFile(OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file():
                continue
            if "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            if path.name in {LOG_PATH.name, FAIL_PATH.name}:
                continue
            zf.write(path, path.relative_to(ROOT).as_posix())
    print(f"\nZIP: {OUT_ZIP}")


def write_report(rows: list[tuple[str, str, str, str]]) -> None:
    if not rows:
        FAIL_PATH.unlink(missing_ok=True)
        return
    lines = [
        "Yunnan V1 remote photo localization report",
        "",
        "Browser contract remains unchanged: local src -> remoteSrc -> no image.",
        "This BAT never rewrites trip-data photo paths.",
        "",
    ]
    for photo_id, source, status, reason in rows:
        lines += [f"ID: {photo_id}", f"URL: {source}", f"Status: {status}", f"Reason: {reason}", ""]
    FAIL_PATH.write_text("\n".join(lines), encoding="utf-8-sig")


def main() -> int:
    FAIL_PATH.unlink(missing_ok=True)
    data = json.loads(TRIP_PATH.read_text(encoding="utf-8"))
    photos = data.get("photos")
    if not isinstance(photos, dict):
        raise RuntimeError("trip-data.json: photos must be an object")

    records: list[tuple[str, dict[str, Any], str, str]] = []
    for photo_id, photo in photos.items():
        if not isinstance(photo, dict):
            continue
        source = photo.get("remoteSrc")
        if not is_remote(source):
            continue
        local = photo.get("src")
        if not is_local_webp(local):
            raise RuntimeError(f"photos.{photo_id}: remoteSrc requires a local WebP src; found {local!r}")
        records.append((photo_id, photo, str(source), str(local)))

    print(f"Remote fallback records: {len(records)}")
    print("Browser contract: local src -> remoteSrc -> no image")
    print("BAT contract: remoteSrc -> download/convert -> overwrite local src only after a valid WebP is ready")
    print("Metadata contract: trip-data.json is never switched between local/remote modes")
    if not records:
        run_tool("generate_offline_manifest.py")
        run_tool("validate_project.py")
        build_zip()
        print("\nNo remoteSrc records. ZIP built from current local tree.")
        return 0

    pillow = ensure_pillow()
    if pillow is None:
        print("WARNING: Pillow unavailable. Non-WebP direct images will depend on wsrv.nl conversion.")

    cache = load_cache()
    cache["schemaVersion"] = 1
    cache_photos = cache.setdefault("photos", {})
    if not isinstance(cache_photos, dict):
        cache_photos = {}
        cache["photos"] = cache_photos

    methods = {"verified": 0, "direct": 0, "wsrv": 0, "preserved": 0, "missing": 0}
    report: list[tuple[str, str, str, str]] = []
    unresolved: list[str] = []

    for index, (photo_id, photo, source, rel) in enumerate(records, 1):
        target = ROOT / rel
        referer = str(photo.get("source") or photo.get("licenseUrl") or "")
        if not is_remote(referer):
            referer = ""
        had_valid_local = is_valid_webp(target)
        print(f"\n[{index}/{len(records)}] {photo_id}")
        print(f"  local:  {rel} {'(exists)' if had_valid_local else '(missing)'}")
        print(f"  remote: {source}")

        if cache_matches(cache, photo_id, source, rel, target):
            print("  verified local cache matches remoteSrc + SHA-256; reuse")
            methods["verified"] += 1
            continue

        if had_valid_local:
            print("  local WebP exists but is not verified for the current remoteSrc; refresh attempted")
        try:
            method = download_webp(source, target, referer=referer, pillow=pillow)
            methods[method] += 1
            cache_photos[photo_id] = {
                "remoteSrc": source,
                "localPath": rel,
                "sha256": sha256_file(target),
            }
            save_cache(cache)
        except Exception as exc:
            reason = str(exc)
            if is_valid_webp(target):
                methods["preserved"] += 1
                status = "refresh failed; existing local WebP preserved"
                print(f"  WARNING: {status}: {reason}")
                report.append((photo_id, source, status, reason))
            else:
                methods["missing"] += 1
                status = "download failed; local src is still missing"
                print(f"  ERROR: {status}: {reason}")
                report.append((photo_id, source, status, reason))
                unresolved.append(photo_id)

    write_report(report)
    print("\nDownload summary:")
    print(f"  verified reuse: {methods['verified']}")
    print(f"  direct:         {methods['direct']}")
    print(f"  wsrv:           {methods['wsrv']}")
    print(f"  preserved local after refresh failure: {methods['preserved']}")
    print(f"  still missing local:                  {methods['missing']}")

    # Manifest depends on which local photo files actually exist. Rebuild it after downloading.
    run_tool("generate_offline_manifest.py")
    run_tool("validate_project.py")

    if unresolved:
        print("\nLocalization is not fully local yet.")
        print("The website itself remains valid because these photos still fall back to remoteSrc at runtime.")
        print("No all-local ZIP was created because the following local files are still missing:")
        for photo_id in unresolved:
            print(f"  - {photo_id}")
        print(f"Report: {FAIL_PATH}")
        return 2

    build_zip()
    if report:
        print(f"\nDone with warnings. Existing local files were preserved for {len(report)} refresh failure(s).")
        print(f"Report: {FAIL_PATH}")
    else:
        print("\nDone: every remoteSrc record has a valid local WebP at its unchanged src path.")
    return 0


def entrypoint() -> int:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("w", encoding="utf-8-sig") as log:
        class Tee:
            def __init__(self, *streams: Any):
                self.streams = streams
            def write(self, data: str) -> int:
                for stream in self.streams:
                    stream.write(data)
                    stream.flush()
                return len(data)
            def flush(self) -> None:
                for stream in self.streams:
                    stream.flush()
        out = Tee(sys.__stdout__, log)
        err = Tee(sys.__stderr__, log)
        with redirect_stdout(out), redirect_stderr(err):
            try:
                return main()
            except KeyboardInterrupt:
                print("\nCancelled by user.")
                return 130
            except Exception as exc:
                print(f"\nFATAL: {type(exc).__name__}: {exc}")
                import traceback
                traceback.print_exc()
                print(f"\nFull log: {LOG_PATH}")
                return 1


if __name__ == "__main__":
    raise SystemExit(entrypoint())
