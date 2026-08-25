#!/usr/bin/env python3
"""Upload a frozen MSYS2 environment package and pointer files to Aliyun OSS.

Order is fixed: archive -> versioned msys installer -> stable msys installer
-> env/current.txt -> root msys-version.txt (last), so clients never see a new
fingerprint before the matching package is available.
"""

import os
import sys

try:
    import oss2  # ty: ignore[unresolved-import]
except ImportError:
    raise SystemExit("oss2 is not installed; run: python -m pip install oss2") from None


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def _upload_file(bucket: oss2.Bucket, key: str, path: str, headers: dict[str, str]) -> None:
    if not os.path.isfile(path):
        raise SystemExit(f"File not found: {path}")
    bucket.put_object_from_file(key, path, headers=headers)


def main() -> None:
    access_key_id = _require_env("ALIYUN_ACCESS_KEY_ID")
    access_key_secret = _require_env("ALIYUN_ACCESS_KEY_SECRET")
    bucket_name = _require_env("ALIYUN_OSS_BUCKET")
    endpoint = _require_env("ALIYUN_OSS_ENDPOINT")
    fingerprint = _require_env("MSYS_FINGERPRINT")
    archive_path = _require_env("MSYS_ARCHIVE_PATH")
    setup_path = _require_env("MSYS_SETUP_PATH")

    prefix = os.environ.get("ALIYUN_OSS_PREFIX", "").strip().strip("/")
    if prefix in ("", ".", "-", "root", "ROOT"):
        prefix = ""

    def key(name: str) -> str:
        return f"{prefix}/{name}" if prefix else name

    auth = oss2.Auth(access_key_id, access_key_secret)
    bucket = oss2.Bucket(auth, endpoint, bucket_name)

    exe_headers = {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=300",
        "x-oss-object-acl": "public-read",
    }
    text_headers = {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "x-oss-object-acl": "public-read",
    }

    _upload_file(bucket, key(f"env/msys64-{fingerprint}.zip"), archive_path, exe_headers)
    _upload_file(bucket, key(f"env/msys-setup-{fingerprint}.exe"), setup_path, exe_headers)
    _upload_file(bucket, key("msys-setup.exe"), setup_path, exe_headers)
    bucket.put_object(key("env/current.txt"), fingerprint + "\n", headers=text_headers)
    bucket.put_object(key("msys-version.txt"), fingerprint + "\n", headers=text_headers)


if __name__ == "__main__":
    sys.exit(main())
