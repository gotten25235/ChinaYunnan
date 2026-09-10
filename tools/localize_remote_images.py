#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TRIP_PATH = ROOT / "data" / "trip-data.json"
REMOTE_DIR = ROOT / "images" / "remote"
OUT_ZIP = ROOT.parent / "yunnan_v1_all_local.zip"
LOG_PATH = ROOT / "localize_images.log"
FAIL_PATH = ROOT / "localize_failures.txt"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
)
MAX_EDGE = 1280
WEBP_QUALITY = 82


def is_remote(src: object) -> bool:
    return isinstance(src, str) and src.startswith(("http://", "https://"))


def safe_name(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")
    return value or "image"


def normalize_source(source: str) -> str:
    # thumb.wikimedia.org is not the canonical public thumbnail host.
    # Keep old metadata/source pages intact, but download through upload.wikimedia.org.
    if source.startswith("https://thumb.wikimedia.org/"):
        return "https://upload.wikimedia.org/" + source[len("https://thumb.wikimedia.org/"):]
    if source.startswith("http://thumb.wikimedia.org/"):
        return "https://upload.wikimedia.org/" + source[len("http://thumb.wikimedia.org/"):]
    return source


def wsrv_url(source: str) -> str:
    encoded = urllib.parse.quote(source, safe="")
    return f"https://wsrv.nl/?url={encoded}&w={MAX_EDGE}&we=1&output=webp&q={WEBP_QUALITY}"


def is_valid_webp(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1024:
        return False
    head = path.read_bytes()[:12]
    return len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP"


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
            # Use the system certificate store first. This is the least surprising path on Windows.
            with urllib.request.urlopen(req, timeout=timeout) as response:
                payload = response.read()
                ctype = str(response.headers.get("Content-Type") or "").lower()
                final_url = response.geturl()
                if not payload:
                    raise RuntimeError("empty response")
                return payload, ctype, final_url
        except Exception as exc:  # keep exact server/SSL reason for the report
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
                    if "transparency" in im.info:
                        im = im.convert("RGBA")
                    else:
                        im = im.convert("RGB")
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
    """Return method used. Direct origin first, wsrv fallback second."""
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

    print("  fallback: wsrv.nl")
    try:
        payload, ctype, final_url = request_bytes(wsrv_url(normalized), referer="https://wsrv.nl/")
        if "text/html" in ctype and not bytes_are_webp(payload):
            raise RuntimeError(f"wsrv returned HTML ({ctype or 'unknown content-type'})")
        # wsrv is asked for WebP, but keep conversion fallback in case it returns another supported image.
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
    if not path.is_file():
        return
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


def write_failures(failures: list[tuple[list[str], str, str]]) -> None:
    lines = [
        "Yunnan V1 remote photo localization failures",
        "",
        "The project data was NOT switched to local paths because at least one image failed.",
        "Successful images already downloaded into images/remote are kept and will be reused on the next run.",
        "",
    ]
    for ids, source, reason in failures:
        lines += [f"IDs: {', '.join(ids)}", f"URL: {source}", f"Reason: {reason}", ""]
    FAIL_PATH.write_text("\n".join(lines), encoding="utf-8-sig")


def main() -> int:
    FAIL_PATH.unlink(missing_ok=True)
    data = json.loads(TRIP_PATH.read_text(encoding="utf-8"))
    photos = data.get("photos")
    if not isinstance(photos, dict):
        raise RuntimeError("trip-data.json: photos must be an object")

    remote_records = [(pid, p) for pid, p in photos.items() if isinstance(p, dict) and is_remote(p.get("src"))]
    if not remote_records:
        print("No remote photo URLs found. Building ZIP from the current V1 tree.")
        build_zip()
        return 0

    by_url: dict[str, dict[str, Any]] = {}
    for pid, photo in remote_records:
        source = str(photo["src"])
        slot = by_url.setdefault(source, {"ids": [], "referer": ""})
        slot["ids"].append(pid)
        if not slot["referer"]:
            ref = photo.get("source") or photo.get("licenseUrl") or ""
            if isinstance(ref, str) and ref.startswith(("http://", "https://")):
                slot["referer"] = ref

    print(f"Remote photo records: {len(remote_records)}")
    print(f"Unique remote images: {len(by_url)}")
    print("Download strategy: direct source -> local Pillow conversion -> wsrv.nl fallback")
    REMOTE_DIR.mkdir(parents=True, exist_ok=True)

    # Install/locate Pillow once. Existing WebP direct responses do not strictly need it,
    # but most source photos are JPEG/PNG, so getting it up front makes progress predictable.
    pillow = ensure_pillow()
    if pillow is None:
        print("WARNING: Pillow unavailable. JPEG/PNG direct downloads will depend on wsrv.nl conversion.")

    url_to_local: dict[str, str] = {}
    failures: list[tuple[list[str], str, str]] = []
    methods: dict[str, int] = {"existing": 0, "direct": 0, "wsrv": 0}

    for index, (source, info) in enumerate(by_url.items(), 1):
        ids = list(info["ids"])
        referer = str(info["referer"] or "")
        base_id = safe_name(ids[0])
        rel = f"images/remote/{base_id}.webp"
        target = ROOT / rel
        print(f"\n[{index}/{len(by_url)}] {', '.join(ids)} -> {rel}")
        if is_valid_webp(target):
            print("  existing valid WebP; reuse")
            url_to_local[source] = rel
            methods["existing"] += 1
            continue
        target.unlink(missing_ok=True)
        try:
            method = download_webp(source, target, referer=referer, pillow=pillow)
            url_to_local[source] = rel
            methods[method] += 1
        except Exception as exc:
            reason = str(exc)
            print(f"  FAILED: {reason}")
            failures.append((ids, source, reason))

    print("\nDownload summary:")
    print(f"  reused: {methods['existing']}")
    print(f"  direct: {methods['direct']}")
    print(f"  wsrv:   {methods['wsrv']}")
    print(f"  failed: {len(failures)}")

    if failures:
        write_failures(failures)
        print(f"\nNot finalized: {len(failures)} unique remote image(s) still failed.")
        print(f"Failure report: {FAIL_PATH}")
        print("Successful downloads were kept in images/remote; run LOCALIZE_IMAGES.bat again to resume.")
        return 2

    # Only after every image is local do we switch the registry. This keeps the working V1 valid on failure.
    change_note = f"本地化時重新編碼為 WebP（最長邊不超過 {MAX_EDGE}px），供離線與節省手機流量使用。"
    for pid, photo in remote_records:
        old = str(photo["src"])
        photo["src"] = url_to_local[old]
        existing = str(photo.get("changes") or "").strip()
        if change_note not in existing:
            photo["changes"] = (existing + (" " if existing else "") + change_note).strip()

    # Transactional backup for the metadata phase.
    backup = TRIP_PATH.with_suffix(".json.before-localize")
    shutil.copy2(TRIP_PATH, backup)
    try:
        TRIP_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        run_tool("generate_source_index.py")
        run_tool("generate_photo_sources.py")
        run_tool("validate_project.py")
        remaining = [pid for pid, p in photos.items() if isinstance(p, dict) and is_remote(p.get("src"))]
        if remaining:
            raise RuntimeError("Remote photo URLs remain: " + ", ".join(remaining))
        build_zip()
    except Exception:
        shutil.copy2(backup, TRIP_PATH)
        raise
    finally:
        backup.unlink(missing_ok=True)

    print("\nDone: all photo src values are local WebP files.")
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
