#!/usr/bin/env python3
"""PRIVATE owner-only structural recovery check for a LOCAL Kandorty .json.gpg backup.

Reads and decrypts the owner's file in memory. No plaintext data is saved,
uploaded, written to logs or exposed. Never contacts Firebase, cloud or GitHub.
NOT a true Firestore restore, managed export, or point-in-time snapshot.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

PROJECT = "kandorty-9378a"
COLLECTIONS = ("orders", "tracking", "order_edits", "order_access", "order_lifecycle")
DEFAULT_BACKUP = Path.home() / "kandorty-private-backups" / "kandorty-orders-20261110T103014Z.json.gpg"
MAX_CIPHERTEXT_BYTES = 200 * 1024 * 1024
MAX_PLAINTEXT_BYTES = 500 * 1024 * 1024


class UnsafeBackupError(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise UnsafeBackupError(reason)


def review_structure(data):
    """Return aggregate counts only; never return an order ID or customer data."""
    require(isinstance(data, dict), "incorrect_backup_json")
    require(data.get("format") == "kandorty-firestore-rest-json-v1", "format_mismatch")
    require(data.get("sourceProject") == PROJECT, "wrong_firebase_project")
    require(data.get("database") == "(default)", "wrong_database")
    collections = data.get("collections")
    require(isinstance(collections, dict) and set(collections) == set(COLLECTIONS),
            "unexpected_or_missing_collection")
    names = {}
    statuses = {}
    counts = {}
    for collection in COLLECTIONS:
        docs = collections[collection]
        require(isinstance(docs, list) and len(docs) <= 20000, "invalid_collection_size")
        unique = set()
        values = {}
        prefix = f"projects/{PROJECT}/databases/(default)/documents/{collection}/"
        for doc in docs:
            require(isinstance(doc, dict), "invalid_document_shape")
            name = doc.get("name", "")
            require(isinstance(name, str) and name.startswith(prefix),
                    "document_outside_expected_collection")
            # Explicitly reject nested paths, duplicates and empty IDs.
            id_part = name[len(prefix):]
            require(bool(id_part) and "/" not in id_part, "nested_or_invalid_document")
            require(id_part not in unique, "duplicate_document")
            unique.add(id_part)
            fields = doc.get("fields")
            require(isinstance(fields, dict), "invalid_firestore_fields")
            if collection in ("orders", "tracking"):
                status = fields.get("status")
                require(isinstance(status, dict) and isinstance(status.get("stringValue"), str),
                        "missing_status")
                values[id_part] = status["stringValue"]
        names[collection] = unique
        statuses[collection] = values
        counts[collection] = len(docs)

    require(counts["orders"] >= 99, "below_confirmed_99_orders")
    require(names["orders"] == names["tracking"], "tracking_order_ids_mismatch")
    require(statuses["orders"] == statuses["tracking"], "tracking_status_mismatch")
    total = sum(counts.values())
    require(total >= counts["orders"] * 2, "document_count_mismatch")
    return {
        "orders": counts["orders"],
        "tracking": counts["tracking"],
        "total": total,
        "matching_statuses": counts["orders"],
        "other_collection_total": total - counts["orders"] - counts["tracking"],
    }


def inspect_encrypted_file(path):
    require(shutil.which("gpg") is not None, "gpg_unavailable")
    require(path.is_file() and not path.is_symlink() and path.name.endswith(".json.gpg"),
            "encrypted_backup_file_not_found")
    size = path.stat().st_size
    require(0 < size <= MAX_CIPHERTEXT_BYTES, "unsafe_backup_file_size")
    # GPG handles passphrase prompting locally; do not log passphrase or stderr.
    # The process must succeed: partial or unauthenticated plaintext is rejected.
    result = subprocess.run(["gpg", "--quiet", "--decrypt", str(path)],
                            capture_output=True, check=False, timeout=240)
    require(result.returncode == 0, "password_or_encrypted_integrity_check_failed")
    require(0 < len(result.stdout) <= MAX_PLAINTEXT_BYTES, "unsafe_json_size")
    try:
        parsed = json.loads(result.stdout)
    except (ValueError, UnicodeDecodeError):
        raise UnsafeBackupError("invalid_decrypted_json") from None
    summary = review_structure(parsed)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return summary, digest


def main():
    print("KANDORTY_OWNER_BACKUP_OFFLINE_REVIEW — NO FIREBASE WRITES")
    print("Only aggregate counts and encrypted SHA256 will be printed.")
    path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_BACKUP
    summary, digest = inspect_encrypted_file(path)
    print("BACKUP_ENCRYPTED_AND_READABLE: YES")
    print("BACKUP_STRUCTURE_VERIFIED: YES")
    print("SOURCE_PROJECT_CONFIRMED: YES")
    print("ORDERS_SAVED:", summary["orders"])
    print("TRACKING_SAVED:", summary["tracking"])
    print("TRACKING_MATCHING_STATUS:", summary["matching_statuses"])
    print("TOTAL_DOCUMENTS:", summary["total"])
    print("OTHER_RELATED_DOCUMENTS:", summary["other_collection_total"])
    print("ENCRYPTED_SHA256:", digest)
    print("WARNING: Not a managed Firestore export, complete recovery test or point-in-time snapshot.")
    print("KEEP THE ENCRYPTED FILE AND ITS PASSWORD PRIVATE.")


if __name__ == "__main__":
    try:
        main()
    except (UnsafeBackupError, OSError, subprocess.TimeoutExpired) as e:
        # Only internal validation error codes, never gpg stderr or customer data.
        code = str(e) if isinstance(e, UnsafeBackupError) else "local_file_or_gpg_error"
        print("BACKUP_OFFLINE_REVIEW_FAILED:", code, file=sys.stderr)
        sys.exit(2)
