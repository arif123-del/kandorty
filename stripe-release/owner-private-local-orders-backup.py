#!/usr/bin/env python3
"""Owner-only, read-only, encrypted JSON backup of Kandorty order collections.

No Cloud Storage bucket or Cloud Billing account is needed. Runs only on the
owner's authenticated Cloud Shell. Never print, commit, or upload customer data.
This is NOT a managed Firestore export or transactionally consistent snapshot.
"""
import datetime
import getpass
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen

PROJECT = "kandorty-9378a"
COLLECTIONS = ("orders", "tracking", "order_edits", "order_access", "order_lifecycle")
ROOT = f"projects/{PROJECT}/databases/(default)/documents"
API_ROOT = f"https://firestore.googleapis.com/v1/{ROOT}"
MAX_DOCUMENTS = 20000


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def call_gcloud_token():
    result = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        capture_output=True, text=True, check=False
    )
    require(result.returncode == 0, "Cannot get a Cloud Shell Google access token.")
    token = result.stdout.strip()
    require(len(token) > 20, "Google access token is missing.")
    return token


def read_page(collection, token, page_token=""):
    params = {"pageSize": 250}
    if page_token:
        params["pageToken"] = page_token
    url = f"{API_ROOT}/{quote(collection, safe='')}?{urlencode(params)}"
    request = Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    })
    try:
        with urlopen(request, timeout=45) as response:
            return json.load(response)
    except HTTPError as exc:
        # Never print API response bodies, tokens, or customer data.
        raise RuntimeError(
            f"Firestore read of {collection} failed with HTTP {exc.code}; "
            "verify account access and Firestore API availability."
        ) from None
    except URLError:
        raise RuntimeError("Network error reading Firestore; no backup was completed.") from None


def collect_documents(collection, token):
    results = []
    page_token = ""
    used_tokens = set()
    while True:
        response = read_page(collection, token, page_token)
        require(isinstance(response, dict), "Unexpected Firestore response.")
        documents = response.get("documents", [])
        require(isinstance(documents, list), "Unexpected Firestore document list.")
        for doc in documents:
            require(
                isinstance(doc, dict) and
                str(doc.get("name", "")).startswith(f"{ROOT}/{collection}/"),
                "Firestore returned an unexpected document path."
            )
        results.extend(documents)
        require(len(results) <= MAX_DOCUMENTS, "Document safety limit exceeded; backup stopped.")
        new_token = response.get("nextPageToken") or ""
        if not new_token:
            break
        require(new_token not in used_tokens, "Repeated Firestore page token; backup stopped.")
        used_tokens.add(new_token)
        page_token = new_token
    return results


def gpg_with_secret(secret, arguments, input_data=None):
    read_fd, write_fd = os.pipe()
    try:
        os.write(write_fd, (secret + "\n").encode("utf-8"))
        os.close(write_fd)
        write_fd = -1
        return subprocess.run(
            ["gpg", "--batch", "--yes", "--quiet", "--pinentry-mode", "loopback",
             "--passphrase-fd", str(read_fd)] + arguments,
            input=input_data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            pass_fds=(read_fd,), check=False
        )
    finally:
        os.close(read_fd)
        if write_fd >= 0:
            os.close(write_fd)


def main():
    os.umask(0o077)
    require(sys.stdin.isatty(), "Run interactively in your own Cloud Shell.")
    require(shutil.which("gcloud") is not None, "gcloud is required.")
    require(shutil.which("gpg") is not None, "GnuPG (gpg) is required.")
    print("Kandorty private local JSON backup — READ ONLY.")
    print("Includes private customer contact, location, orders and access records.")
    print("Collections: " + ", ".join(COLLECTIONS))
    print("Not a full Firestore export; nested subcollections are not included.")
    print("No production database changes. Never upload backup to chat or GitHub.")
    approval = input("Type BACKUP_ORDERS to begin: ").strip()
    require(approval == "BACKUP_ORDERS", "Cancelled; no backup created.")

    token = call_gcloud_token()
    data_by_collection = {}
    total = 0
    for collection in COLLECTIONS:
        docs = collect_documents(collection, token)
        data_by_collection[collection] = docs
        total += len(docs)
        require(total <= MAX_DOCUMENTS, "Too many documents; backup stopped.")
        print(f"READ_ONLY_COUNT {collection}: {len(docs)}")
    require(
        len(data_by_collection["orders"]) >= 98,
        "Order count is unexpectedly below prior 98-order baseline; no backup saved."
    )

    exported = {
        "format": "kandorty-firestore-rest-json-v1",
        "sourceProject": PROJECT,
        "database": "(default)",
        "exportedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "consistency": "sequential per-collection reads, NOT a point-in-time snapshot",
        "scope": "five top-level collections; excludes subcollections and other data",
        "collections": data_by_collection,
    }
    plaintext = json.dumps(exported, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    secret = getpass.getpass("Create a PRIVATE backup password (12+ characters): ")
    require(len(secret) >= 12, "Password must have at least 12 characters.")
    confirm = getpass.getpass("Re-enter password: ")
    require(secret == confirm, "Passwords did not match. No backup saved.")

    folder = Path.home() / "kandorty-private-backups"
    folder.mkdir(mode=0o700, exist_ok=True)
    folder.chmod(0o700)
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    outfile = folder / f"kandorty-orders-{timestamp}.json.gpg"
    require(not outfile.exists(), "Backup name already exists.")
    try:
        encrypted = gpg_with_secret(
            secret,
            ["--symmetric", "--cipher-algo", "AES256", "--output", str(outfile)],
            plaintext
        )
        require(encrypted.returncode == 0 and outfile.exists(), "GPG encryption failed.")
        outfile.chmod(0o600)
        check = gpg_with_secret(secret, ["--decrypt", str(outfile)])
        require(
            check.returncode == 0 and hashlib.sha256(check.stdout).digest() ==
            hashlib.sha256(plaintext).digest(),
            "Encrypted backup verification failed."
        )
    except Exception:
        outfile.unlink(missing_ok=True)
        raise

    print(f"BACKUP_VERIFIED: YES")
    print(f"ORDERS_SAVED: {len(data_by_collection['orders'])}")
    print(f"TOTAL_DOCUMENTS: {total}")
    print(f"ENCRYPTED_FILE: {outfile}")
    print(f"ENCRYPTED_SHA256: {hashlib.sha256(outfile.read_bytes()).hexdigest()}")
    print("KEEP PASSWORD PRIVATE. Download the .gpg file from Cloud Shell to a safe device.")
    print("The file is encrypted; no plaintext backup was written to disk.")
    print("This is not a substitute for the official Firestore managed export.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError) as exc:
        print(f"BACKUP_NOT_COMPLETED: {exc}", file=sys.stderr)
        sys.exit(2)
